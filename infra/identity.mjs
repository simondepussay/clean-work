#!/usr/bin/env node
// Prépare l'annuaire External ID de Shukatsu Pilot (S02) :
//   • « Shukatsu API » représente l'API et définit la permission « access » ;
//   • « Shukatsu Web » est l'app web (application monopage, connexion par redirection) ;
//   • « Shukatsu iOS » est l'app iPhone, client public, authentification native activée ;
//   • le consentement administrateur évite tout écran d'autorisation à l'utilisateur ;
//   • le code par email est activé (« mot de passe oublié » en dépend) ;
//   • le parcours d'inscription et de connexion « email + mot de passe ».
//
// Adapté du script de Kanji Otter (même principe, autre annuaire).
//
// Prérequis : az login --tenant <ID de l'annuaire> --allow-no-subscriptions
//             avec le compte administrateur de l'annuaire.
//
//   node infra/identity.mjs <ID de l'annuaire>
//
// Relançable : ce qui existe déjà est retrouvé par son nom et mis à jour, pas recréé.
// Les identifiants écrits dans infra/identity.json et web/src/auth/identity.json sont
// publics (ce ne sont pas des secrets).

import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const TENANT_ID = process.argv[2];
if (!TENANT_ID) {
  console.error("Usage : node infra/identity.mjs <ID de l'annuaire>");
  process.exit(1);
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BUNDLE_ID = "com.simondepussay.ShukatsuPilot";
const WEB_ORIGINS = ["https://blue-rock-008b52800.2.azurestaticapps.net", "http://localhost:5173"];
const API_NAME = "Shukatsu API";
const WEB_NAME = "Shukatsu Web";
const IOS_NAME = "Shukatsu iOS";
const FLOW_NAME = "Shukatsu - email et mot de passe";
const SCOPE = "access";

const MS_GRAPH_APP_ID = "00000003-0000-0000-c000-000000000000";
const OPENID_SCOPE_ID = "37f7f235-527c-4136-accd-4a02d197296e";
const OFFLINE_ACCESS_SCOPE_ID = "7427e0e9-2fba-42fe-b0c0-848c9e6a8182";

// MARK: - Outils

function az(args) {
  return execFileSync("az", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

const currentTenant = az(["account", "show", "--query", "tenantId", "-o", "tsv"]);
if (currentTenant !== TENANT_ID) {
  console.error(`Azure CLI est connecté à l'annuaire ${currentTenant}, pas à ${TENANT_ID}.`);
  console.error(`Lance : az login --tenant ${TENANT_ID} --allow-no-subscriptions`);
  process.exit(1);
}

const token = az(["account", "get-access-token", "--resource-type", "ms-graph", "--query", "accessToken", "-o", "tsv"]);

async function graph(method, path, body) {
  const response = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    const error = new Error(`${method} ${path} → ${response.status} ${text.slice(0, 300)}`);
    error.status = response.status;
    throw error;
  }
  return text ? JSON.parse(text) : null;
}

const filter = (expression) => `$filter=${encodeURIComponent(expression)}`;

async function findApp(name) {
  return (await graph("GET", `/applications?${filter(`displayName eq '${name}'`)}`)).value[0];
}

/** Crée l'application ou met à jour ses réglages ; renvoie l'application. */
async function upsertApp(settings) {
  const existing = await findApp(settings.displayName);
  if (existing) {
    await graph("PATCH", `/applications/${existing.id}`, settings);
    return { ...existing, ...settings };
  }
  return graph("POST", "/applications", settings);
}

/** Principal de service d'une application, créé s'il manque ; renvoie son id. */
async function ensureServicePrincipal(appId) {
  const found = await graph("GET", `/servicePrincipals?${filter(`appId eq '${appId}'`)}`);
  return found.value[0]?.id ?? (await graph("POST", "/servicePrincipals", { appId })).id;
}

/** Consentement administrateur, pour tous les utilisateurs de l'annuaire. */
async function grantConsent(clientId, resourceId, scope) {
  const grants = await graph("GET", `/oauth2PermissionGrants?${filter(`clientId eq '${clientId}'`)}`);
  const existing = grants.value.find((g) => g.resourceId === resourceId && g.consentType === "AllPrincipals");
  if (existing) {
    await graph("PATCH", `/oauth2PermissionGrants/${existing.id}`, { scope });
  } else {
    await graph("POST", "/oauth2PermissionGrants", { clientId, consentType: "AllPrincipals", resourceId, scope });
  }
}

/** Étape qui peut échouer faute de droits : on explique au lieu d'arrêter. */
async function optionalStep(run, portalHint) {
  try {
    await run();
    return true;
  } catch (error) {
    console.log(`  ⚠︎ Pas possible d'ici (${error.status ?? "erreur"}). ${portalHint}`);
    return false;
  }
}

// MARK: - Annuaire

const organization = await graph("GET", "/organization");
const subdomain = organization.value[0].verifiedDomains.find((d) => d.isInitial).name.split(".")[0].toLowerCase();
console.log(`Annuaire : ${subdomain} (${TENANT_ID})`);

// MARK: - API

console.log(`▶ ${API_NAME}`);
let apiApp = await findApp(API_NAME);
if (!apiApp) {
  apiApp = await graph("POST", "/applications", {
    displayName: API_NAME,
    signInAudience: "AzureADMyOrg",
    api: {
      requestedAccessTokenVersion: 2,
      oauth2PermissionScopes: [{
        id: randomUUID(),
        value: SCOPE,
        type: "User",
        isEnabled: true,
        adminConsentDisplayName: "Accéder à Shukatsu Pilot",
        adminConsentDescription: "Permet à l'app de lire et d'écrire les données de l'utilisateur connecté.",
        userConsentDisplayName: "Accéder à tes données Shukatsu Pilot",
        userConsentDescription: "Permet à l'app de lire et d'écrire ton profil et tes candidatures.",
      }],
    },
  });
}
const scopeId = apiApp.api.oauth2PermissionScopes.find((s) => s.value === SCOPE).id;
await graph("PATCH", `/applications/${apiApp.id}`, { identifierUris: [`api://${apiApp.appId}`] });
const apiPrincipal = await ensureServicePrincipal(apiApp.appId);
console.log(`  client ID : ${apiApp.appId}`);

const requiredResourceAccess = [
  {
    resourceAppId: MS_GRAPH_APP_ID,
    resourceAccess: [{ id: OPENID_SCOPE_ID, type: "Scope" }, { id: OFFLINE_ACCESS_SCOPE_ID, type: "Scope" }],
  },
  { resourceAppId: apiApp.appId, resourceAccess: [{ id: scopeId, type: "Scope" }] },
];

// MARK: - Web

console.log(`▶ ${WEB_NAME}`);
const webApp = await upsertApp({
  displayName: WEB_NAME,
  signInAudience: "AzureADMyOrg",
  spa: { redirectUris: WEB_ORIGINS.map((o) => `${o}/`) },
  requiredResourceAccess,
});
const webPrincipal = await ensureServicePrincipal(webApp.appId);
console.log(`  client ID : ${webApp.appId}`);

// MARK: - iOS

console.log(`▶ ${IOS_NAME}`);
const iosApp = await upsertApp({
  displayName: IOS_NAME,
  signInAudience: "AzureADMyOrg",
  isFallbackPublicClient: true,
  nativeAuthenticationApisEnabled: "all",
  // Utilisée seulement si l'authentification native doit se replier sur le navigateur.
  publicClient: { redirectUris: [`msauth.${BUNDLE_ID}://auth`] },
  requiredResourceAccess,
});
const iosPrincipal = await ensureServicePrincipal(iosApp.appId);
console.log(`  client ID : ${iosApp.appId}`);

console.log("▶ Consentement administrateur");
const graphPrincipal = await ensureServicePrincipal(MS_GRAPH_APP_ID);
for (const client of [webPrincipal, iosPrincipal]) {
  await grantConsent(client, graphPrincipal, "openid offline_access");
  await grantConsent(client, apiPrincipal, SCOPE);
}

// MARK: - Code par email

console.log("▶ Code par email (nécessaire à « mot de passe oublié »)");
await optionalStep(
  () => graph("PATCH", "/policies/authenticationMethodsPolicy/authenticationMethodConfigurations/Email", {
    "@odata.type": "#microsoft.graph.emailAuthenticationMethodConfiguration",
    state: "enabled",
    includeTargets: [{ targetType: "group", id: "all_users" }],
  }),
  "Dans le portail Entra : Méthodes d'authentification > Code secret à usage unique par e-mail > Activer, pour tous les utilisateurs.",
);

// MARK: - Parcours email + mot de passe

console.log(`▶ Parcours « ${FLOW_NAME} »`);
const clients = [webApp.appId, iosApp.appId];
const flowHint = `Dans le portail Entra : Flux d'utilisateurs > Nouveau flux d'utilisateur > « Email avec mot de passe », puis Applications > Ajouter > ${WEB_NAME} et ${IOS_NAME}.`;
let flows = null;
await optionalStep(async () => { flows = await graph("GET", "/identity/authenticationEventsFlows"); }, flowHint);
if (flows) {
  const existing = flows.value.find((f) => f.displayName === FLOW_NAME);
  if (existing) {
    for (const appId of clients) {
      await graph("POST", `/identity/authenticationEventsFlows/${existing.id}/conditions/applications/includeApplications`, {
        "@odata.type": "#microsoft.graph.authenticationConditionApplication",
        appId,
      }).catch(() => {}); // 409 si elle y est déjà
    }
  } else {
    await optionalStep(() => graph("POST", "/identity/authenticationEventsFlows", {
      "@odata.type": "#microsoft.graph.externalUsersSelfServiceSignUpEventsFlow",
      displayName: FLOW_NAME,
      conditions: { applications: { includeApplications: clients.map((appId) => ({ appId })) } },
      onAuthenticationMethodLoadStart: {
        "@odata.type": "#microsoft.graph.onAuthenticationMethodLoadStartExternalUsersSelfServiceSignUp",
        identityProviders: [{ id: "EmailPassword-OAUTH" }],
      },
      onInteractiveAuthFlowStart: {
        "@odata.type": "#microsoft.graph.onInteractiveAuthFlowStartExternalUsersSelfServiceSignUp",
        isSignUpAllowed: true,
      },
      onAttributeCollection: {
        "@odata.type": "#microsoft.graph.onAttributeCollectionExternalUsersSelfServiceSignUp",
        attributes: [
          { id: "email", displayName: "Email Address", userFlowAttributeType: "builtIn", dataType: "string" },
          { id: "displayName", displayName: "Display Name", userFlowAttributeType: "builtIn", dataType: "string" },
        ],
        attributeCollectionPage: {
          views: [{
            inputs: [
              { attribute: "email", label: "Email Address", inputType: "text", hidden: true, editable: false, writeToDirectory: true, required: true },
              { attribute: "displayName", label: "Name / 名前", inputType: "text", hidden: false, editable: true, writeToDirectory: true, required: true },
            ],
          }],
        },
      },
    }), flowHint);
  }
}

// MARK: - Résultat

const apiScope = `api://${apiApp.appId}/${SCOPE}`;
const infra = { tenantId: TENANT_ID, tenantSubdomain: subdomain, apiClientId: apiApp.appId, apiScope, webClientId: webApp.appId, iosClientId: iosApp.appId };
const web = { configured: true, tenantId: TENANT_ID, tenantSubdomain: subdomain, webClientId: webApp.appId, apiScope };

writeFileSync(join(ROOT, "infra", "identity.json"), `${JSON.stringify(infra, null, 2)}\n`);
writeFileSync(join(ROOT, "web", "src", "auth", "identity.json"), `${JSON.stringify(web, null, 2)}\n`);

console.log("\n✅ Annuaire prêt. Identifiants écrits dans infra/identity.json et web/src/auth/identity.json :");
console.log(infra);
console.log("\nEnsuite, reconnecte Azure CLI à l'abonnement et redéploie l'infrastructure (réglages de l'API) :");
console.log("  az login --tenant 8d41d6d7-36ce-4e0c-8c6d-cf2c54c39039");
console.log("  az deployment group create -g rg-shukatsu-pilot -f infra/main.bicep");
