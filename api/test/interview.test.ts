import { HttpRequest, InvocationContext } from "@azure/functions";
import { describe, expect, it } from "vitest";
import { interviewHandlers } from "../src/functions/interviews";
import type { IdentityVerifier } from "../src/lib/identity";
import { buildContext, MAX_FOLLOW_UPS, type Interview } from "../src/lib/interview";
import { containers, type Application, type Draft, type Profile } from "../src/lib/models";
import type { ChatMessage, StructuredModel } from "../src/lib/review";
import { MemoryStore } from "../src/lib/store";

const NOW = new Date("2026-10-23T03:00:00Z");
const ctx = new InvocationContext({ logHandler: () => {} });
const as = (userId: string): IdentityVerifier => ({ verify: async (t) => (t === "ok" ? { userId } : null) });

const profile: Profile = {
  id: "u1", userId: "u1", updatedAt: "", nameKanji: "秘密 太郎", nameKana: "ひみつ たろう", birthDate: "2000-01-01",
  email: "secret@example.com", phone: "090-0000-0000", address: "東京都秘密区",
  education: [{ school: "HAL東京", faculty: "IT学部", start: "2026-04", end: "2028-03", status: "expected" }],
  work: [{ company: "輸出商社", role: "インターン", start: "2025-06", end: "2025-09", description: "フランス向けの輸出を担当" }],
  certifications: [{ category: "language", name: "JLPT N1", date: "2025-12" }],
  languages: [{ language: "fr", level: "native" }, { language: "ja", level: "business" }],
};
const sony: Application = {
  id: "a1", userId: "u1", company: "ソニー", position: "エンジニア", industry: "maker", companyType: "large", notes: "ゲームと半導体。",
  status: "interview1", steps: [], nextDeadline: null, createdAt: "", updatedAt: "",
};
const draft = (id: string, applicationId: string | undefined, body: string): Draft =>
  ({ id, userId: "u1", kind: "motivation", question: `設問${id}`, body, ...(applicationId ? { applicationId } : {}), createdAt: "", updatedAt: "" });

/** Faux modèle : répond selon le schéma demandé, et garde les messages reçus pour les vérifier. */
class FakeModel implements StructuredModel {
  name = "fake";
  calls: { schema: string; messages: ChatMessage[] }[] = [];
  followUp = "";
  failOn: string | null = null;
  async complete<T>(messages: ChatMessage[], schemaName: string) {
    this.calls.push({ schema: schemaName, messages });
    if (this.failOn === schemaName) throw new Error("panne");
    const results: Record<string, unknown> = {
      interview_questions: { questions: Array.from({ length: 6 }, (_, i) => ({ question: `質問${i + 1}をお願いします。`, intent: `point ${i + 1}` })) },
      interview_feedback: {
        score: 120, comment: "Bien.", improvements: ["a", "b", "c", "d"],
        expressions: [{ quote: "バイト", suggestion: "アルバイト" }, { quote: "inventé", suggestion: "x" }], followUp: this.followUp,
      },
      interview_summary: { score: 68, summary: "Bon début.", strengths: ["clair"], improvements: ["chiffres"] },
    };
    return { result: results[schemaName] as T, usage: { inputTokens: 1000, outputTokens: 500 } };
  }
}

