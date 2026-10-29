import { HttpRequest, InvocationContext } from "@azure/functions";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTPayload, type KeyLike } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { EntraVerifier, TOKEN_HEADER, verifierFromEnv, type IdentityVerifier } from "../src/lib/identity";
import { cronSecretFromEnv, CRON_HEADER, MAX_BODY_BYTES, RateLimiter, withCron, withUser } from "../src/lib/http";
import { z } from "zod";

const TENANT = "11111111-2222-3333-4444-555555555555";
const API = "api-client-id";
const ISSUER = `https://${TENANT}.ciamlogin.com/${TENANT}/v2.0`;

let key: KeyLike;
let otherKey: KeyLike;
let verifier: EntraVerifier;

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  key = pair.privateKey;
  otherKey = (await generateKeyPair("RS256")).privateKey;
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: "k1", alg: "RS256" };
  verifier = new EntraVerifier(TENANT, API, createLocalJWKSet({ keys: [jwk] }));
});

function token(claims: JWTPayload = {}, opts: { signWith?: KeyLike; expires?: string; issuer?: string; audience?: string } = {}) {
  return new SignJWT({ oid: "user-oid", scp: "access", email: "simon@example.com", ...claims })
    .setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setIssuer(opts.issuer ?? ISSUER)
    .setAudience(opts.audience ?? API)
    .setIssuedAt()
    .setExpirationTime(opts.expires ?? "1h")
    .sign(opts.signWith ?? key);
}

describe("EntraVerifier", () => {
  it("accepte un jeton valide et prend oid comme userId", async () => {
    expect(await verifier.verify(await token())).toEqual({ userId: "user-oid", email: "simon@example.com", name: undefined });
  });

  it("refuse l'absence de jeton", async () => {
    expect(await verifier.verify(null)).toBeNull();
    expect(await verifier.verify("")).toBeNull();
  });

  it("refuse un jeton signé par une autre clé", async () => {
    expect(await verifier.verify(await token({}, { signWith: otherKey }))).toBeNull();
  });

  it("refuse un jeton expiré", async () => {
    expect(await verifier.verify(await token({}, { expires: "-1m" }))).toBeNull();
  });

  it("refuse un autre émetteur (un autre annuaire)", async () => {
    expect(await verifier.verify(await token({}, { issuer: "https://login.microsoftonline.com/autre/v2.0" }))).toBeNull();
  });

  it("refuse un jeton destiné à une autre API", async () => {
    expect(await verifier.verify(await token({}, { audience: "autre-api" }))).toBeNull();
  });

  it("refuse un jeton sans la permission access", async () => {
    expect(await verifier.verify(await token({ scp: "openid profile" }))).toBeNull();
  });

  it("refuse un jeton sans oid", async () => {
    expect(await verifier.verify(await token({ oid: undefined }))).toBeNull();
  });

  it("refuse un jeton modifié après signature", async () => {
    const [h, , s] = (await token()).split(".");
    const forged = Buffer.from(JSON.stringify({ oid: "admin", scp: "access", iss: ISSUER, aud: API, exp: 9999999999 })).toString("base64url");
    expect(await verifier.verify(`${h}.${forged}.${s}`)).toBeNull();
  });
});

describe("verifierFromEnv", () => {
  it("renvoie null tant que l'annuaire n'est pas configuré", () => {
    expect(verifierFromEnv({})).toBeNull();
    expect(verifierFromEnv({ ENTRA_TENANT_ID: TENANT })).toBeNull();
    expect(verifierFromEnv({ ENTRA_TENANT_ID: TENANT, ENTRA_API_CLIENT_ID: API })).toBeInstanceOf(EntraVerifier);
  });
});

