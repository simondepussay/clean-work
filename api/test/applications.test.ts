import { HttpRequest, InvocationContext } from "@azure/functions";
import { describe, expect, it } from "vitest";
import { applicationsHandler } from "../src/functions/applications";
import type { IdentityVerifier } from "../src/lib/identity";
import { MemoryStore } from "../src/lib/store";

const as = (userId: string): IdentityVerifier => ({ verify: async (t) => (t === "ok" ? { userId } : null) });
const ctx = new InvocationContext({ logHandler: () => {} });

function api(store = new MemoryStore()) {
  const handler = (userId: string) => applicationsHandler({ verifier: () => as(userId), store: () => store, now: () => new Date("2026-10-22T03:00:00Z") });
  return (userId: string, method: string, id?: string, body?: unknown) =>
    handler(userId)(new HttpRequest({
      url: `https://x/api/applications${id ? `/${id}` : ""}`, method, params: id ? { id } : {},
      headers: { "x-shukatsu-token": "ok" }, body: body === undefined ? undefined : { string: JSON.stringify(body) },
    }), ctx);
}

describe("/api/applications", () => {
  it("crée une candidature au statut « interested » par défaut", async () => {
    const res = await api()("u1", "POST", undefined, { company: "楽天グループ", position: "エンジニア" });
    expect(res.status).toBe(201);
    expect(res.jsonBody).toMatchObject({ company: "楽天グループ", status: "interested", steps: [], nextDeadline: null });
  });

  it("fait avancer le statut et recalcule l'échéance à partir des étapes", async () => {
    const call = api();
    const created = (await call("u1", "POST", undefined, { company: "LINEヤフー" })).jsonBody as { id: string };
    const res = await call("u1", "PUT", created.id, {
      status: "es",
      steps: [{ id: "s1", type: "es", dueDate: "2026-11-01" }, { id: "s2", type: "test", dueDate: "2026-11-10" }],
    });
    expect(res.jsonBody).toMatchObject({ status: "es", nextDeadline: "2026-11-01", company: "LINEヤフー" });
  });

  it("liste par échéance la plus proche", async () => {
    const call = api();
    await call("u1", "POST", undefined, { company: "B社", steps: [{ id: "s", type: "es", dueDate: "2026-12-01" }] });
    await call("u1", "POST", undefined, { company: "A社", steps: [{ id: "s", type: "es", dueDate: "2026-11-01" }] });
    await call("u1", "POST", undefined, { company: "C社" });
    expect(((await call("u1", "GET")).jsonBody as { company: string }[]).map((a) => a.company)).toEqual(["A社", "B社", "C社"]);
  });

  it("supprime ; 404 ensuite", async () => {
    const call = api();
    const created = (await call("u1", "POST", undefined, { company: "X社" })).jsonBody as { id: string };
    expect((await call("u1", "DELETE", created.id)).status).toBe(204);
    expect((await call("u1", "DELETE", created.id)).status).toBe(404);
  });

  it("isole les utilisateurs", async () => {
    const call = api();
    const created = (await call("u1", "POST", undefined, { company: "秘密" })).jsonBody as { id: string };
    expect((await call("intrus", "GET")).jsonBody).toEqual([]);
    expect((await call("intrus", "PUT", created.id, { status: "offer" })).status).toBe(404);
    expect((await call("intrus", "DELETE", created.id)).status).toBe(404);
  });

  it("400 lisible : entreprise vide, statut inconnu, date d'étape invalide", async () => {
    const call = api();
    expect((await call("u1", "POST", undefined, { company: "" })).jsonBody).toMatchObject({ issues: [{ path: "company", message: "入力してください / Required" }] });
    expect((await call("u1", "POST", undefined, { company: "A", status: "hired" })).jsonBody)
      .toMatchObject({ issues: [{ path: "status", message: "選択してください / Please choose" }] });
    expect((await call("u1", "POST", undefined, { company: "A", steps: [{ id: "s", type: "es", dueDate: "1/11" }] })).jsonBody)
      .toMatchObject({ issues: [{ path: "steps.0.dueDate" }] });
  });
});
