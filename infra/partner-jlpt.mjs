#!/usr/bin/env node
// Permet de se connecter à JLPT Étude (https://jlpt.simondepussay.com) avec son compte Clean Work.
//
//   • « JLPT Étude Web » : application monopage de l'annuaire, qui ne demande que l'identité
//     (openid, profile, email) — elle n'a aucun accès à l'API ni aux données de Clean Work ;
//   • consentement administrateur, pour qu'aucun écran d'autorisation ne s'affiche ;
//   • ajout au parcours « email + mot de passe », celui de Clean Work.
//
// Quelqu'un de déjà connecté à Clean Work dans son navigateur arrive ainsi connecté à
// JLPT Étude sans rien retaper. JLPT Étude vérifie lui-même le jeton d'identité.
//
// Prérequis : az login --tenant <ID de l'annuaire> --allow-no-subscriptions
//             avec le compte administrateur de l'annuaire.
//
//   node infra/partner-jlpt.mjs
//
// Relançable : ce qui existe déjà est retrouvé par son nom et mis à jour, pas recréé.
// Ne touche à aucune autre application de l'annuaire. L'identifiant affiché est public.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const { tenantId: TENANT_ID } = JSON.parse(readFileSync(join(ROOT, "infra", "identity.json"), "utf8"));
const APP_NAME = "JLPT Étude Web";
const ORIGINS = ["https://jlpt.simondepussay.com", "http://localhost:8766"];
const FLOW_NAME = "Shukatsu - email et mot de passe";

const MS_GRAPH_APP_ID = "00000003-0000-0000-c000-000000000000";
const OPENID = "37f7f235-527c-4136-accd-4a02d197296e";
const PROFILE = "14dad69e-099b-42c9-810b-d002981feec1";
const EMAIL = "64a6cdd6-aab1-4aaf-94b8-3cc8405e90d0";

let token;
try {
  token = execFileSync("az", ["account", "get-access-token", "--tenant", TENANT_ID, "--resource-type", "ms-graph", "--query", "accessToken", "-o", "tsv"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
} catch {
  console.error(`Azure CLI n'a pas de session sur l'annuaire ${TENANT_ID}.`);
  console.error(`Lance : az login --tenant ${TENANT_ID} --allow-no-subscriptions`);
  process.exit(1);
}

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

console.log(`▶ ${APP_NAME}`);
const settings = {
  displayName: APP_NAME,
  signInAudience: "AzureADMyOrg",
  spa: { redirectUris: ORIGINS.map((o) => `${o}/`) },
  requiredResourceAccess: [{
    resourceAppId: MS_GRAPH_APP_ID,
    resourceAccess: [OPENID, PROFILE, EMAIL].map((id) => ({ id, type: "Scope" })),
  }],
  // L'adresse e-mail dans le jeton d'identité : JLPT Étude l'affiche dans « Mon compte ».
  optionalClaims: { idToken: [{ name: "email", essential: false }] },
};
let app = (await graph("GET", `/applications?${filter(`displayName eq '${APP_NAME}'`)}`)).value[0];
if (app) await graph("PATCH", `/applications/${app.id}`, settings);
else app = await graph("POST", "/applications", settings);
console.log(`  client ID : ${app.appId}`);

const principalOf = async (appId) => {
  const found = await graph("GET", `/servicePrincipals?${filter(`appId eq '${appId}'`)}`);
  return found.value[0]?.id ?? (await graph("POST", "/servicePrincipals", { appId })).id;
};
const client = await principalOf(app.appId);
const graphPrincipal = await principalOf(MS_GRAPH_APP_ID);

console.log("▶ Consentement administrateur (openid profile email)");
const grants = await graph("GET", `/oauth2PermissionGrants?${filter(`clientId eq '${client}'`)}`);
const grant = grants.value.find((g) => g.resourceId === graphPrincipal && g.consentType === "AllPrincipals");
if (grant) await graph("PATCH", `/oauth2PermissionGrants/${grant.id}`, { scope: "openid profile email" });
else await graph("POST", "/oauth2PermissionGrants", { clientId: client, consentType: "AllPrincipals", resourceId: graphPrincipal, scope: "openid profile email" });

console.log(`▶ Parcours « ${FLOW_NAME} »`);
const flow = (await graph("GET", "/identity/authenticationEventsFlows")).value.find((f) => f.displayName === FLOW_NAME);
if (!flow) {
  console.log(`  ⚠︎ Parcours introuvable. Dans le portail Entra : Flux d'utilisateurs > ${FLOW_NAME} > Applications > Ajouter > ${APP_NAME}.`);
} else {
  try {
    await graph("POST", `/identity/authenticationEventsFlows/${flow.id}/conditions/applications/includeApplications`, {
      "@odata.type": "#microsoft.graph.authenticationConditionApplication",
      appId: app.appId,
    });
    console.log("  application ajoutée au parcours");
  } catch (error) {
    if (error.status === 409 || /already|exist/i.test(error.message)) console.log("  déjà dans le parcours");
    else throw error;
  }
}

writeFileSync(join(ROOT, "infra", "partner-jlpt.json"), `${JSON.stringify({ tenantId: TENANT_ID, jlptClientId: app.appId, origins: ORIGINS }, null, 2)}\n`);
console.log("\n✅ Prêt. Identifiant écrit dans infra/partner-jlpt.json.");
console.log("Dans JLPT Étude : web/app/config.js → cleanwork.clientId, et côté API :");
console.log(`  CLEANWORK_CLIENT_ID=${app.appId} CLEANWORK_TENANT_ID=${TENANT_ID} CLEANWORK_TENANT=<sous-domaine de l'annuaire>`);