async function setup() {
  const store = new MemoryStore();
  await store.put(containers.profiles, profile);
  await store.put(containers.applications, sony);
  await store.put(containers.drafts, draft("d1", "a1", "ソニーの技術に惹かれました。"));
  await store.put(containers.drafts, draft("d2", undefined, "私の強みは行動力です。"));
  const model = new FakeModel();
  const h = interviewHandlers({ verifier: () => as("u1"), store: () => store, model: () => model, now: () => NOW });
  const other = interviewHandlers({ verifier: () => as("u2"), store: () => store, model: () => model, now: () => NOW });
  const request = (method: string, params: Record<string, string> = {}, body?: unknown) => new HttpRequest({
    url: "https://x/api/interviews", method, params, headers: { "x-shukatsu-token": "ok" },
    body: body === undefined ? undefined : { string: JSON.stringify(body) },
  });
  const api = {
    start: (body: unknown = { applicationId: "a1", stage: "interview1", language: "fr" }, handlers = h) => handlers.sessions(request("POST", {}, body), ctx),
    get: (id: string, handlers = h) => handlers.sessions(request("GET", { id }), ctx),
    list: () => h.sessions(request("GET"), ctx),
    remove: (id: string) => h.sessions(request("DELETE", { id }), ctx),
    answer: (id: string, body: unknown, handlers = h) => handlers.answer(request("POST", { id }, body), ctx),
    finish: (id: string) => h.finish(request("POST", { id }), ctx),
    usage: () => h.usage(request("GET"), ctx),
  };
  return { store, model, api, other };
}

type View = Omit<Interview, "context" | "userId">;

describe("contexte envoyé à l'IA", () => {
  const context = buildContext({ application: sony, profile, drafts: [draft("d1", "a1", "ソニーの技術。"), draft("d2", undefined, "行動力。")], stage: "final" });

  it("contient l'entreprise, l'étape, le parcours et l'ES de cette entreprise", () => {
    for (const text of ["最終面接", "ソニー", "メーカー", "大手", "ゲームと半導体", "HAL東京", "卒業見込み", "フランス向けの輸出", "JLPT N1", "フランス語（ネイティブ）", "ソニーの技術"]) {
      expect(context).toContain(text);
    }
    expect(context, "l'ES commune n'est prise que s'il n'y a pas d'ES pour l'entreprise").not.toContain("行動力");
  });

  it("ne contient ni le nom, ni la date de naissance, ni les coordonnées", () => {
    for (const secret of ["秘密 太郎", "ひみつ", "2000-01-01", "secret@example.com", "090-0000-0000", "東京都秘密区"]) {
      expect(context).not.toContain(secret);
    }
  });

  it("sans candidature : entretien général, avec les ES communes", () => {
    const general = buildContext({ application: null, profile: null, drafts: [draft("d2", undefined, "行動力。")], stage: "interview1" });
    expect(general).toContain("特定の企業なし");
    expect(general).toContain("行動力");
  });
});

