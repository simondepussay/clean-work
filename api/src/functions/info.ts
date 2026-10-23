import { app, type HttpRequest } from "@azure/functions";
import { timingSafeEqual } from "node:crypto";
import { infoPage, runDigest } from "../lib/digest";
import type { IdentityVerifier } from "../lib/identity";
import { withUser } from "../lib/http";
import { reviewModelFromEnv, type StructuredModel } from "../lib/review";
import { getStore, type DocStore } from "../lib/store";
import { UsageLimiter } from "../lib/usage";
import { CRON_HEADER } from "./pushRun";

type Deps = { verifier?: () => IdentityVerifier | null; store?: () => DocStore; model?: () => StructuredModel | null; secret?: () => string | undefined; now?: () => Date };

function sameSecret(given: string | null, expected: string | undefined) {
  if (!given || !expected || expected.length < 32) return false;
  const a = Buffer.from(given), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Onglet « 情報 » :
 *   GET  /api/info?page=N&source=S   (connecté) « 最新の見出し » : 7 actualités par page (archive), et les articles du site
 *   POST /api/info/run      (tâche du matin, secret x-shukatsu-cron) ajoute les 5 actualités du jour
 */
export function infoHandlers(deps: Deps = {}) {
  const store = deps.store ?? getStore;

  const page = withUser(async (req) => {
    const n = Number.parseInt(req.query.get("page") ?? "1", 10);
    const source = req.query.get("source") || undefined;
    return { jsonBody: await infoPage(store(), Number.isFinite(n) ? n : 1, source) };
  }, deps.verifier);

  const run = async (req: HttpRequest) => {
    if (!sameSecret(req.headers.get(CRON_HEADER), (deps.secret ?? (() => process.env.PUSH_CRON_SECRET))())) {
      return { status: 401, jsonBody: { error: "unauthorized" } };
    }
    const model = (deps.model ?? reviewModelFromEnv)();
    if (!model) return { status: 503, jsonBody: { error: "ai_not_configured" } };
    const now = (deps.now ?? (() => new Date()))();
    const result = await runDigest(store(), model, now);
    // Le coût compte dans le même budget mensuel que les autres fonctions d'IA.
    if (result.costJpy > 0) await new UsageLimiter(store(), () => now).recordCost(result.costJpy);
    return { jsonBody: result };
  };

  return { page, run };
}

const handlers = infoHandlers();
app.http("info", { methods: ["GET"], authLevel: "anonymous", route: "info", handler: handlers.page });
app.http("infoRun", { methods: ["POST"], authLevel: "anonymous", route: "info/run", handler: handlers.run });
