import { HttpRequest, InvocationContext } from "@azure/functions";
import { describe, expect, it } from "vitest";
import { kokoroHandler } from "../src/functions/kokoro";
import type { IdentityVerifier } from "../src/lib/identity";
import { prefectureOf, supportLevel, type Mood } from "../src/lib/kokoro";
import { containers } from "../src/lib/models";
import { Repository } from "../src/lib/repository";
import { MemoryStore } from "../src/lib/store";

const as = (userId: string): IdentityVerifier => ({ verify: async (t) => (t === "ok" ? { userId } : null) });
const ctx = new InvocationContext({ logHandler: () => {} });
const NOW = new Date("2026-10-28T03:00:00Z");

function api(store = new MemoryStore()) {
  return (userId: string, method: string, part?: string, body?: unknown, query = "") =>
    kokoroHandler({ verifier: () => as(userId), store: () => store, now: () => NOW })(new HttpRequest({
      url: `https://x/api/kokoro${part ? `/${part}` : ""}${query}`, method, params: part ? { part } : {},
      headers: { "x-shukatsu-token": "ok" }, body: body === undefined ? undefined : { string: JSON.stringify(body) },
    }), ctx);
}

/** n jours notés en finissant le 2026-10-28. */
const days = (weathers: Mood["weather"][]) =>
  weathers.map((weather, i) => ({ date: new Date(Date.UTC(2026, 9, 28 - (weathers.length - 1 - i))).toISOString().slice(0, 10), weather }));

describe("こころ — paliers de soutien", () => {
  it("calme sans note, ou quand le dernier jour est ensoleillé", () => {
    expect(supportLevel([], "2026-10-28").level).toBe("calm");
    expect(supportLevel(days(["rainy", "sunny"]), "2026-10-28").level).toBe("calm");
  });

  it("un jour de pluie récent → « rain » ; une pluie d'il y a 3 jours ne compte plus", () => {
    expect(supportLevel(days(["sunny", "rainy"]), "2026-10-28").level).toBe("rain");
    expect(supportLevel([{ date: "2026-10-25", weather: "rainy" }], "2026-10-28").level).toBe("calm");
  });

  it("3 jours de pluie sur 7 → « often »", () => {
    const s = supportLevel(days(["rainy", "sunny", "rainy", "cloudy", "sunny", "rainy", "sunny"]), "2026-10-28");
    expect(s).toEqual({ level: "often", rainy7: 3, rainy14: 3 });
  });

  it("de la pluie la plupart des jours sur 2 semaines (10/14) → « long »", () => {
    const fourteen = days(["rainy", "rainy", "cloudy", "rainy", "rainy", "rainy", "sunny", "rainy", "rainy", "cloudy", "rainy", "rainy", "rainy", "cloudy"]);
    expect(supportLevel(fourteen, "2026-10-28").level).toBe("long");
    expect(supportLevel(fourteen.slice(1), "2026-10-28").level).toBe("often");
  });

  it("préfecture lue au début de l'adresse", () => {
    expect(prefectureOf("東京都新宿区西新宿1-7-3")).toBe("東京都");
    expect(prefectureOf("大阪府大阪市北区")).toBe("大阪府");
    expect(prefectureOf("神奈川県横浜市")).toBe("神奈川県");
    expect(prefectureOf("北海道札幌市")).toBe("北海道");
    expect(prefectureOf("Tokyo")).toBeNull();
    expect(prefectureOf(undefined)).toBeNull();
  });
});

describe("/api/kokoro", () => {
  it("note un jour, le remplace, puis l'efface avec null", async () => {
    const call = api();
    expect((await call("u1", "PUT", "mood", { date: "2026-10-28", weather: "rainy", word: "不安" })).status).toBe(204);
    expect((await call("u1", "GET")).jsonBody).toMatchObject({ moods: [{ date: "2026-10-28", weather: "rainy", word: "不安" }], support: { level: "rain" } });
    await call("u1", "PUT", "mood", { date: "2026-10-28", weather: "sunny" });
    expect((await call("u1", "GET")).jsonBody).toMatchObject({ moods: [{ date: "2026-10-28", weather: "sunny" }], support: { level: "calm" } });
    await call("u1", "PUT", "mood", { date: "2026-10-28", weather: null });
    expect(((await call("u1", "GET")).jsonBody as { moods: unknown[] }).moods).toEqual([]);
  });

  it("refuse une date trop loin dans le futur ou une humeur inconnue", async () => {
    const call = api();
    expect((await call("u1", "PUT", "mood", { date: "2026-11-05", weather: "sunny" })).status).toBe(400);
    expect((await call("u1", "PUT", "mood", { date: "2026-10-28", weather: "stormy" })).status).toBe(400);
    // Le fuseau de l'appareil peut avoir un jour d'avance sur le serveur.
    expect((await call("u1", "PUT", "mood", { date: "2026-10-29", weather: "sunny" })).status).toBe(204);
  });

  it("garde jusqu'à 3 valeurs, sans les lignes vides", async () => {
    const call = api();
    expect((await call("u1", "PUT", "values", { values: ["家族を安心させたい", " ", "誠実でいること"] })).jsonBody).toEqual({ values: ["家族を安心させたい", "誠実でいること"] });
    expect((await call("u1", "PUT", "values", { values: ["a", "b", "c", "d"] })).status).toBe(400);
  });

  it("chacun ne voit que ses propres notes, et l'effacement supprime tout", async () => {
    const store = new MemoryStore();
    const call = api(store);
    await call("u1", "PUT", "mood", { date: "2026-10-28", weather: "rainy" });
    await call("u1", "PUT", "values", { values: ["家族"] });
    expect(((await call("u2", "GET")).jsonBody as { moods: unknown[] }).moods).toEqual([]);
    expect((await call("u1", "DELETE")).status).toBe(204);
    expect((await call("u1", "GET")).jsonBody).toMatchObject({ moods: [], values: [] });
  });

  it("personnalise : la semaine écoulée, la préfecture et les aides pour étudiants étrangers", async () => {
    const store = new MemoryStore();
    const repo = new Repository(store, () => NOW);
    await store.put(containers.profiles, {
      id: "u1", userId: "u1", address: "東京都新宿区西新宿1-7-3",
      languages: [{ language: "ja", level: "business" }, { language: "fr", level: "native" }],
    });
    await repo.createApplication("u1", { company: "ソニー", status: "applied" });
    const rejected = await repo.createApplication("u1", { company: "トヨタ" });
    await repo.updateApplication("u1", rejected.id, { status: "rejected" });
    const body = (await api(store)("u1", "GET", undefined, undefined, "?today=2026-10-28")).jsonBody;
    expect(body).toMatchObject({ prefecture: "東京都", international: true, week: { applications: 2, drafts: 0, interviews: 0, rejections: 1 } });
  });

  it("le document reste dans le conteneur des profils, avec le reste des données du compte", async () => {
    const store = new MemoryStore();
    await api(store)("u1", "PUT", "mood", { date: "2026-10-28", weather: "cloudy" });
    expect(await store.get(containers.profiles, "u1", "kokoro")).toMatchObject({ moods: [{ weather: "cloudy" }] });
    expect(await new Repository(store, () => NOW).scheduleDeletion("u1", 30)).toBe(1);
  });
});
