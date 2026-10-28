/**
 * Test d'intégration (S21) : le parcours complet d'un étudiant, de la connexion à la
 * suppression du compte, à travers toutes les routes branchées ensemble.
 *
 * Les tests unitaires vérifient chaque module seul ; ici on vérifie qu'ils fonctionnent
 * ENSEMBLE : le vrai vérificateur de jetons, le vrai Repository, un seul store partagé.
 * Seuls les services extérieurs sont simulés (annuaire, IA, Apple) : on ne veut ni coût,
 * ni dépendance au réseau dans la CI.
 */
import { HttpRequest, InvocationContext, type HttpResponseInit } from "@azure/functions";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type KeyLike } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { applicationsHandler } from "../src/functions/applications";
import { devicesHandler } from "../src/functions/devices";
import { draftsHandler } from "../src/functions/drafts";
import { meHandler } from "../src/functions/me";
import { profileHandler } from "../src/functions/profile";
import { pushRunHandler } from "../src/functions/pushRun";
import { resumeHandler } from "../src/functions/resume";
import { reviewHandlers } from "../src/functions/review";
import { EntraVerifier, TOKEN_HEADER } from "../src/lib/identity";
import type { PushMessage, PushSender } from "../src/lib/push";
import type { ReviewModel } from "../src/lib/review";
import { MemoryStore } from "../src/lib/store";

const TENANT = "11111111-2222-3333-4444-555555555555";
const AUDIENCE = "api-client-id";
const NOW = new Date("2026-10-22T23:00:00Z"); // 8 h le 23 octobre à Tokyo
const SECRET = "c".repeat(64);
const ctx = new InvocationContext({ logHandler: () => {} });

let signingKey: KeyLike;
let verifier: EntraVerifier;

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  signingKey = pair.privateKey;
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: "k1", alg: "RS256" };
  verifier = new EntraVerifier(TENANT, AUDIENCE, createLocalJWKSet({ keys: [jwk] }));
});

/** Un jeton comme ceux de l'annuaire External ID, signé par la clé du test. */
const tokenFor = (oid: string) =>
  new SignJWT({ oid, scp: "access", email: `${oid}@example.com`, name: "Simon" })
    .setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setIssuer(`https://${TENANT}.ciamlogin.com/${TENANT}/v2.0`)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(signingKey);

const fakeAI: ReviewModel = {
  name: "fake",
  review: async () => ({
    result: { score: 72, summary: "結論が先にあり、読みやすい。", strengths: ["具体的"], issues: [] },
    usage: { inputTokens: 1000, outputTokens: 500 },
  }),
};

class Phone implements PushSender {
  inbox: PushMessage[] = [];
  async send(_d: unknown, m: PushMessage) {
    this.inbox.push(m);
    return "sent" as const;
  }
}

/** L'application entière, avec un seul store en mémoire et des services extérieurs simulés. */
function backend() {
  const store = new MemoryStore();
  const phone = new Phone();
  const deleted: string[] = [];
  const common = { verifier: () => verifier, store: () => store, now: () => NOW };
  const review = reviewHandlers({ ...common, model: () => fakeAI });
  const routes: Record<string, (req: HttpRequest, ctx: InvocationContext) => Promise<HttpResponseInit>> = {
    me: meHandler({ ...common, directory: () => ({ deleteUser: async (id) => void deleted.push(id) }) }),
    profile: profileHandler(common.verifier, common.store),
    applications: applicationsHandler(common),
    drafts: draftsHandler(common.verifier, common.store),
    review: review.review,
    reviews: review.history,
    usage: review.usage,
    resume: resumeHandler(common),
    devices: devicesHandler({ ...common, push: () => phone }),
    pushRun: pushRunHandler({ secret: () => SECRET, store: () => store, push: () => phone, now: () => NOW, cheers: false }),
  };

  /** Appelle une route comme le ferait l'app : jeton dans x-shukatsu-token, corps JSON. */
  async function call(oid: string | null, route: string, method: string, opts: { params?: Record<string, string>; body?: unknown; headers?: Record<string, string> } = {}) {
    const headers: Record<string, string> = { ...opts.headers };
    if (oid) headers[TOKEN_HEADER] = await tokenFor(oid);
    const req = new HttpRequest({
      url: `https://x/api/${route}`, method, params: opts.params ?? {}, headers,
      body: opts.body === undefined ? undefined : { string: JSON.stringify(opts.body) },
    });
    return routes[route](req, ctx);
  }
  return { call, store, phone, deleted };
}

