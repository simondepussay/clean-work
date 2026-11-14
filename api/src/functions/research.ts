import { app, type InvocationContext } from "@azure/functions";
import type { IdentityVerifier } from "../lib/identity";
import { withUser } from "../lib/http";
import { containers, type Application } from "../lib/models";
import { gbizFromEnv, type CompanyFacts } from "../lib/openData";
import { Repository } from "../lib/repository";
import { buildResearchMessages, researchOutputSchema, researchRequestSchema, sanitizeResearch, type ResearchResult } from "../lib/research";
import { costJpy, reviewModelFromEnv, type StructuredModel } from "../lib/review";
import { getStore, type DocStore } from "../lib/store";
import { RESEARCH, RESEARCH_LIMITS, UsageLimiter } from "../lib/usage";

type Deps = {
  verifier?: () => IdentityVerifier | null; model?: () => StructuredModel | null; store?: () => DocStore; now?: () => Date;
  /** Fiche officielle d'une entreprise (gBizINFO) ; null si elle est introuvable ou le service indisponible. */
  facts?: (corporateNumber: string) => Promise<CompanyFacts | null>;
};

/**
 * 企業研究 :
 *   POST /api/applications/{id}/research   { language } → { application, remaining } : la fiche est rangée dans la candidature
 *   GET  /api/research-usage               fiches restantes aujourd'hui et ce mois-ci
 */
export function researchHandlers(deps: Deps = {}) {
  const store = deps.store ?? getStore;
  const model = deps.model ?? reviewModelFromEnv;
  const now = deps.now ?? (() => new Date());
  const facts = deps.facts ?? ((n: string) => gbizFromEnv()?.facts(n) ?? Promise.resolve(null));
  const limiter = () => new UsageLimiter(store(), now, RESEARCH_LIMITS, RESEARCH);

  const research = withUser(async (req, user, ctx: InvocationContext) => {
    const ai = model();
    if (!ai) return { status: 503, jsonBody: { error: "ai_not_configured" } };
    const application = await store().get<Application>(containers.applications, user.userId, req.params.id);
    if (!application) return { status: 404, jsonBody: { error: "not_found" } };
    const { language } = researchRequestSchema.parse((await req.json().catch(() => ({}))) ?? {});

    const reserved = await limiter().reserve(user.userId);
    if (!reserved.ok) {
      const { reason, retryAfter } = reserved.refusal;
      return { status: reason === "budget" ? 503 : 429, jsonBody: { error: "limit", reason, retryAfter } };
    }

    // La fiche officielle manque parfois (entreprise non reliée, gBizINFO en panne) : la recherche se fait alors sur les notes seules.
    const official = application.corporateNumber ? await facts(application.corporateNumber).catch(() => null) : null;
    let output;
    try {
      output = await ai.complete<ResearchResult>(buildResearchMessages(application, official, language), "company_research", researchOutputSchema);
    } catch (e) {
      await reserved.reservation.release();
      ctx.error("企業研究 : échec du modèle", e);
      return { status: 502, jsonBody: { error: "ai_failed" } };
    }
    const cost = costJpy(output.usage);
    await limiter().recordCost(cost);
    ctx.log(`企業研究 : ${output.usage.inputTokens}+${output.usage.outputTokens} jetons, ${cost.toFixed(2)} ¥`);

    const written = { ...sanitizeResearch(output.result), language, usedOfficialData: official !== null, createdAt: now().toISOString() };
    const saved = await new Repository(store(), now).updateApplication(user.userId, application.id, { research: written });
    return { jsonBody: { application: saved, remaining: await limiter().remaining(user.userId) } };
  }, deps.verifier);

  const usage = withUser(async (_req, user) => ({ jsonBody: await limiter().remaining(user.userId) }), deps.verifier);

  return { research, usage };
}

const handlers = researchHandlers();
app.http("companyResearch", { methods: ["POST"], authLevel: "anonymous", route: "applications/{id}/research", handler: handlers.research });
app.http("researchUsage", { methods: ["GET"], authLevel: "anonymous", route: "research-usage", handler: handlers.usage });
