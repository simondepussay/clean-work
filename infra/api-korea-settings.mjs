#!/usr/bin/env node
/**
 * Recopie les réglages de l'API (Cosmos, annuaire, IA, APNs, secrets…) de Static Web Apps vers
 * la Function App de Séoul (infra/api-korea.bicep), et ajoute ceux propres à Functions.
 *
 * Aucun secret n'est affiché : les valeurs passent par un fichier temporaire lisible par le seul
 * utilisateur, effacé aussitôt. À relancer après chaque changement de réglage côté Static Web Apps
 * (ou poser le réglage directement sur les deux).
 *
 *   node infra/api-korea-settings.mjs
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const GROUP = "rg-shukatsu-pilot";
const SWA = "swa-shukatsu-ijdqobb4nlsxu";
const FUNC = "func-shukatsu-ijdqobb4nlsxu";
const STORAGE = "stshukatsuijdqobb4nlsx";

const az = (...args) => execFileSync("az", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

const current = JSON.parse(az("staticwebapp", "appsettings", "list", "-n", SWA, "-g", GROUP, "--query", "properties", "-o", "json"));
const settings = {
  ...current,
  // Hôte Functions : stockage par identité (pas de clé), voir infra/api-korea.bicep.
  AzureWebJobsStorage__accountName: STORAGE,
};

const dir = mkdtempSync(join(tmpdir(), "cw-settings-"));
const file = join(dir, "settings.json");
try {
  writeFileSync(file, JSON.stringify(settings), { mode: 0o600 });
  az("functionapp", "config", "appsettings", "set", "-n", FUNC, "-g", GROUP, "--settings", `@${file}`, "-o", "none");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
console.log(`${Object.keys(settings).length} réglages posés sur ${FUNC} : ${Object.keys(settings).sort().join(", ")}`);
