import { app, type InvocationContext } from "@azure/functions";
import type { IdentityVerifier } from "../lib/identity";
import { withUser } from "../lib/http";
import { buildEmailMessages, emailRequestSchema, emailSchema, sanitizeEmail, type EmailResult } from "../lib/email";
import { containers, type Application } from "../lib/models";
import { Repository } from "../lib/repository";
import { costJpy, reviewModelFromEnv, type StructuredModel } from "../lib/review";
import { getStore, type DocStore } from "../lib/store";
import { EMAIL_LIMITS, EMAILS, UsageLimiter } from "../lib/usage";

type Deps = { verifier?: () => IdentityVerifier | null; model?: () => StructuredModel | null; store?: () => DocStore; now?: () => Date };

/**
 * POST /api/applications/{id}/email   { kind, language, stepId?, details? } → { subject, body, points, remaining }
 *                                     un mail de 就活 (お礼, 日程調整, 辞退…) pour cette candidature
 * GET  /api/email-usage               mails restants aujourd'hui et ce mois-ci
 *
 * Le mail n'est pas enregistré : l'app le copie ou l'ouvre dans la messagerie.
 */
export function emailHandlers(deps: Deps = {}) {
  const store = deps.store ?? getStore;
  const model = deps.model ?? reviewModelFromEnv;
  const now = deps.now ?? (() => new Date());
  const limiter = () => new UsageLimiter(store(), now, EMAIL_LIMITS, EMAILS);

  const write = withUser(async (req, user, ctx: InvocationContext) => {
    const ai = model();
    if (!ai) return { status: 503, jsonBody: { error: "ai_not_configured" } };
    const application = await store().get<Application>(containers.applications, user.userId, req.params.id);
    if (!application) return { status: 404, jsonBody: { error: "not_found" } };
    const request = emailRequestSchema.parse((await req.json().catch(() => ({}))) ?? {});

    // Une place est réservée avant l'appel, et rendue si l'appel échoue.
    const reserved = await limiter().reserve(user.userId);
    if (!reserved.ok) {
      const { reason, retryAfter } = reserved.refusal;
      return { status: reason === "budget" ? 503 : 429, jsonBody: { error: "limit", reason, retryAfter } };
    }

    const profile = await new Repository(store(), now).getProfile(user.userId);
    let output;
    try {
      output = await ai.complete<EmailResult>(buildEmailMessages(request, application, profile), "shukatsu_email", emailSchema);
    } catch (e) {
      await reserved.reservation.release();
      ctx.error("mail : échec du modèle", e);
      return { status: 502, jsonBody: { error: "ai_failed" } };
    }
    const cost = costJpy(output.usage);
    await limiter().recordCost(cost);
    ctx.log(`mail (${request.kind}) : ${output.usage.inputTokens}+${output.usage.outputTokens} jetons, ${cost.toFixed(2)} ¥`);
    return { jsonBody: { ...sanitizeEmail(output.result), remaining: await limiter().remaining(user.userId) } };
  }, deps.verifier);

  const usage = withUser(async (_req, user) => ({ jsonBody: await limiter().remaining(user.userId) }), deps.verifier);

  return { write, usage };
}

const handlers = emailHandlers();
app.http("applicationEmail", { methods: ["POST"], authLevel: "anonymous", route: "applications/{id}/email", handler: handlers.write });
app.http("emailUsage", { methods: ["GET"], authLevel: "anonymous", route: "email-usage", handler: handlers.usage });
