#!/usr/bin/env node
// Pose les réglages de l'API sur Static Web Apps : Cosmos DB, annuaire et Azure OpenAI.
// Les réglages existants qui ne sont pas listés ici (le secret de suppression des
// comptes, posé par identity.mjs) ne sont pas touchés.
//
// Prérequis : Azure CLI sur l'abonnement Azure for Students (compte HAL).
//
//   node infra/settings.mjs

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RG = "rg-shukatsu-pilot";
const identity = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "identity.json"), "utf8"));
const az = (args) => execFileSync("az", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

const web = az(["staticwebapp", "list", "-g", RG, "--query", "[0].name", "-o", "tsv"]);
const cosmos = az(["cosmosdb", "list", "-g", RG, "--query", "[0].name", "-o", "tsv"]);
const endpoint = az(["cosmosdb", "show", "-g", RG, "-n", cosmos, "--query", "documentEndpoint", "-o", "tsv"]);
const key = az(["cosmosdb", "keys", "list", "-g", RG, "-n", cosmos, "--query", "primaryMasterKey", "-o", "tsv"]);
const ai = az(["cognitiveservices", "account", "list", "-g", RG, "--query", "[?kind=='OpenAI'] | [0].name", "-o", "tsv"]);
const aiEndpoint = az(["cognitiveservices", "account", "show", "-g", RG, "-n", ai, "--query", "properties.endpoint", "-o", "tsv"]);
const aiKey = az(["cognitiveservices", "account", "keys", "list", "-g", RG, "-n", ai, "--query", "key1", "-o", "tsv"]);

const settings = {
  COSMOS_ENDPOINT: endpoint,
  COSMOS_KEY: key,
  COSMOS_DATABASE: "shukatsu",
  ENTRA_TENANT_ID: identity.tenantId,
  ENTRA_API_CLIENT_ID: identity.apiClientId,
  ENTRA_GRAPH_CLIENT_ID: identity.graphClientId ?? "",
  AI_ENDPOINT: aiEndpoint,
  AI_KEY: aiKey,
  AI_DEPLOYMENT: "review",
};

az(["staticwebapp", "appsettings", "set", "-g", RG, "-n", web, "--setting-names",
  ...Object.entries(settings).map(([k, v]) => `${k}=${v}`), "-o", "none"]);
console.log(`✅ Réglages posés sur ${web} : ${Object.keys(settings).join(", ")}`);
