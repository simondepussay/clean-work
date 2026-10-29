import { app } from "@azure/functions";
import { getPushSender, type PushSender } from "../lib/push";
import type { Word } from "../lib/cheer";
import { readJlptSchedule, runReminders } from "../lib/reminders";
import { getStore, type DocStore } from "../lib/store";
import { cronSecretFromEnv, withCron } from "../lib/http";

export { CRON_HEADER } from "../lib/http";


/**
 * POST /api/push/run — envoie les rappels du jour (S26).
 *
 * Static Web Apps n'accepte pas les déclencheurs « minuterie » d'Azure Functions :
 * c'est un workflow GitHub Actions planifié (.github/workflows/reminders.yml) qui appelle
 * cette route chaque matin, avec un secret partagé dans l'en-tête x-shukatsu-cron.
 */
export function pushRunHandler(deps: { secret?: () => string | undefined; store?: () => DocStore; push?: () => PushSender | null; now?: () => Date; words?: () => Word[]; cheers?: boolean } = {}) {
  return withCron(deps.secret ?? (() => cronSecretFromEnv("PUSH")), async () => {
    const sender = (deps.push ?? getPushSender)();
    if (!sender) return { status: 503, jsonBody: { error: "push_not_configured" } };
    const summary = await runReminders((deps.store ?? getStore)(), sender, (deps.now ?? (() => new Date()))(), readJlptSchedule(), deps.words?.(), deps.cheers ?? true);
    return { jsonBody: summary };
  });
}

app.http("pushRun", { methods: ["POST"], authLevel: "anonymous", route: "push/run", handler: pushRunHandler() });
