import { app, type HttpRequest } from "@azure/functions";
import { timingSafeEqual } from "node:crypto";
import { weeklyReport } from "../lib/report";
import { getStore, type DocStore } from "../lib/store";
import { CRON_HEADER } from "./pushRun";

function sameSecret(given: string | null, expected: string | undefined) {
  if (!given || !expected || expected.length < 32) return false;
  const a = Buffer.from(given), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** POST /api/report/run — chiffres du rapport de la semaine (tâche planifiée, secret x-shukatsu-cron). */
export function reportHandler(deps: { store?: () => DocStore; secret?: () => string | undefined; now?: () => Date } = {}) {
  return async (req: HttpRequest) => {
    if (!sameSecret(req.headers.get(CRON_HEADER), (deps.secret ?? (() => process.env.PUSH_CRON_SECRET))())) {
      return { status: 401, jsonBody: { error: "unauthorized" } };
    }
    return { jsonBody: await weeklyReport((deps.store ?? getStore)(), (deps.now ?? (() => new Date()))()) };
  };
}

app.http("reportRun", { methods: ["POST"], authLevel: "anonymous", route: "report/run", handler: reportHandler() });
