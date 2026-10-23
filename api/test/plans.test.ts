import { HttpRequest, InvocationContext } from "@azure/functions";
import { describe, expect, it } from "vitest";
import { plansHandler } from "../src/functions/plans";
import type { IdentityVerifier } from "../src/lib/identity";
import { MemoryStore } from "../src/lib/store";

const as = (userId: string): IdentityVerifier => ({ verify: async (t) => (t === "ok" ? { userId } : null) });
const ctx = new InvocationContext({ logHandler: () => {} });

function api(store = new MemoryStore()) {
  return (userId: string, method: string, id?: string, body?: unknown) =>
    plansHandler({ verifier: () => as(userId), store: () => store, now: () => new Date("2026-10-23T03:00:00Z") })(new HttpRequest({
      url: `https://x/api/plans${id ? `/${id}` : ""}`, method, params: id ? { id } : {},
      headers: { "x-shukatsu-token": "ok" }, body: body === undefined ? undefined : { string: JSON.stringify(body) },
    }), ctx);
}

describe("/api/plans (événements et objectifs)", () => {
  it("ajoute un événement et un objectif, triés par date puis heure", async () => {
    const call = api();
    await call("u1", "POST", undefined, { kind: "goal", title: "ES 3本提出", date: "2026-10-31" });
    await call("u1", "POST", undefined, { kind: "event", title: "合同説明会", date: "2026-10-28", time: "13:00" });
    await call("u1", "POST", undefined, { kind: "event", title: "OB訪問", date: "2026-10-28", time: "10:00" });
    const list = (await call("u1", "GET")).jsonBody as { title: string; done: boolean }[];
    expect(list.map((p) => p.title)).toEqual(["OB訪問", "合同説明会", "ES 3本提出"]);
    expect(list.every((p) => p.done === false)).toBe(true);
  });

  it("coche un objectif ; null efface l'heure", async () => {
    const call = api();
    const created = (await call("u1", "POST", undefined, { title: "説明会", date: "2026-11-02", time: "18:30" })).jsonBody as { id: string };
    const res = await call("u1", "PUT", created.id, { done: true, time: null });
    expect(res.jsonBody).toMatchObject({ title: "説明会", done: true });
    expect(res.jsonBody).not.toHaveProperty("time");
  });

  it("400 lisible : titre vide, date ou heure invalide, type inconnu", async () => {
    const res = await api()("u1", "POST", undefined, { kind: "party", title: " ", date: "28/10", time: "25:00" });
    expect(res.status).toBe(400);
    expect((res.jsonBody as { issues: { path: string }[] }).issues.map((i) => i.path).sort()).toEqual(["date", "kind", "time", "title"]);
  });

  it("isole les utilisateurs ; supprime", async () => {
    const call = api();
    const created = (await call("u1", "POST", undefined, { title: "秘密", date: "2026-11-01" })).jsonBody as { id: string };
    expect((await call("intrus", "GET")).jsonBody).toEqual([]);
    expect((await call("intrus", "PUT", created.id, { done: true })).status).toBe(404);
    expect((await call("intrus", "DELETE", created.id)).status).toBe(404);
    expect((await call("u1", "DELETE", created.id)).status).toBe(204);
  });
});
