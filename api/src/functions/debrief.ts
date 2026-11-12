import { app, type InvocationContext } from "@azure/functions";
import { adviceRequestSchema, adviceSchema, buildAdviceMessages, sanitizeAdvice, type AdviceResult } from "../lib/debrief";
import type { IdentityVerifier } from "../lib/identity";
import { withUser } from "../lib/http";
import { containers, type Application } from "../lib/models";
import { Repository } from "../lib/repository";
import { costJpy, reviewModelFromEnv, type StructuredModel } from "../lib/review";
import { getStore, type DocStore } from "../lib/store";
import { DEBRIEF_LIMITS, DEBRIEFS, UsageLimiter } from "../lib/usage";

type Deps = { verifier?: () => IdentityVerifier | null; model?: () => StructuredModel | null; store?: () => DocStore; now?: () => Date };

/**
 * 面接の振り返り. Les bilans eux-mêmes s'enregistrent avec la candidature (PUT /api/applications/{id}, champ debriefs).
 *   POST /api/applications/{id}/debriefs/{debriefId}/advice   { language } → la candidature, avec les conseils de l'IA
 *                                                             rangés dans ce bilan
 *   GET  /api/debrief-usage                                   conseils restants aujourd'hui et ce mois-ci
 */
export function debriefHandlers(deps: Deps = {}) {
  const store = deps.store ?? getStore;
  const model = deps.model ?? reviewModelFromEnv;
  const now = deps.now ?? (() => new Date());
  const limiter = () => new UsageLimiter(store(), now, DEBRIEF_LIMITS, DEBRIEFS);

  const advice = withUser(async (req, user, ctx: InvocationContext) => {
    const ai = model();
    if (!ai) return { status: 503, jsonBody: { error: "ai_not_configured" } };
    const application = await store().get<Application>(containers.applications, user.userId, req.params.id);
    const debrief = application?.debriefs?.find((d) => d.id === req.params.debriefId);
    if (!application || !debrief) return { status: 404, jsonBody: { error: "not_found" } };
    if (!debrief.questions.trim() && !debrief.improve?.trim() && !debrief.good?.trim()) {
      return { status: 400, jsonBody: { error: "invalid", issues: [{ path: "questions", message: "振り返りを入力してください / Write your notes first" }] } };
    }
    const { language } = adviceRequestSchema.parse((await req.json().catch(() => ({}))) ?? {});

    const reserved = await limiter().reserve(user.userId);
    if (!reserved.ok) {
      const { reason, retryAfter } = reserved.refusal;
      return { status: reason === "budget" ? 503 : 429, jsonBody: { error: "limit", reason, retryAfter } };
    }

    let output;
    try {
      output = await ai.complete<AdviceResult>(buildAdviceMessages(debrief, application, language), "interview_debrief", adviceSchema);
    } catch (e) {
      await reserved.reservation.release();
      ctx.error("振り返り : échec du modèle", e);
      return { status: 502, jsonBody: { error: "ai_failed" } };
    }
    const cost = costJpy(output.usage);
    await limiter().recordCost(cost);
    ctx.log(`振り返り : ${output.usage.inputTokens}+${output.usage.outputTokens} jetons, ${cost.toFixed(2)} ¥`);

    // Relu juste avant d'écrire : un bilan modifié pendant l'appel à l'IA n'est pas écrasé.
    const fresh = (await store().get<Application>(containers.applications, user.userId, application.id)) ?? application;
    const written = { ...sanitizeAdvice(output.result), language, createdAt: now().toISOString() };
    const debriefs = (fresh.debriefs ?? []).map((d) => (d.id === debrief.id ? { ...d, advice: written } : d));
    const saved = await new Repository(store(), now).updateApplication(user.userId, application.id, { debriefs });
    return { jsonBody: { application: saved, remaining: await limiter().remaining(user.userId) } };
  }, deps.verifier);

  const usage = withUser(async (_req, user) => ({ jsonBody: await limiter().remaining(user.userId) }), deps.verifier);

  return { advice, usage };
}

const handlers = debriefHandlers();
app.http("debriefAdvice", { methods: ["POST"], authLevel: "anonymous", route: "applications/{id}/debriefs/{debriefId}/advice", handler: handlers.advice });
app.http("debriefUsage", { methods: ["GET"], authLevel: "anonymous", route: "debrief-usage", handler: handlers.usage });
