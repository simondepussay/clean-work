#!/usr/bin/env node
// Pose la clé de l'API Jooble (JOOBLE_API_KEY) sur la Static Web App, pour le robot d'offres.
// La clé est demandée dans le Terminal, sans s'afficher, et n'est jamais écrite ailleurs.
//
//   node infra/jooble-key.mjs

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

const key = await askHidden("Clé API Jooble (elle ne s'affiche pas) : ");
if (!/^[0-9a-f-]{20,}$/i.test(key)) {
  console.error("Ça ne ressemble pas à une clé Jooble (lettres a-f, chiffres et tirets). Rien n'a été changé.");
  process.exit(1);
}
const web = az(["staticwebapp", "list", "-g", RG, "--query", "[0].name", "-o", "tsv"]);
az(["staticwebapp", "appsettings", "set", "-g", RG, "-n", web, "--setting-names", `JOOBLE_API_KEY=${key}`, "-o", "none"]);
console.log(`✅ JOOBLE_API_KEY posée sur ${web}`);
