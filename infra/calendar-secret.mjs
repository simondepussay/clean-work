#!/usr/bin/env node
// Crée le secret qui signe les liens d'abonnement de calendrier (CALENDAR_FEED_SECRET),
// SEULEMENT s'il n'existe pas encore : le changer casserait tous les liens déjà ajoutés
// à Google, Apple ou Outlook. Pour révoquer tous les liens (fuite), passer --rotate.
//
//   node infra/calendar-secret.mjs [--rotate]

import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";

const RG = "rg-shukatsu-pilot";
const az = (args) => execFileSync("az", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const web = az(["staticwebapp", "list", "-g", RG, "--query", "[0].name", "-o", "tsv"]);
const names = JSON.parse(az(["staticwebapp", "appsettings", "list", "-g", RG, "-n", web, "--query", "keys(properties)", "-o", "json"]));

if (names.includes("CALENDAR_FEED_SECRET") && !process.argv.includes("--rotate")) {
  console.log("CALENDAR_FEED_SECRET existe déjà : rien à faire (--rotate pour le remplacer).");
  process.exit(0);
}
az(["staticwebapp", "appsettings", "set", "-g", RG, "-n", web, "--setting-names",
  `CALENDAR_FEED_SECRET=${randomBytes(32).toString("hex")}`, "-o", "none"]);
console.log(`✅ CALENDAR_FEED_SECRET posé sur ${web}`);