describe("parcours complet d'un étudiant (intégration)", () => {
  it("connexion → profil → candidature → ES → relecture → 履歴書 → rappel push → suppression du compte", async () => {
    const { call, phone, deleted } = backend();
    const me = "student-1";

    // 1. Première connexion : pas encore de profil.
    expect((await call(me, "me", "GET")).jsonBody).toMatchObject({ userId: me, hasProfile: false });

    // 2. Profil (S05), puis /me le voit.
    const profile = await call(me, "profile", "PUT", { body: {
      nameKanji: "ドゥピュッセ シモン", nameKana: "どぅぴゅっせ しもん", birthDate: "2000-01-01",
      education: [{ school: "HAL東京", start: "2026-04", end: "2028-03", status: "expected" }],
    } });
    expect(profile.status ?? 200).toBe(200);
    expect((await call(me, "me", "GET")).jsonBody).toMatchObject({ hasProfile: true });

    // 3. Candidature avec une ES à rendre demain (S07).
    const app = (await call(me, "applications", "POST", { body: {
      company: "楽天グループ", status: "es", steps: [{ id: "s1", type: "es", dueDate: "2026-10-24" }],
    } })).jsonBody as { id: string; nextDeadline: string };
    expect(app.nextDeadline).toBe("2026-10-24");

    // 4. ES liée à la candidature (S13), puis relecture par l'IA (S14) dans la limite (S16).
    const draft = (await call(me, "drafts", "POST", { body: {
      kind: "motivation", applicationId: app.id, company: "楽天グループ", question: "志望動機を教えてください。", charLimit: 400,
      body: "私が貴社を志望する理由は、世界中の人に便利なサービスを届けたいからです。",
    } })).jsonBody as { id: string; applicationId: string };
    expect(draft.applicationId).toBe(app.id);
    const reviewed = await call(me, "review", "POST", { params: { id: draft.id }, body: { language: "fr" } });
    expect(reviewed.status).toBe(201);
    expect((await call(me, "reviews", "GET", { params: { id: draft.id } })).jsonBody).toHaveLength(1);
    expect((await call(me, "usage", "GET")).jsonBody).toEqual({ today: 9, month: 29 });

    // 5. 履歴書 en PDF à partir du profil (S11).
    const pdf = await call(me, "resume", "POST", { body: { era: "japanese" } });
    expect(pdf.status ?? 200).toBe(200);
    expect(Buffer.from(pdf.body as Uint8Array).subarray(0, 5).toString()).toBe("%PDF-");

    // 6. L'iPhone s'enregistre (S26) ; la tâche du matin envoie le rappel de demain.
    expect((await call(me, "devices", "POST", { body: { token: "ab".repeat(32), environment: "production" } })).jsonBody).toEqual({ push: "on" });
    const run = await call(null, "pushRun", "POST", { headers: { "x-shukatsu-cron": SECRET } });
    expect(run.jsonBody).toMatchObject({ notified: 1, sent: 1 });
    expect(phone.inbox[0].body).toBe("明日：楽天グループ ES");

    // 7. Suppression du compte (S25) : tout disparaît, l'annuaire est appelé, plus de rappel.
    expect((await call(me, "me", "DELETE")).status).toBe(204);
    expect(deleted).toEqual([me]);
    expect((await call(me, "profile", "GET")).status).toBe(404);
    expect((await call(me, "applications", "GET")).jsonBody).toEqual([]);
    expect((await call(me, "drafts", "GET")).jsonBody).toEqual([]);
    const after = await call(null, "pushRun", "POST", { headers: { "x-shukatsu-cron": SECRET } });
    expect(after.jsonBody).toMatchObject({ users: 0 });
  });

  it("deux étudiants ne voient jamais les données l'un de l'autre, sur aucune route", async () => {
    const { call } = backend();
    await call("alice", "profile", "PUT", { body: { nameKanji: "アリス", nameKana: "ありす" } });
    const app = (await call("alice", "applications", "POST", { body: { company: "秘密の会社" } })).jsonBody as { id: string };
    const draft = (await call("alice", "drafts", "POST", { body: { question: "自己PR", body: "秘密" } })).jsonBody as { id: string };

    expect((await call("bob", "profile", "GET")).status).toBe(404);
    expect((await call("bob", "applications", "GET")).jsonBody).toEqual([]);
    expect((await call("bob", "drafts", "GET")).jsonBody).toEqual([]);
    expect((await call("bob", "applications", "PUT", { params: { id: app.id }, body: { status: "offer" } })).status).toBe(404);
    expect((await call("bob", "drafts", "GET", { params: { id: draft.id } })).status).toBe(404);
    expect((await call("bob", "review", "POST", { params: { id: draft.id } })).status).toBe(404);
    expect((await call("bob", "reviews", "GET", { params: { id: draft.id } })).status).toBe(404);
  });

  it("sans jeton valide, toutes les routes protégées répondent 401", async () => {
    const { call } = backend();
    for (const route of ["me", "profile", "applications", "drafts", "usage", "resume", "devices"]) {
      const res = await call(null, route, route === "resume" || route === "devices" ? "POST" : "GET");
      expect(res.status, route).toBe(401);
    }
  });
});