describe("withUser", () => {
  const ctx = new InvocationContext();
  const req = (headers: Record<string, string> = {}) => new HttpRequest({ url: "https://x/api/me", method: "GET", headers });
  const echo = withUser(async (_r, user) => ({ jsonBody: user }), () => verifier);

  it("503 tant que l'annuaire n'est pas configuré", async () => {
    expect((await withUser(async () => ({}), () => null)(req(), ctx)).status).toBe(503);
  });

  it("401 sans jeton ou avec un jeton invalide", async () => {
    expect((await echo(req(), ctx)).status).toBe(401);
    expect((await echo(req({ [TOKEN_HEADER]: "n'importe quoi" }), ctx)).status).toBe(401);
  });

  it("ignore l'en-tête Authorization", async () => {
    expect((await echo(req({ authorization: `Bearer ${await token()}` }), ctx)).status).toBe(401);
  });

  it("passe l'utilisateur au gestionnaire avec un jeton valide", async () => {
    const res = await echo(req({ [TOKEN_HEADER]: await token() }), ctx);
    expect(res.status).toBeUndefined();
    expect(res.jsonBody).toMatchObject({ userId: "user-oid" });
  });

  it("transforme une erreur de validation en 400 lisible", async () => {
    const failing = withUser(async () => { z.object({ company: z.string().min(1) }).parse({ company: "" }); return {}; }, () => verifier);
    const res = await failing(req({ [TOKEN_HEADER]: await token() }), ctx);
    expect(res.status).toBe(400);
    expect(res.jsonBody).toMatchObject({ error: "invalid", issues: [{ path: "company" }] });
  });

  it("masque les erreurs internes", async () => {
    const quietCtx = new InvocationContext({ logHandler: () => {} });
    const failing = withUser(async () => { throw new Error("secret interne"); }, () => verifier);
    const res = await failing(req({ [TOKEN_HEADER]: await token() }), quietCtx);
    expect(res).toEqual({ status: 500, jsonBody: { error: "internal" } });
  });
});

describe("limites de withUser", () => {
  const ctx = new InvocationContext();
  const ok: IdentityVerifier = { verify: async (t) => (t ? { userId: t } : null) };
  const req = (method: string, user: string, headers: Record<string, string> = {}) =>
    new HttpRequest({ url: "https://x/api/drafts", method, headers: { [TOKEN_HEADER]: user, ...headers } });

  it("413 avant toute lecture si le corps annoncé est trop gros", async () => {
    let called = false;
    const h = withUser(async () => { called = true; return {}; }, () => ok);
    const res = await h(req("POST", "u1", { "content-length": String(MAX_BODY_BYTES + 1) }), ctx);
    expect(res.status).toBe(413);
    expect(called).toBe(false);
  });

  it("429 au-delà de la limite d'écritures par minute, pour cet utilisateur seulement", async () => {
    const limiters = { all: new RateLimiter(100), writes: new RateLimiter(2) };
    const h = withUser(async () => ({ status: 204 }), () => ok, limiters);
    expect((await h(req("POST", "u1"), ctx)).status).toBe(204);
    expect((await h(req("PUT", "u1"), ctx)).status).toBe(204);
    expect((await h(req("DELETE", "u1"), ctx)).status).toBe(429);
    // Les lectures et les autres utilisateurs ne sont pas bloqués.
    expect((await h(req("GET", "u1"), ctx)).status).toBe(204);
    expect((await h(req("POST", "u2"), ctx)).status).toBe(204);
  });

  it("la limite se libère après la fenêtre", () => {
    let t = 0;
    const limiter = new RateLimiter(1, 60_000, () => t);
    expect(limiter.take("u")).toBe(true);
    expect(limiter.take("u")).toBe(false);
    t = 60_000;
    expect(limiter.take("u")).toBe(true);
  });
});

describe("withCron", () => {
  const ctx = new InvocationContext();
  const SECRET = "c".repeat(40);
  const h = withCron(() => SECRET, async () => ({ jsonBody: "fait" }));
  const req = (secret?: string) => new HttpRequest({ url: "https://x/api/push/run", method: "POST", headers: secret ? { [CRON_HEADER]: secret } : {} });

  it("401 sans le bon secret, et avec un secret trop court côté serveur", async () => {
    expect((await h(req(), ctx)).status).toBe(401);
    expect((await h(req("c".repeat(39)), ctx)).status).toBe(401);
    expect((await withCron(() => "court", async () => ({}))(req("court"), ctx)).status).toBe(401);
  });

  it("passe avec le bon secret", async () => {
    expect((await h(req(SECRET), ctx)).jsonBody).toBe("fait");
  });

  it("un secret par tâche ; l'ancien secret commun sert tant qu'il n'est pas posé", () => {
    const env = { PUSH_CRON_SECRET: "ancien", CRON_SECRET_BETA: "beta" };
    expect(cronSecretFromEnv("BETA", env)).toBe("beta");
    expect(cronSecretFromEnv("INFO", env)).toBe("ancien");
  });
});
