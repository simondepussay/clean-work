import { HttpRequest, InvocationContext } from "@azure/functions";
import { describe, expect, it } from "vitest";
import { draftsHandler } from "../src/functions/drafts";
import type { IdentityVerifier } from "../src/lib/identity";

const as = (userId: string): IdentityVerifier => ({ verify: async (t) => (t === "ok" ? { userId } : null) });
const ctx = new InvocationContext({ logHandler: () => {} });

function call(userId: string, method: string, id?: string, body?: unknown) {
  const req = new HttpRequest({
    url: `https://x/api/drafts${id ? `/${id}` : ""}`,
    method,
    params: id ? { id } : {},
    headers: { "x-shukatsu-token": "ok", "content-type": "application/json" },
    body: body === undefined ? undefined : { string: JSON.stringify(body) },
  });
  return draftsHandler(() => as(userId))(req, ctx);
}

const jikoPR = { question: "自己PRをしてください", charLimit: 400, body: "私の強みは…" };

describe("/api/drafts", () => {
  it("crée une ES « commune », sans candidature", async () => {
    const res = await call("d1", "POST", undefined, jikoPR);
    expect(res.status).toBe(201);
    expect(res.jsonBody).toMatchObject({ ...jikoPR, userId: "d1", kind: "free" });
    expect(res.jsonBody).not.toHaveProperty("applicationId");
  });

  it("liste les ES, la plus récemment modifiée d'abord", async () => {
    const a = (await call("d2", "POST", undefined, { ...jikoPR, question: "A" })).jsonBody as { id: string };
    await call("d2", "POST", undefined, { ...jikoPR, question: "B" });
    await new Promise((r) => setTimeout(r, 5));
    await call("d2", "PUT", a.id, { body: "modifiée" });
    const list = (await call("d2", "GET")).jsonBody as { question: string }[];
    expect(list.map((d) => d.question)).toEqual(["A", "B"]);
  });

  it("modifie seulement les champs envoyés", async () => {
    const created = (await call("d3", "POST", undefined, { ...jikoPR, company: "楽天" })).jsonBody as { id: string; createdAt: string };
    const updated = (await call("d3", "PUT", created.id, { body: "新しい本文" })).jsonBody;
    expect(updated).toMatchObject({ question: jikoPR.question, company: "楽天", body: "新しい本文", createdAt: created.createdAt });
  });

  it("garde le type de question, et refuse un type inconnu", async () => {
    expect((await call("d7", "POST", undefined, { ...jikoPR, kind: "jikopr" })).jsonBody).toMatchObject({ kind: "jikopr" });
    expect((await call("d7", "POST", undefined, { ...jikoPR, kind: "poème" })).status).toBe(400);
  });

  it("relie une ES à une candidature, puis la délie avec applicationId: null", async () => {
    const created = (await call("d8", "POST", undefined, { ...jikoPR, company: "楽天", applicationId: "app-1" })).jsonBody as { id: string };
    expect((await call("d8", "GET", created.id)).jsonBody).toMatchObject({ applicationId: "app-1", company: "楽天" });
    const unlinked = (await call("d8", "PUT", created.id, { applicationId: null, company: "" })).jsonBody;
    expect(unlinked).not.toHaveProperty("applicationId");
  });

  it("supprime une ES", async () => {
    const created = (await call("d4", "POST", undefined, jikoPR)).jsonBody as { id: string };
    expect((await call("d4", "DELETE", created.id)).status).toBe(204);
    expect((await call("d4", "GET", created.id)).status).toBe(404);
  });

  it("isole les utilisateurs", async () => {
    const created = (await call("d5", "POST", undefined, jikoPR)).jsonBody as { id: string };
    expect((await call("intrus", "GET", created.id)).status).toBe(404);
    expect((await call("intrus", "PUT", created.id, { body: "x" })).status).toBe(404);
    expect((await call("intrus", "DELETE", created.id)).status).toBe(404);
    expect((await call("d5", "GET", created.id)).jsonBody).toMatchObject({ id: created.id, userId: "d5" });
  });

  it("400 lisible : question vide, nombre de caractères invalide", async () => {
    const res = await call("d6", "POST", undefined, { question: "", charLimit: -3 });
    expect(res.status).toBe(400);
    expect(res.jsonBody).toMatchObject({
      issues: [
        { path: "question", message: "入力してください / Required" },
        { path: "charLimit", message: "1〜5000の数字で入力してください / Enter a number from 1 to 5000" },
      ],
    });
  });
});
