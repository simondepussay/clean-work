import { app, type HttpResponseInit } from "@azure/functions";
import type { IdentityVerifier } from "../lib/identity";
import { withUser } from "../lib/http";
import { InterviewCoach, type CoachError, type Interview } from "../lib/interview";
import { containers } from "../lib/models";
import { reviewModelFromEnv, type StructuredModel } from "../lib/review";
import { getStore, type DocStore } from "../lib/store";
import { INTERVIEW_LIMITS, INTERVIEWS, UsageLimiter } from "../lib/usage";

type Deps = { verifier?: () => IdentityVerifier | null; model?: () => StructuredModel | null; store?: () => DocStore; now?: () => Date };

/** Le contexte envoyé à l'IA reste côté serveur : l'app n'en a pas besoin. */
const view = ({ context: _c, userId: _u, ...rest }: Interview) => rest;

function reply(result: Interview | CoachError, created = false): HttpResponseInit {
  if (!("error" in result)) return { status: created ? 201 : 200, jsonBody: view(result) };
  switch (result.error) {
    case "not_found": return { status: 404, jsonBody: { error: "not_found" } };
    case "finished": return { status: 409, jsonBody: { error: "finished" } };
    case "not_ready": return { status: 409, jsonBody: { error: "not_ready" } };
    case "ai_failed": return { status: 502, jsonBody: { error: "ai_failed" } };
    case "limit": {
      const { reason, retryAfter } = result.refusal;
      return { status: reason === "budget" ? 503 : 429, jsonBody: { error: "limit", reason, retryAfter } };
    }
  }
}

/**
 * Entraînement aux entretiens (S17–S19) :
 *   GET    /api/interviews                séances, la plus récente d'abord (sans le détail des réponses)
 *   POST   /api/interviews                { applicationId?, stepId?, stage, language } → 201, avec les questions
 *                                        (stepId : l'entretien prévu de la candidature, qui fixe l'étape)
 *   GET    /api/interviews/{id}           une séance complète
 *   POST   /api/interviews/{id}/answers   { answer, durationSec?, spoken? } → avis, et parfois une relance
 *   POST   /api/interviews/{id}/finish    bilan (possible avant la dernière question)
 *   DELETE /api/interviews/{id}           → 204
 *   GET    /api/interview-usage           séances restantes aujourd'hui et ce mois-ci
 *                                        (hors de /interviews/… : « usage » ne doit pas pouvoir passer pour un {id})
 */
export function interviewHandlers(deps: Deps = {}) {
  const store = deps.store ?? getStore;
  const model = deps.model ?? reviewModelFromEnv;
  const now = deps.now ?? (() => new Date());
  const coach = () => {
    const ai = model();
    return ai ? new InterviewCoach(store(), ai, now) : null;
  };
  const noAI = { status: 503, jsonBody: { error: "ai_not_configured" } };
  const notFound = { status: 404, jsonBody: { error: "not_found" } };

  const sessions = withUser(async (req, user) => {
    const id = req.params.id;
    if (!id && req.method === "POST") {
      const c = coach();
      return c ? reply(await c.start(user.userId, await req.json().catch(() => null)), true) : noAI;
    }
    if (!id) {
      const all = await store().list<Interview>(containers.interviews, user.userId);
      return {
        jsonBody: all.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((i) => ({
          id: i.id, company: i.company, applicationId: i.applicationId, stepId: i.stepId, stepDate: i.stepDate, stage: i.stage, status: i.status,
          score: i.summary?.score ?? null, questions: i.turns.length, createdAt: i.createdAt,
        })),
      };
    }
    if (req.method === "DELETE") return (await store().remove(containers.interviews, user.userId, id)) ? { status: 204 } : notFound;
    const interview = await store().get<Interview>(containers.interviews, user.userId, id);
    return interview ? { jsonBody: view(interview) } : notFound;
  }, deps.verifier);

  const answer = withUser(async (req, user) => {
    const c = coach();
    return c ? reply(await c.answer(user.userId, req.params.id, await req.json().catch(() => null))) : noAI;
  }, deps.verifier);

  const finish = withUser(async (req, user) => {
    const c = coach();
    return c ? reply(await c.finish(user.userId, req.params.id)) : noAI;
  }, deps.verifier);

  const usage = withUser(async (_req, user) => ({
    jsonBody: await new UsageLimiter(store(), now, INTERVIEW_LIMITS, INTERVIEWS).remaining(user.userId),
  }), deps.verifier);

  return { sessions, answer, finish, usage };
}

const handlers = interviewHandlers();
app.http("interviewUsage", { methods: ["GET"], authLevel: "anonymous", route: "interview-usage", handler: handlers.usage });
app.http("interviews", { methods: ["GET", "POST", "DELETE"], authLevel: "anonymous", route: "interviews/{id?}", handler: handlers.sessions });
app.http("interviewAnswers", { methods: ["POST"], authLevel: "anonymous", route: "interviews/{id}/answers", handler: handlers.answer });
app.http("interviewFinish", { methods: ["POST"], authLevel: "anonymous", route: "interviews/{id}/finish", handler: handlers.finish });
