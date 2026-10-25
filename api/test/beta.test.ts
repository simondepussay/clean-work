import { HttpRequest, InvocationContext } from "@azure/functions";
import { describe, expect, it } from "vitest";
import { betaDigestHandler, betaSignupHandler } from "../src/functions/beta";
import { MemoryStore } from "../src/lib/store";

const ctx = new InvocationContext({ logHandler: () => {} });
const SECRET = "s".repeat(40);
const NOW = new Date("2026-10-26T01:00:00Z");

function send(store: MemoryStore, body: unknown, ip = "203.0.113.7") {
  return betaSignupHandler({ store: () => store, now: () => NOW })(
    new HttpRequest({ url: "https://x/api/beta", method: "POST", headers: { "x-azure-clientip": ip }, body: { string: JSON.stringify(body) } }), ctx);
}
const ok = { email: "Student@Example.com", device: "iphone", lang: "ja", consent: true, website: "" };

describe("bêta TestFlight", () => {
  it("enregistre une demande ; la même adresse une seconde fois → « déjà reçue »", async () => {
    const store = new MemoryStore();
    expect((await send(store, ok)).status).toBe(201);
    expect((await send(store, { ...ok, email: "student@example.com" })).jsonBody).toEqual({ status: "already" });
  });

  it("refuse sans consentement ou avec une adresse invalide", async () => {
    const store = new MemoryStore();
    expect((await send(store, { ...ok, consent: false })).status).toBe(400);
    expect((await send(store, { ...ok, email: "pas-une-adresse" })).status).toBe(400);
  });

  it("un robot qui remplit le champ caché croit avoir réussi, mais rien n'est gardé", async () => {
    const store = new MemoryStore();
    expect((await send(store, { ...ok, website: "https://spam.example" })).status).toBe(201);
    const digest = await betaDigestHandler({ store: () => store, secret: () => SECRET })(
      new HttpRequest({ url: "https://x/api/beta/run", method: "POST", headers: { "x-shukatsu-cron": SECRET } }));
    expect(digest.jsonBody).toEqual({ signups: [] });
  });

  it("au plus 5 demandes par jour depuis la même connexion", async () => {
    const store = new MemoryStore();
    for (let i = 0; i < 5; i++) expect((await send(store, { ...ok, email: `a${i}@example.com` })).status).toBe(201);
    expect((await send(store, { ...ok, email: "a5@example.com" })).status).toBe(429);
    expect((await send(store, { ...ok, email: "b@example.com" }, "198.51.100.2")).status).toBe(201);
  });

  it("le matin : les nouvelles demandes une seule fois, et seulement avec le secret", async () => {
    const store = new MemoryStore();
    await send(store, { ...ok, device: "ipad", message: "HALの学生です" });
    const run = (secret?: string) => betaDigestHandler({ store: () => store, secret: () => SECRET })(
      new HttpRequest({ url: "https://x/api/beta/run", method: "POST", headers: secret ? { "x-shukatsu-cron": secret } : {} }));
    expect((await run()).status).toBe(401);
    expect((await run(SECRET)).jsonBody).toEqual({ signups: [{ email: "student@example.com", device: "ipad", message: "HALの学生です", lang: "ja", createdAt: NOW.toISOString() }] });
    expect((await run(SECRET)).jsonBody).toEqual({ signups: [] });
  });
});
