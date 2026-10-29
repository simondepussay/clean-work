import { app } from "@azure/functions";
import { weeklyReport } from "../lib/report";
import { getStore, type DocStore } from "../lib/store";
import { cronSecretFromEnv, withCron } from "../lib/http";


/** POST /api/report/run — chiffres du rapport de la semaine (tâche planifiée, secret x-shukatsu-cron). */
export function reportHandler(deps: { store?: () => DocStore; secret?: () => string | undefined; now?: () => Date } = {}) {
  return withCron(deps.secret ?? (() => cronSecretFromEnv("REPORT")), async () => ({
    jsonBody: await weeklyReport((deps.store ?? getStore)(), (deps.now ?? (() => new Date()))()),
  }));
}

app.http("reportRun", { methods: ["POST"], authLevel: "anonymous", route: "report/run", handler: reportHandler() });
