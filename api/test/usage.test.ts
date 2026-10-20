import { describe, expect, it } from "vitest";
import { GLOBAL, UsageLimiter } from "../src/lib/usage";
import { MemoryStore } from "../src/lib/store";

const at = (iso: string) => () => new Date(iso);
const limits = { perDay: 3, perMonth: 5, monthlyBudgetJpy: 100 };

describe("UsageLimiter", () => {
  it("accepte jusqu'à la limite du jour, puis refuse jusqu'au lendemain", async () => {
    const store = new MemoryStore();
    const limiter = new UsageLimiter(store, at("2026-10-20T10:00:00Z"), limits);
    for (let i = 0; i < 3; i++) expect((await limiter.reserve("u1")).ok).toBe(true);
    expect(await limiter.reserve("u1")).toEqual({ ok: false, refusal: { reason: "day", retryAfter: "2026-10-21T00:00:00.000Z" } });
    expect(await limiter.remaining("u1")).toEqual({ today: 0, month: 2 });
  });

  it("un refus ne consomme rien", async () => {
    const store = new MemoryStore();
    const limiter = new UsageLimiter(store, at("2026-10-20T10:00:00Z"), limits);
    for (let i = 0; i < 3; i++) await limiter.reserve("u1");
    for (let i = 0; i < 5; i++) await limiter.reserve("u1");
    expect(await limiter.remaining("u1")).toEqual({ today: 0, month: 2 });
  });

  it("refuse au-delà de la limite du mois, même un autre jour", async () => {
    const store = new MemoryStore();
    for (const day of ["2026-10-20", "2026-10-21"]) {
      const limiter = new UsageLimiter(store, at(`${day}T10:00:00Z`), limits);
      for (let i = 0; i < 3; i++) await limiter.reserve("u1");
    }
    const third = new UsageLimiter(store, at("2026-10-22T10:00:00Z"), limits);
    expect(await third.reserve("u1")).toEqual({ ok: false, refusal: { reason: "month", retryAfter: "2026-11-01T00:00:00.000Z" } });
  });

  it("un nouveau mois remet les compteurs à zéro", async () => {
    const store = new MemoryStore();
    const october = new UsageLimiter(store, at("2026-10-31T10:00:00Z"), limits);
    for (let i = 0; i < 3; i++) await october.reserve("u1");
    expect((await new UsageLimiter(store, at("2026-11-01T00:00:01Z"), limits).reserve("u1")).ok).toBe(true);
  });

  it("rendre une réservation (échec de l'IA) libère la place", async () => {
    const limiter = new UsageLimiter(new MemoryStore(), at("2026-10-20T10:00:00Z"), limits);
    const r = await limiter.reserve("u1");
    if (!r.ok) throw new Error("refusé");
    await r.reservation.release();
    expect(await limiter.remaining("u1")).toEqual({ today: 3, month: 5 });
  });

  it("les utilisateurs ont chacun leurs compteurs", async () => {
    const limiter = new UsageLimiter(new MemoryStore(), at("2026-10-20T10:00:00Z"), limits);
    for (let i = 0; i < 3; i++) await limiter.reserve("u1");
    expect((await limiter.reserve("u2")).ok).toBe(true);
  });

  it("arrête tout le monde quand le budget du mois est atteint", async () => {
    const store = new MemoryStore();
    const limiter = new UsageLimiter(store, at("2026-10-20T10:00:00Z"), limits);
    await limiter.recordCost(60);
    expect((await limiter.reserve("u1")).ok).toBe(true);
    await limiter.recordCost(45);
    expect(await limiter.reserve("u2")).toEqual({ ok: false, refusal: { reason: "budget", retryAfter: "2026-11-01T00:00:00.000Z" } });
    expect(store.all("usage", GLOBAL)[0]).toMatchObject({ costJpy: 105, ttl: 400 * 86400 });
  });
});
