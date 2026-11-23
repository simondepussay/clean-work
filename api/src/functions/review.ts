import { app, type InvocationContext } from "@azure/functions";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { IdentityVerifier } from "../lib/identity";
import { withUser } from "../lib/http";
import { containers, type Application, type Review } from "../lib/models";
import { Repository } from "../lib/repository";
import { buildMessages, costJpy, draftPurpose, explanationLanguages, languageRetry, mixedLanguage, reviewModelFromEnv, sanitize, type ModelUsage, type ReviewModel } from "../lib/review";
import { SkillsService } from "../lib/skills";
import { award } from "../lib/score";
import { getStore, type DocStore } from "../lib/store";
import { UsageLimiter } from "../lib/usage";

/** Temps total laissé aux appels au modèle, et minimum pour qu'une seconde tentative vaille le coup. */
const RETRY_DEADLINE_MS = 40_000;
const MIN_RETRY_MS = 15_000;

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

    // L'entreprise liée (poste, secteur, offre) et, pour un 志望動機, ceux écrits pour d'autres
    // entreprises : il doit changer d'une entreprise à l'autre.
    const application = draft.applicationId ? await store().get<Application>(containers.applications, user.userId, draft.applicationId) : null;
    const otherMotivations = draftPurpose(draft) !== "motivation" ? [] : (await repo.listDrafts(user.userId))
      .filter((d) => d.id !== draft.id && d.body.trim() && draftPurpose(d) === "motivation")
      .filter((d) => (draft.applicationId ? d.applicationId !== draft.applicationId : true) && d.company && d.company !== (application?.company ?? draft.company))
      .map((d) => ({ company: d.company!, body: d.body }));

    let output, messages;
    const started = Date.now();
    try {
      const skills = (await new SkillsService(store()).get(user.userId)).levels;
      messages = buildMessages(draft, language, { application, otherMotivations, skills });
      output = await ai.review(messages);
    } catch (e) {
      await reserved.reservation.release();
      ctx.error("relecture : échec du modèle", e);
      return { status: 502, jsonBody: { error: "ai_failed" } };
    }
    const usages: ModelUsage[] = [output.usage];

    // Langues mélangées dans les explications (signalé par l'IA ou trouvé par le code) : une
    // seconde tentative, si le temps le permet (les fonctions s'arrêtent à 45 s). Elle ne compte
    // pas comme une relecture de plus pour l'étudiant ; son coût entre dans le budget.
    let mixed = mixedLanguage(output.result, language);
    const left = RETRY_DEADLINE_MS - (Date.now() - started);
    if (mixed && left >= MIN_RETRY_MS) {
      try {
        const retry = await ai.review([...messages, languageRetry(language)], { timeoutMs: left });
        usages.push(retry.usage);
        if (!mixedLanguage(retry.result, language)) {
          output = retry;
          mixed = false;
        }
      } catch (e) {
        ctx.warn("relecture : seconde tentative (langues) échouée, on garde la première", e);
      }
    }
    if (mixed) ctx.warn(`relecture : langues mélangées dans les explications (${language})`);

    const usage = usages.reduce((a, u) => ({ inputTokens: a.inputTokens + u.inputTokens, outputTokens: a.outputTokens + u.outputTokens }));
    const cost = costJpy(usage);
    await limiter.recordCost(cost);
    const { discarded, ...result } = sanitize(output.result, draft.body);
    if (discarded > 0) ctx.warn(`relecture : ${discarded} citation(s) introuvable(s) écartée(s)`);
    ctx.log(`relecture : ${usages.length} appel(s), ${usage.inputTokens}+${usage.outputTokens} jetons, ${cost.toFixed(2)} ¥`);

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
      // Encore mélangées après la seconde tentative : les applications le disent à l'étudiant.
      mixedLanguage: mixed,
    };
    await repo.saveReview(saved);
    await award(store(), user.userId, [{ kind: "review", key: saved.id }], now);
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