describe("/api/interviews", () => {
  it("démarre une séance de 5 questions, sans renvoyer le contexte à l'app", async () => {
    const { api, model } = await setup();
    const res = await api.start();
    expect(res.status).toBe(201);
    const body = res.jsonBody as View & { context?: string };
    expect(body).toMatchObject({ company: "ソニー", stage: "interview1", language: "fr", status: "active" });
    expect(body.turns).toHaveLength(5);
    expect(body.context).toBeUndefined();
    const system = model.calls[0].messages[0].content;
    expect(system).toContain("公正な採用選考");
    expect(system).toContain("français");
  });

  it("avis sur la réponse : note bornée, 3 conseils au plus, expressions vraiment présentes", async () => {
    const { api } = await setup();
    const { id } = (await api.start()).jsonBody as View;
    const res = await api.answer(id, { answer: "大学ではバイトを頑張りました。", durationSec: 40, spoken: true });
    const turn = (res.jsonBody as View).turns[0];
    expect(turn.feedback).toMatchObject({ score: 100, improvements: ["a", "b", "c"], expressions: [{ quote: "バイト", suggestion: "アルバイト" }] });
    expect(turn).toMatchObject({ durationSec: 40, spoken: true });
  });

  it("réponse dictée : l'IA est prévenue de ne pas juger la ponctuation", async () => {
    const { api, model } = await setup();
    const { id } = (await api.start()).jsonBody as View;
    await api.answer(id, { answer: "はい", spoken: true });
    expect(model.calls.at(-1)!.messages[0].content).toContain("音声認識");
    await api.answer(id, { answer: "はい" });
    expect(model.calls.at(-1)!.messages[0].content).not.toContain("音声認識");
  });

  it(`relances (深掘り) : après une question principale seulement, ${MAX_FOLLOW_UPS} au plus`, async () => {
    const { api, model } = await setup();
    model.followUp = "具体的には？";
    const { id } = (await api.start()).jsonBody as View;
    let view = (await api.answer(id, { answer: "回答1" })).jsonBody as View;
    expect(view.turns.map((t) => t.kind)).toEqual(["main", "followUp", "main", "main", "main", "main"]);
    view = (await api.answer(id, { answer: "深掘りへの回答" })).jsonBody as View;
    expect(view.turns, "pas de relance sur une relance").toHaveLength(6);
    for (let i = 0; i < 5; i++) view = (await api.answer(id, { answer: `回答${i}` })).jsonBody as View;
    expect(view.turns.filter((t) => t.kind === "followUp")).toHaveLength(MAX_FOLLOW_UPS);
    expect(view.turns.every((t) => t.answer !== undefined)).toBe(true);
    expect((await api.answer(id, { answer: "もう一つ" })).status).toBe(409);
  });

  it("bilan : possible avant la fin, garde seulement les questions répondues", async () => {
    const { api } = await setup();
    const { id } = (await api.start()).jsonBody as View;
    expect((await api.finish(id)).status, "pas de bilan sans réponse").toBe(409);
    await api.answer(id, { answer: "回答" });
    const done = (await api.finish(id)).jsonBody as View;
    expect(done).toMatchObject({ status: "finished", summary: { score: 68, summary: "Bon début." } });
    expect(done.turns).toHaveLength(1);
    expect((await api.answer(id, { answer: "遅い" })).status).toBe(409);
  });

  it("3 séances par jour ; une panne de l'IA ne compte pas", async () => {
    const { api, model } = await setup();
    model.failOn = "interview_questions";
    expect((await api.start()).status).toBe(502);
    model.failOn = null;
    for (let i = 0; i < 3; i++) expect((await api.start()).status).toBe(201);
    const refused = await api.start();
    expect(refused.status).toBe(429);
    expect(refused.jsonBody).toMatchObject({ error: "limit", reason: "day" });
    expect((await api.usage()).jsonBody).toEqual({ today: 0, month: 17 });
  });

  it("panne pendant une réponse : 502, la réponse n'est pas perdue côté app (rien n'est enregistré)", async () => {
    const { api, model } = await setup();
    const { id } = (await api.start()).jsonBody as View;
    model.failOn = "interview_feedback";
    expect((await api.answer(id, { answer: "回答" })).status).toBe(502);
    expect(((await api.get(id)).jsonBody as View).turns[0].answer).toBeUndefined();
  });

  it("isole les utilisateurs, y compris la candidature choisie", async () => {
    const { api, other } = await setup();
    const { id } = (await api.start()).jsonBody as View;
    expect((await api.get(id, other)).status).toBe(404);
    expect((await api.answer(id, { answer: "x" }, other)).status).toBe(404);
    expect((await api.start({ applicationId: "a1" }, other)).status, "la candidature d'un autre").toBe(404);
  });

  it("liste sans le détail des réponses ; suppression", async () => {
    const { api } = await setup();
    const { id } = (await api.start()).jsonBody as View;
    expect((await api.list()).jsonBody).toEqual([
      { id, company: "ソニー", applicationId: "a1", stage: "interview1", status: "active", score: null, questions: 5, createdAt: NOW.toISOString() },
    ]);
    expect((await api.remove(id)).status).toBe(204);
    expect((await api.get(id)).status).toBe(404);
  });

  it("400 lisible : réponse vide, étape inconnue", async () => {
    const { api } = await setup();
    expect((await api.start({ stage: "interview9" })).status).toBe(400);
    const { id } = (await api.start()).jsonBody as View;
    expect((await api.answer(id, { answer: "   " })).status).toBe(400);
  });
});
