import { HttpRequest, InvocationContext } from "@azure/functions";
import { describe, expect, it } from "vitest";
import { bootstrapHandler } from "../src/functions/bootstrap";
import type { IdentityVerifier } from "../src/lib/identity";
import { Repository } from "../src/lib/repository";
import { MemoryStore } from "../src/lib/store";

const as = (userId: string): IdentityVerifier => ({ verify: async (t) => (t === "ok" ? { userId, name: "Simon" } : null) });
const ctx = new InvocationContext({ logHandler: () => {} });
const NOW = new Date("2026-10-30T01:00:00Z");

function call(store: MemoryStore, userId: string, token = "ok", fetcher: typeof fetch = (async () => new Response(JSON.stringify({ "2026-11-03": "文化の日" }))) as typeof fetch) {
  return bootstrapHandler({ verifier: () => as(userId), store: () => store, now: () => NOW, fetcher })(new HttpRequest({
    url: "https://x/api/bootstrap?today=2026-10-30", method: "GET", headers: { "x-shukatsu-token": token },
  }), ctx);
}

describe("/api/bootstrap (tout l'écran d'accueil en une réponse)", () => {
  it("le service des jours fériés hors ligne ne bloque rien ; sans jeton : refusé", async () => {
    const store = new MemoryStore();
    const res = await call(store, "u1", "ok", (async () => { throw new Error("hors ligne"); }) as typeof fetch);
    expect(res.status).toBeUndefined();
    expect((res.jsonBody as { applications: unknown[] }).applications).toEqual([]);
    expect((await call(store, "u1", "faux")).status).toBe(401);
  });

  it("renvoie compte, candidatures, agenda, ES, こころ et jours fériés de l'utilisateur seulement", async () => {
    const store = new MemoryStore();
    const repo = new Repository(store, () => NOW);
    await repo.createApplication("u1", { company: "ソニー", status: "applied" });
    await repo.createApplication("u2", { company: "秘密の会社" });
    await repo.createPlan("u1", { kind: "goal", title: "ES 3本", date: "2026-11-02" });
    const res = await call(store, "u1");
    expect(res.status).toBeUndefined();
    const body = res.jsonBody as Record<string, unknown> & { applications: { company: string }[]; kokoro: { cheers: unknown[] } };
    expect(body.me).toEqual({ userId: "u1", email: null, name: "Simon", hasProfile: false });
    expect(body.applications.map((a) => a.company)).toEqual(["ソニー"]);
    expect(body).toMatchObject({ profile: null, plans: [{ title: "ES 3本" }], drafts: [], today: "2026-10-30" });
    // Les jours fériés passent par le cache du serveur (partagé entre les tests) : un objet, rempli ou non.
    expect(typeof body.holidays).toBe("object");
    expect(Array.isArray(body.kokoro.cheers)).toBe(true);
  });
});
