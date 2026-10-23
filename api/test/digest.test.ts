import { HttpRequest, InvocationContext } from "@azure/functions";
import { describe, expect, it } from "vitest";
import { infoHandlers } from "../src/functions/info";
import { GLOBAL, infoPage, PAGE_SIZE, runDigest, type InfoCard } from "../src/lib/digest";
import { containers } from "../src/lib/models";
import type { NewsItem } from "../src/lib/news";
import type { ChatMessage, StructuredModel } from "../src/lib/review";
import { MemoryStore } from "../src/lib/store";

const NOW = new Date("2026-10-22T23:00:00Z"); // 8 h le 23 à Tokyo
const t = (s: string) => ({ ja: `${s}（ja）`, en: `${s} (en)`, fr: `${s} (fr)` });
const news = (n: number, prefix = "n"): NewsItem[] => Array.from({ length: n }, (_, i) => ({
  source: "mhlw", title: `見出し${prefix}${i}`, link: `https://example.jp/${prefix}${i}`, date: "2026-10-22T20:00:00Z", excerpt: "",
}));

/** Faux modèle : choisit les 6 premiers liens proposés, plus un lien inventé (écarté). */
class Picker implements StructuredModel {
  name = "fake";
  calls: ChatMessage[][] = [];
  async complete<T>(messages: ChatMessage[]) {
    this.calls.push(messages);
    const links = [...messages[1].content.matchAll(/link: (\S+)/g)].map((m) => m[1]);
    const picks = [...links.slice(0, 6), "https://invented.example/x", links[0]].map((link) => ({ link, title: t(link), summary: t("raison") }));
    return { result: { picks } as T, usage: { inputTokens: 2000, outputTokens: 800 } };
  }
}

describe("sélection quotidienne (情報)", () => {
  it("5 actualités par jour, seulement des liens proposés, sans doublon ; une seule fois par jour", async () => {
    const store = new MemoryStore();
    const model = new Picker();
    const first = await runDigest(store, model, NOW, async () => news(20));
    expect(first).toMatchObject({ added: 5, skipped: false });
    const stored = await store.list<InfoCard>(containers.content, GLOBAL);
    expect(stored.map((s) => s.id)).toEqual(["news-2026-10-23-1", "news-2026-10-23-2", "news-2026-10-23-3", "news-2026-10-23-4", "news-2026-10-23-5"]);
    expect(stored.every((s) => s.link?.startsWith("https://example.jp/"))).toBe(true);
    expect(stored[0].title.fr).toContain("(fr)");
    expect(await runDigest(store, model, NOW, async () => news(20))).toMatchObject({ added: 0, skipped: true });
    expect(model.calls).toHaveLength(1);
  });

  it("le lendemain : jamais deux fois la même actualité", async () => {
    const store = new MemoryStore();
    const model = new Picker();
    await runDigest(store, model, NOW, async () => news(20));
    await runDigest(store, model, new Date("2026-10-23T23:00:00Z"), async () => [...news(20), ...news(10, "m")].map((n) => ({ ...n, date: "2026-10-23T20:00:00Z" })));
    const links = (await store.list<InfoCard>(containers.content, GLOBAL)).map((s) => s.link);
    expect(new Set(links).size).toBe(10);
  });

  it("l'IA ne reçoit que les titres et extraits, et la consigne de ne rien inventer", async () => {
    const model = new Picker();
    await runDigest(new MemoryStore(), model, NOW, async () => news(3));
    expect(model.calls[0][0].content).toContain("事実を作らない");
    expect(model.calls[0][1].content).toContain("<news>");
  });

  it("最新の見出し : archive de 7 par page, filtrable par source ; articles du site à part", async () => {
    const store = new MemoryStore();
    const model = new Picker();
    await runDigest(store, model, NOW, async () => news(20));
    await runDigest(store, model, new Date("2026-10-23T23:00:00Z"), async () => news(20, "m").map((n) => ({ ...n, date: "2026-10-23T20:00:00Z" })));
    const article: InfoCard = { id: "bienvenue", kind: "article", date: "2026-10-23", title: t("a"), summary: t("b"), body: "…", lang: "ja" };
    const p1 = await infoPage(store, 1, undefined, [article]);
    expect(p1).toMatchObject({ page: 1, pages: 2, total: 10 });
    expect(p1.items).toHaveLength(PAGE_SIZE);
    expect(p1.items.every((i) => i.kind === "news")).toBe(true);
    expect(p1.items[0].date).toBe("2026-10-24");
    expect(p1.articles).toEqual([article]);
    expect((await infoPage(store, 2, undefined, [article])).items).toHaveLength(3);
    expect((await infoPage(store, 99, undefined, [article])).page, "une page trop loin donne la dernière").toBe(2);
    expect((await infoPage(store, 1, "nhk", [article])).total, "filtre par source").toBe(0);
  });

  it("POST /api/info/run exige le secret de la tâche du matin", async () => {
    const ctx = new InvocationContext({ logHandler: () => {} });
    const h = infoHandlers({ store: () => new MemoryStore(), model: () => new Picker(), secret: () => "s".repeat(40), now: () => NOW });
    const res = await h.run(new HttpRequest({ url: "https://x/api/info/run", method: "POST", headers: { "x-shukatsu-cron": "faux" } }), ctx);
    expect(res.status).toBe(401);
  });
});
