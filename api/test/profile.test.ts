import { HttpRequest, InvocationContext } from "@azure/functions";
import { describe, expect, it } from "vitest";
import { profileHandler } from "../src/functions/profile";
import type { IdentityVerifier } from "../src/lib/identity";

// Sans COSMOS_ENDPOINT, getStore() renvoie un store en mémoire partagé : chaque test utilise son propre utilisateur.
const as = (userId: string): IdentityVerifier => ({ verify: async (t) => (t === "ok" ? { userId } : null) });
const ctx = new InvocationContext({ logHandler: () => {} });

function call(userId: string, method: "GET" | "PUT", body?: unknown) {
  const req = new HttpRequest({
    url: "https://x/api/profile",
    method,
    headers: { "x-shukatsu-token": "ok", "content-type": "application/json" },
    body: body === undefined ? undefined : { string: JSON.stringify(body) },
  });
  return profileHandler(() => as(userId))(req, ctx);
}

const valid = {
  nameKanji: "デプセ シモン",
  nameKana: "デプセ シモン",
  nameLatin: "Simon Depussay",
  education: [{ school: "HAL東京", faculty: "情報処理", start: "2026-04", status: "enrolled" }],
  languages: [{ language: "ja", level: "business" }],
};

describe("/api/profile", () => {
  it("404 tant qu'il n'y a pas de profil", async () => {
    expect(await call("p1", "GET")).toEqual({ status: 404, jsonBody: { error: "not_found" } });
  });

  it("enregistre puis relit le profil", async () => {
    const saved = await call("p2", "PUT", valid);
    expect(saved.jsonBody).toMatchObject({ id: "p2", userId: "p2", nameLatin: "Simon Depussay", work: [] });
    expect((await call("p2", "GET")).jsonBody).toMatchObject({ education: [{ school: "HAL東京" }] });
  });

  it("ignore un userId glissé dans le corps", async () => {
    const saved = await call("p3", "PUT", { ...valid, userId: "quelqu-un-d-autre", id: "autre" });
    expect(saved.jsonBody).toMatchObject({ id: "p3", userId: "p3" });
    expect((await call("quelqu-un-d-autre", "GET")).status).toBe(404);
  });

  it("400 avec le chemin du champ invalide", async () => {
    const res = await call("p4", "PUT", { ...valid, education: [{ school: "HAL", start: "avril 2026", status: "enrolled" }] });
    expect(res.status).toBe(400);
    expect(res.jsonBody).toMatchObject({ error: "invalid", issues: [{ path: "education.0.start" }] });
  });

  it("400 si le corps n'est pas du JSON", async () => {
    const req = new HttpRequest({ url: "https://x/api/profile", method: "PUT", headers: { "x-shukatsu-token": "ok" }, body: { string: "pas du json" } });
    expect((await profileHandler(() => as("p5"))(req, ctx)).status).toBe(400);
  });

  it("401 sans jeton valide", async () => {
    const req = new HttpRequest({ url: "https://x/api/profile", method: "GET", headers: { "x-shukatsu-token": "mauvais" } });
    expect((await profileHandler(() => as("p6"))(req, ctx)).status).toBe(401);
  });
});
