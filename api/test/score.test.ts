import { HttpRequest, InvocationContext } from "@azure/functions";
import { describe, expect, it } from "vitest";
import { applicationsHandler } from "../src/functions/applications";
import { scoreHandler } from "../src/functions/score";
import type { IdentityVerifier } from "../src/lib/identity";
import { DAILY_CAP, levelOf, POINTS, profileEvents, ScoreService } from "../src/lib/score";
import { MemoryStore } from "../src/lib/store";

const as = (userId: string): IdentityVerifier => ({ verify: async (t) => (t === "ok" ? { userId } : null) });
const ctx = new InvocationContext({ logHandler: () => {} });
const at = (iso: string) => () => new Date(iso);

describe("ScoreService", () => {
  it("compte chaque geste une seule fois", async () => {
    const score = new ScoreService(new MemoryStore(), at("2026-11-17T03:00:00Z"));
    expect(await score.award("u1", [{ kind: "mood", key: "2026-11-17" }])).toBe(POINTS.mood);
    expect(await score.award("u1", [{ kind: "mood", key: "2026-11-17" }])).toBe(0);
    expect(await score.award("u1", [{ kind: "mood", key: "2026-11-18" }])).toBe(POINTS.mood);
    expect((await score.view("u1")).points).toBe(2 * POINTS.mood);
    expect((await score.view("u2")).points).toBe(0);
  });

  it("plafonne les points du jour, puis le même geste compte le lendemain", async () => {
    const store = new MemoryStore();
    const today = new ScoreService(store, at("2026-11-17T03:00:00Z"));
    const many = Array.from({ length: 30 }, (_, i) => ({ kind: "application" as const, key: `a${i}` }));
    expect(await today.award("u1", many)).toBe(DAILY_CAP);
    expect((await today.view("u1")).points).toBe(DAILY_CAP);
    const tomorrow = new ScoreService(store, at("2026-11-18T03:00:00Z"));
    expect(await tomorrow.award("u1", [{ kind: "application", key: "a29" }])).toBe(POINTS.application);
  });

  it("calcule le niveau", () => {
    expect(levelOf(0)).toEqual({ points: 0, level: 0, floor: 0, next: 50 });
    expect(levelOf(160)).toEqual({ points: 160, level: 2, floor: 150, next: 400 });
    expect(levelOf(5000)).toMatchObject({ level: 5, next: null });
  });

  it("donne des points pour chaque rubrique remplie du profil, pas pour les vides", () => {
    const keys = profileEvents({ id: "u1", userId: "u1", updatedAt: "x", nameKanji: "山田", university: " ", work: [], languages: [{}] }).map((e) => e.key);
    expect(keys).toEqual(["nameKanji", "languages"]);
  });
});

describe("/api/score", () => {
  it("monte quand on ajoute une candidature puis qu'elle avance ; supprimer ne retire rien", async () => {
    const store = new MemoryStore();
    const req = (method: string, path: string, id?: string, body?: unknown) => new HttpRequest({
      url: `https://x/api/${path}${id ? `/${id}` : ""}`, method, params: id ? { id } : {},
      headers: { "x-shukatsu-token": "ok" }, body: body === undefined ? undefined : { string: JSON.stringify(body) },
    });
    const apps = applicationsHandler({ verifier: () => as("u1"), store: () => store, now: at("2026-11-17T03:00:00Z") });
    const score = async () => (await scoreHandler({ verifier: () => as("u1"), store: () => store })(req("GET", "score"), ctx)).jsonBody as { points: number };

    const created = (await apps(req("POST", "applications", undefined, { company: "株式会社ミライ" }), ctx)).jsonBody as { id: string };
    expect((await score()).points).toBe(POINTS.application);
    await apps(req("PUT", "applications", created.id, { status: "applied" }), ctx);
    await apps(req("PUT", "applications", created.id, { status: "applied" }), ctx);
    expect((await score()).points).toBe(POINTS.application + POINTS.step);
    await apps(req("DELETE", "applications", created.id), ctx);
    expect((await score()).points).toBe(POINTS.application + POINTS.step);
  });
});
