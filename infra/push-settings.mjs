#!/usr/bin/env node
// Pose les réglages des notifications push (S26) sans jamais afficher de secret :
//   - sur Static Web Apps : la clé APNs (.p8, en base64), son Key ID, le Team ID, le bundle ID,
//     et un secret partagé avec la tâche planifiée ;
//   - sur GitHub : ce même secret (PUSH_CRON_SECRET), lu par .github/workflows/reminders.yml.
//
// La clé reste sur ton disque ; elle ne passe ni par le dépôt, ni par le chat.
// Relancer le script change le secret partagé (aux deux endroits à la fois) : sans danger.
//
// Prérequis : Azure CLI sur l'abonnement Azure for Students (compte HAL), et gh connecté.
//
//   node infra/push-settings.mjs ~/chemin/vers/AuthKey_XXXXXXXXXX.p8

import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename } from "node:path";

const RG = "rg-shukatsu-pilot";
const REPO = "simondepussay/shukatsu-pilot";
const TEAM_ID = "QC5N2H4TK6";
const TOPIC = "com.simondepussay.ShukatsuPilot";

const path = process.argv[2];
const keyId = basename(path ?? "").match(/^AuthKey_([A-Z0-9]{10})\.p8$/)?.[1];
if (!path || !keyId) {
  console.error("Usage : node infra/push-settings.mjs <chemin>/AuthKey_XXXXXXXXXX.p8 (le Key ID est lu dans le nom du fichier)");
  process.exit(1);
}
const pem = readFileSync(path, "utf8");
if (!pem.includes("-----BEGIN PRIVATE KEY-----")) {
  console.error("Ce fichier ne ressemble pas à une clé APNs (.p8).");
  process.exit(1);
}

const az = (args) => execFileSync("az", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const web = az(["staticwebapp", "list", "-g", RG, "--query", "[0].name", "-o", "tsv"]);
const cronSecret = randomBytes(32).toString("hex");

const settings = {
  APNS_KEY: Buffer.from(pem).toString("base64"),
  APNS_KEY_ID: keyId,
  APNS_TEAM_ID: TEAM_ID,
  APNS_TOPIC: TOPIC,
  PUSH_CRON_SECRET: cronSecret,
};
az(["staticwebapp", "appsettings", "set", "-g", RG, "-n", web, "--setting-names",
  ...Object.entries(settings).map(([k, v]) => `${k}=${v}`), "-o", "none"]);
console.log(`✅ Réglages posés sur ${web} : ${Object.keys(settings).join(", ")} (Key ID ${keyId})`);

// Le secret passe par l'entrée standard : il n'apparaît pas dans la liste des processus.
execFileSync("gh", ["secret", "set", "PUSH_CRON_SECRET", "--repo", REPO], { input: cronSecret, stdio: ["pipe", "ignore", "inherit"] });
console.log(`✅ Secret GitHub PUSH_CRON_SECRET posé sur ${REPO}`);
