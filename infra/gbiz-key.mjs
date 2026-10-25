#!/usr/bin/env node
// Pose le jeton de l'API gBizINFO (GBIZ_API_TOKEN) sur la Static Web App : fiche officielle des entreprises.
// La clé est demandée dans le Terminal, sans s'afficher, et n'est jamais écrite ailleurs.
//
//   node infra/gbiz-key.mjs

import { execFileSync } from "node:child_process";
import { createInterface } from "node:readline";

const RG = "rg-shukatsu-pilot";
const az = (args) => execFileSync("az", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

/** Lit une ligne sans l'afficher (comme un mot de passe). */
function askHidden(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    process.stdout.write(question);
    rl._writeToOutput = () => {};
    rl.question("", (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer.trim());
    });
  });
}

const key = await askHidden("Jeton API gBizINFO (il ne s'affiche pas) : ");
if (!/^[A-Za-z0-9._~+/=-]{16,}$/.test(key)) {
  console.error("Ça ne ressemble pas à un jeton (au moins 16 caractères, sans espace). Rien n'a été changé.");
  process.exit(1);
}
const web = az(["staticwebapp", "list", "-g", RG, "--query", "[0].name", "-o", "tsv"]);
az(["staticwebapp", "appsettings", "set", "-g", RG, "-n", web, "--setting-names", `GBIZ_API_TOKEN=${key}`, "-o", "none"]);
console.log(`✅ GBIZ_API_TOKEN posée sur ${web}`);
