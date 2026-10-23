import { HttpRequest, InvocationContext } from "@azure/functions";
import { describe, expect, it } from "vitest";
import { reportHandler } from "../src/functions/report";
import { weeklyReport } from "../src/lib/report";
import { MemoryStore } from "../src/lib/store";
import { UsageLimiter } from "../src/lib/usage";

describe("rapport de la semaine", () => {
  it("coût de l'IA jour par jour (7 jours), total de la semaine et du mois, budget restant", async () => {
    const store = new MemoryStore();
    const at = (iso: string) => new UsageLimiter(store, () => new Date(iso));
    await at("2026-10-20T03:00:00Z").recordCost(0.6);
    await at("2026-10-20T05:00:00Z").recordCost(3.4);
    await at("2026-10-22T23:00:00Z").recordCost(0.55);
    await at("2026-10-01T03:00:00Z").recordCost(10);
    const r = await weeklyReport(store, new Date("2026-10-26T00:00:00Z"));
    expect(r.daily.map((d) => d.day)).toEqual(["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25"]);
    expect(r.daily[1].costJpy).toBe(4);
    expect(r.weekCostJpy).toBe(4.55);
    expect(r).toMatchObject({ month: "2026-10", monthCostJpy: 14.55, budgetJpy: 3000, budgetLeftJpy: 2985.45 });
  });

  it("une semaine à cheval sur deux mois", async () => {
    const store = new MemoryStore();
    await new UsageLimiter(store, () => new Date("2026-10-31T03:00:00Z")).recordCost(1);
    await new UsageLimiter(store, () => new Date("2026-11-02T03:00:00Z")).recordCost(2);
    const r = await weeklyReport(store, new Date("2026-11-03T00:00:00Z"));
    expect(r.weekCostJpy).toBe(3);
    expect(r.monthCostJpy).toBe(2);
  });

  it("exige le secret de la tâche planifiée", async () => {
    const res = await reportHandler({ store: () => new MemoryStore(), secret: () => "s".repeat(40) })(
      new HttpRequest({ url: "https://x/api/report/run", method: "POST" }), new InvocationContext({ logHandler: () => {} }));
    expect(res.status).toBe(401);
  });
});
