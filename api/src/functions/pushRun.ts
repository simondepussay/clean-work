import { app, type HttpRequest } from "@azure/functions";
import { timingSafeEqual } from "node:crypto";
import { getPushSender, type PushSender } from "../lib/push";
import { runReminders } from "../lib/reminders";
import { getStore, type DocStore } from "../lib/store";

export const CRON_HEADER = "x-shukatsu-cron";

/** Compare deux secrets en temps constant (le temps de réponse ne révèle pas combien de caractères sont bons). */
function sameSecret(given: string | null, expected: string | undefined) {
  if (!given || !expected || expected.length < 32) return false;
  const a = Buffer.from(given), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * POST /api/push/run — envoie les rappels du jour (S26).
 *
 * Static Web Apps n'accepte pas les déclencheurs « minuterie » d'Azure Functions :
 * c'est un workflow GitHub Actions planifié (.github/workflows/reminders.yml) qui appelle
 * cette route chaque matin, avec un secret partagé dans l'en-tête x-shukatsu-cron.
 */
export function pushRunHandler(deps: { secret?: () => string | undefined; store?: () => DocStore; push?: () => PushSender | null; now?: () => Date } = {}) {
  return async (req: HttpRequest) => {
    const secret = (deps.secret ?? (() => process.env.PUSH_CRON_SECRET))();
    if (!sameSecret(req.headers.get(CRON_HEADER), secret)) return { status: 401, jsonBody: { error: "unauthorized" } };
    const sender = (deps.push ?? getPushSender)();
    if (!sender) return { status: 503, jsonBody: { error: "push_not_configured" } };
    const summary = await runReminders((deps.store ?? getStore)(), sender, (deps.now ?? (() => new Date()))());
    return { jsonBody: summary };
  };
}

app.http("pushRun", { methods: ["POST"], authLevel: "anonymous", route: "push/run", handler: pushRunHandler() });
