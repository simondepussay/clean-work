#!/usr/bin/env node
// Un secret par tâche planifiée (rappels, 情報, rapport, bêta) au lieu du seul PUSH_CRON_SECRET :
// une fuite n'ouvre plus qu'une route. Chaque secret est posé au même endroit des deux côtés :
// réglage de la Static Web App (l'API le vérifie) et secret du dépôt GitHub (le workflow l'envoie).
// Les secrets ne s'affichent jamais et ne sont écrits nulle part ailleurs.
//
//   node infra/cron-secrets.mjs            pose les secrets qui manquent
//   node infra/cron-secrets.mjs --rotate   les remplace tous (fuite, départ d'un collaborateur…)
//
// Une fois les quatre posés et un matin passé sans erreur, PUSH_CRON_SECRET peut être retiré
// (réglage de la Static Web App et secret GitHub) : plus rien ne s'en sert.

import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";

const RG = "rg-shukatsu-pilot";
const TASKS = ["PUSH", "INFO", "REPORT", "BETA"];
const az = (args) => execFileSync("az", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const gh = (args, input) => execFileSync("gh", args, { encoding: "utf8", input, stdio: ["pipe", "pipe", "pipe"] }).trim();

const web = az(["staticwebapp", "list", "-g", RG, "--query", "[0].name", "-o", "tsv"]);
const onAzure = JSON.parse(az(["staticwebapp", "appsettings", "list", "-g", RG, "-n", web, "--query", "keys(properties)", "-o", "json"]));
const onGitHub = gh(["secret", "list", "--json", "name", "-q", ".[].name"]).split("\n");
const rotate = process.argv.includes("--rotate");

for (const task of TASKS) {
  const name = `CRON_SECRET_${task}`;
  if (!rotate && onAzure.includes(name) && onGitHub.includes(name)) {
    console.log(`${name} existe déjà : rien à faire.`);
    continue;
  }
  const secret = randomBytes(32).toString("hex");
  az(["staticwebapp", "appsettings", "set", "-g", RG, "-n", web, "--setting-names", `${name}=${secret}`, "-o", "none"]);
  // Par l'entrée standard : le secret n'apparaît pas dans la liste des processus.
  gh(["secret", "set", name], secret);
  console.log(`✅ ${name} posé sur ${web} et sur le dépôt GitHub`);
}
