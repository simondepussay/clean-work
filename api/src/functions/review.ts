import { app, type InvocationContext } from "@azure/functions";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { IdentityVerifier } from "../lib/identity";
import { withUser } from "../lib/http";
import type { Review } from "../lib/models";
import { Repository } from "../lib/repository";
import { buildMessages, costJpy, explanationLanguages, reviewModelFromEnv, sanitize, type ReviewModel } from "../lib/review";
import { getStore, type DocStore } from "../lib/store";
import { UsageLimiter } from "../lib/usage";

type Deps = { verifier?: () => IdentityVerifier | null; model?: () => ReviewModel | null; store?: () => DocStore; now?: () => Date };

const requestSchema = z.object({ language: z.enum(explanationLanguages).default("en") });

/**
 * POST /api/drafts/{id}/review   relecture par IA (S14), dans la limite d'utilisation (S16)
 * GET  /api/drafts/{id}/reviews  relectures précédentes, la plus récente d'abord (S15)
 * GET  /api/usage                relectures restantes aujourd'hui et ce mois-ci
 */
export function reviewHandlers(deps: Deps = {}) {
  const store = deps.store ?? getStore;
  const model = deps.model ?? reviewModelFromEnv;
  const now = deps.now ?? (() => new Date());

  const review = withUser(async (req, user, ctx: InvocationContext) => {
    const ai = model();
    if (!ai) return { status: 503, jsonBody: { error: "ai_not_configured" } };
    const repo = new Repository(store(), now);
    const draft = await repo.getDraft(user.userId, req.params.id);
    if (!draft) return { status: 404, jsonBody: { error: "not_found" } };
    if (!draft.body.trim()) return { status: 400, jsonBody: { error: "invalid", issues: [{ path: "body", message: "本文を入力してください / Write your answer first" }] } };
    const { language } = requestSchema.parse((await req.json().catch(() => ({}))) ?? {});

    // S16 : une place est réservée avant l'appel, et rendue si l'appel échoue.
    const limiter = new UsageLimiter(store(), now);
    const reserved = await limiter.reserve(user.userId);
    if (!reserved.ok) {
      const { reason, retryAfter } = reserved.refusal;
      return { status: reason === "budget" ? 503 : 429, jsonBody: { error: "limit", reason, retryAfter } };
    }

    let output;
    try {
      output = await ai.review(buildMessages(draft, language));
    } catch (e) {
      await reserved.reservation.release();
      ctx.error("relecture : échec du modèle", e);
      return { status: 502, jsonBody: { error: "ai_failed" } };
    }

    const cost = costJpy(output.usage);
    await limiter.recordCost(cost);
    const { discarded, ...result } = sanitize(output.result, draft.body);
    if (discarded > 0) ctx.warn(`relecture : ${discarded} citation(s) introuvable(s) écartée(s)`);
    ctx.log(`relecture : ${output.usage.inputTokens}+${output.usage.outputTokens} jetons, ${cost.toFixed(2)} ¥`);

    const saved: Review = {
      id: randomUUID(),
      userId: user.userId,
      draftId: draft.id,
      createdAt: now().toISOString(),
      model: ai.name,
      language,
      bodySnapshot: draft.body,
      discarded,
      ...result,
    };
    await repo.saveReview(saved);
    return { status: 201, jsonBody: saved };
  }, deps.verifier);

  const history = withUser(async (req, user) => {
    const repo = new Repository(store(), now);
    if (!(await repo.getDraft(user.userId, req.params.id))) return { status: 404, jsonBody: { error: "not_found" } };
    return { jsonBody: await repo.listReviews(user.userId, req.params.id) };
  }, deps.verifier);

  const usage = withUser(async (_req, user) => ({ jsonBody: await new UsageLimiter(store(), now).remaining(user.userId) }), deps.verifier);

  return { review, history, usage };
}

const handlers = reviewHandlers();
app.http("review", { methods: ["POST"], authLevel: "anonymous", route: "drafts/{id}/review", handler: handlers.review });
app.http("reviews", { methods: ["GET"], authLevel: "anonymous", route: "drafts/{id}/reviews", handler: handlers.history });
app.http("usage", { methods: ["GET"], authLevel: "anonymous", route: "usage", handler: handlers.usage });
