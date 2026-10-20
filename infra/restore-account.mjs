#!/usr/bin/env node
// Restaure un compte supprimé depuis moins de 30 jours (S25) : le compte dans
// l'annuaire (corbeille de Microsoft Entra) puis ses données dans Cosmos DB.
//
//   node infra/restore-account.mjs --list        comptes dans la corbeille, jours restants
//   node infra/restore-account.mjs <userId>      restaure ce compte et ses données
//
// Prérequis : Azure CLI connecté aux deux comptes (session iCloud pour l'annuaire,
// session HAL pour l'abonnement). Le script n'en change pas : il passe --subscription.

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const { CosmosClient } = createRequire(join(ROOT, "api", "package.json"))("@azure/cosmos");
const identity = JSON.parse(readFileSync(join(ROOT, "infra", "identity.json"), "utf8"));

const SUBSCRIPTION = "eb020e02-d673-4a15-81f6-f8a50ab8c5b1";
const RG = "rg-shukatsu-pilot";
const CONTAINERS = ["profiles", "applications", "drafts", "reviews"];
const RETENTION_DAYS = 30;

const az = (args) => execFileSync("az", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

async function graph(method, path) {
  const token = az(["account", "get-access-token", "--subscription", identity.tenantId, "--resource-type", "ms-graph",
    "--query", "accessToken", "-o", "tsv"]);
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, { method, headers: { Authorization: `Bearer ${token}` } });
  const text = await res.text();
  if (!res.ok) throw Object.assign(new Error(`${method} ${path} → ${res.status} ${text.slice(0, 200)}`), { status: res.status });
  return text ? JSON.parse(text) : null;
}

const arg = process.argv[2];
if (!arg) {
  console.error("Usage : node infra/restore-account.mjs --list | <userId>");
  process.exit(1);
}

if (arg === "--list") {
  const { value } = await graph("GET", "/directory/deletedItems/microsoft.graph.user?$select=id,displayName,mail,deletedDateTime");
  if (value.length === 0) console.log("Corbeille vide.");
  for (const u of value) {
    const left = RETENTION_DAYS - Math.floor((Date.now() - Date.parse(u.deletedDateTime)) / 86400e3);
    console.log(`${u.id}  ${u.displayName}  supprimé le ${u.deletedDateTime.slice(0, 10)}  (${left} jour(s) restant(s))`);
  }
  process.exit(0);
}

const userId = arg;

// 1. Annuaire : le compte retrouve le même identifiant (oid), donc ses données.
try {
  await graph("POST", `/directory/deletedItems/${encodeURIComponent(userId)}/restore`);
  console.log("✅ Compte restauré dans l'annuaire");
} catch (e) {
  if (e.status !== 404) throw e;
  console.log("ℹ︎ Compte absent de la corbeille (déjà restauré, ou plus de 30 jours)");
}

// 2. Cosmos DB : on retire la marque de suppression et la durée de vie.
const name = az(["cosmosdb", "list", "--subscription", SUBSCRIPTION, "-g", RG, "--query", "[0].name", "-o", "tsv"]);
const endpoint = az(["cosmosdb", "show", "--subscription", SUBSCRIPTION, "-g", RG, "-n", name, "--query", "documentEndpoint", "-o", "tsv"]);
const key = az(["cosmosdb", "keys", "list", "--subscription", SUBSCRIPTION, "-g", RG, "-n", name, "--query", "primaryMasterKey", "-o", "tsv"]);
const db = new CosmosClient({ endpoint, key }).database("shukatsu");

let total = 0;
for (const container of CONTAINERS) {
  const { resources } = await db.container(container).items.query(
    { query: "SELECT * FROM c WHERE c.userId = @u AND IS_DEFINED(c.deletedAt)", parameters: [{ name: "@u", value: userId }] },
    { partitionKey: userId },
  ).fetchAll();
  for (const doc of resources) {
    const { deletedAt, ttl, _rid, _self, _etag, _attachments, _ts, ...rest } = doc;
    await db.container(container).items.upsert(rest);
  }
  total += resources.length;
}
console.log(`✅ ${total} document(s) restauré(s) dans Cosmos DB`);
