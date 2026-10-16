import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Commit déployé : écrit dans api/version.json par le workflow de déploiement, "dev" en local. */
export function appVersion(): string {
  try {
    return JSON.parse(readFileSync(join(__dirname, "../../../version.json"), "utf8")).version;
  } catch {
    return "dev";
  }
}
