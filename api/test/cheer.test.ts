import { HttpRequest, InvocationContext } from "@azure/functions";
import { describe, expect, it } from "vitest";
import { kokoroHandler, TEST_PUSH_PER_DAY } from "../src/functions/kokoro";
import { cheersFor, moodStreak, pickForPush, readWords, wordOfTheDay, type CheerInput, type Word } from "../src/lib/cheer";
import type { IdentityVerifier } from "../src/lib/identity";
import { containers, type Application, type Device } from "../src/lib/models";
import type { PushMessage, PushResult, PushSender } from "../src/lib/push";
import { runReminders } from "../src/lib/reminders";
import { MemoryStore } from "../src/lib/store";

// 8 h à Tokyo le 28 octobre.
const NOW = new Date("2026-10-27T23:00:00Z");
const TODAY = "2026-10-28";
const WORDS: Word[] = [
  { id: "g1", tag: "gentle", ja: "やさしい1", en: "gentle 1", fr: "doux 1" },
  { id: "g2", tag: "gentle", ja: "やさしい2", en: "gentle 2", fr: "doux 2" },
  { id: "t1", tag: "tip", ja: "コツ1", en: "tip 1", fr: "conseil 1" },
  { id: "e1", tag: "energy", ja: "元気1", en: "energy 1", fr: "élan 1" },
];

const app = (over: Partial<Application> & { company: string }): Application => ({
  id: over.company, userId: "u1", status: "applied", steps: [], nextDeadline: null,
  createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z", ...over,
});
const input = (over: Partial<CheerInput> = {}): CheerInput => ({
  userId: "u1", apps: [], drafts: [], interviews: [], moods: [], values: [], today: TODAY, now: NOW, words: WORDS, ...over,
});
const kinds = (i: CheerInput) => cheersFor(i).map((c) => c.kind);

describe("encouragements (cheer)", () => {
  it("sans rien de particulier : seulement le mot du jour", () => {
    expect(kinds(input())).toEqual(["word"]);
  });

  it("après un refus, le réconfort passe en premier ; un 内定 se fête", () => {
    const c = cheersFor(input({ apps: [
      app({ company: "トヨタ", status: "rejected", updatedAt: "2026-10-27T10:00:00Z" }),
      app({ company: "ソニー", status: "offer", updatedAt: "2026-10-27T05:00:00Z" }),
    ] }));
    expect(c.map((x) => x.kind).slice(0, 2)).toEqual(["care", "offer"]);
    expect(c[0].body.ja).toContain("トヨタ");
    expect(c[1].title.ja).toBe("内定おめでとうございます！");
  });

  it("félicite en une phrase pour ce qui a été fait depuis hier", () => {
    const c = cheersFor(input({
      apps: [app({ company: "楽天", createdAt: "2026-10-27T12:00:00Z", steps: [{ id: "s", type: "test", dueDate: "2026-10-27", done: true }] })],
      drafts: [{ id: "d", userId: "u1", kind: "free", question: "自己PR", body: "私は…", createdAt: "", updatedAt: "2026-10-27T20:00:00Z" }],
    })).find((x) => x.kind === "done")!;
    expect(c.body.ja).toBe("選考を1つ進めた、1社を追加、ESを1本。ちゃんと前に進んでいます。");
    expect(c.body.fr).toContain("1 étape(s) franchie(s)");
  });

  it("un entretien dans 2 jours sans entraînement : propose de s'entraîner, avec le lien vers l'onglet", () => {
    const sony = app({ company: "ソニー", status: "interview1", steps: [{ id: "i1", type: "interview1", dueDate: "2026-10-30", done: false }] });
    const nudge = cheersFor(input({ apps: [sony] })).find((x) => x.kind === "nudge" && x.action?.tab === "interview")!;
    expect(nudge.body.ja).toBe("ソニーの一次面接まであと2日。10分だけでも、話す感覚がつかめます。");
    expect(nudge.action).toEqual({ tab: "interview", applicationId: "ソニー" });
    // Déjà entraîné pour cette candidature : pas de poussée.
    const practiced = { id: "x", userId: "u1", applicationId: "ソニー", createdAt: "2026-10-25T00:00:00Z" } as never;
    expect(cheersFor(input({ apps: [sony], interviews: [practiced] })).some((x) => x.action?.tab === "interview")).toBe(false);
  });

  it("une ES due bientôt sans brouillon, et des valeurs à écrire avant un entretien", () => {
    const c = cheersFor(input({ apps: [
      app({ company: "LINEヤフー", status: "es", steps: [{ id: "e", type: "es", dueDate: "2026-10-29", done: false }] }),
      app({ company: "メルカリ", status: "interview2", steps: [{ id: "i", type: "interview2", dueDate: "2026-11-03", done: false }] }),
    ] }));
    expect(c.find((x) => x.action?.tab === "documents")?.action).toEqual({ tab: "documents", applicationId: "LINEヤフー" });
    expect(c.some((x) => x.id.startsWith("nudge-values"))).toBe(true);
  });

  it("série de jours notés : 3, 7, 14, 30", () => {
    const moods = ["2026-10-26", "2026-10-27", "2026-10-28"].map((date) => ({ date, weather: "sunny" as const }));
    expect(moodStreak(moods, TODAY)).toBe(3);
    expect(cheersFor(input({ moods })).find((x) => x.kind === "streak")?.title.ja).toBe("3日続けて記録しました");
    expect(moodStreak(moods.slice(0, 2), TODAY)).toBe(2);
  });

  it("le mot du jour change chaque jour, et devient doux après un jour de pluie", () => {
    const days = ["2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31"].map((d) => wordOfTheDay(WORDS, "u1", d, false)!.id);
    expect(new Set(days).size).toBe(4);
    const rainy = cheersFor(input({ moods: [{ date: "2026-10-27", weather: "rainy" }] })).find((x) => x.kind === "word")!;
    expect(["g1", "g2"].map((id) => `word-${id}`)).toContain(rainy.id);
  });

  it("la banque de mots est grande, variée et complète dans les trois langues", () => {
    const words = readWords();
    expect(words.length).toBeGreaterThanOrEqual(40);
    expect(new Set(words.map((w) => w.id)).size).toBe(words.length);
    for (const tag of ["gentle", "tip", "energy"]) expect(words.filter((w) => w.tag === tag).length).toBeGreaterThanOrEqual(10);
    for (const w of words) for (const lang of ["ja", "en", "fr"] as const) expect(w[lang].length).toBeGreaterThan(5);
  });

  it("fréquence : réconfort et 内定 passent toujours (sauf off) ; le reste suit le rythme choisi", () => {
    const word = cheersFor(input());
    const care = cheersFor(input({ apps: [app({ company: "A", status: "rejected", updatedAt: "2026-10-27T10:00:00Z" })] }));
    expect(pickForPush(word, "daily", TODAY)?.kind).toBe("word");
    expect(pickForPush(word, "off", TODAY)).toBeNull();
    expect(pickForPush(care, "off", TODAY)).toBeNull();
    // 2026-10-28 est un mercredi : pas le jour de l'envoi hebdomadaire (lundi).
    expect(pickForPush(word, "weekly", TODAY)).toBeNull();
    expect(pickForPush(word, "weekly", "2026-11-02")?.kind).toBe("word");
    expect(pickForPush(care, "weekly", TODAY)?.kind).toBe("care");
    expect([pickForPush(word, "every2", TODAY), pickForPush(word, "every2", "2026-10-29")].filter(Boolean)).toHaveLength(1);
  });
});

class FakeSender implements PushSender {
  sent: (PushMessage & { to: string })[] = [];
  constructor(private result: PushResult = "sent") {}
  async send(d: Device, m: PushMessage) { this.sent.push({ ...m, to: d.userId }); return this.result; }
}
const device = (userId: string, language?: "ja" | "en" | "fr"): Device =>
  ({ id: `tok-${userId}`, token: `tok-${userId}`, userId, environment: "sandbox", createdAt: "2026-10-01", updatedAt: "2026-10-20", ...(language ? { language } : {}) });

describe("notification d'encouragement du matin", () => {
  it("une seule par jour, dans la langue de l'iPhone, et rien si l'utilisateur a choisi « off »", async () => {
    const store = new MemoryStore();
    await store.put(containers.devices, device("u1", "fr"));
    await store.put(containers.devices, device("u2"));
    await store.put(containers.profiles, { id: "kokoro", userId: "u2", moods: [], values: [], cheerFrequency: "off", updatedAt: "" });
    const sender = new FakeSender();
    const cheers = () => sender.sent.filter((m) => ["Le mot du jour", "今日のひとこと"].includes(m.title));
    await runReminders(store, sender, NOW, { url: "", sessions: [] }, WORDS);
    expect(cheers()).toEqual([expect.objectContaining({ to: "u1", title: "Le mot du jour" })]);
    await runReminders(store, sender, NOW, { url: "", sessions: [] }, WORDS);
    expect(cheers()).toHaveLength(1);
  });
});

const as = (userId: string): IdentityVerifier => ({ verify: async (t) => (t === "ok" ? { userId } : null) });
const ctx = new InvocationContext({ logHandler: () => {} });
function api(store = new MemoryStore(), push: PushSender | null = new FakeSender()) {
  return (userId: string, method: string, part?: string, body?: unknown) =>
    kokoroHandler({ verifier: () => as(userId), store: () => store, now: () => NOW, push: () => push })(new HttpRequest({
      url: `https://x/api/kokoro${part ? `/${part}` : ""}`, method, params: part ? { part } : {},
      headers: { "x-shukatsu-token": "ok" }, body: body === undefined ? undefined : { string: JSON.stringify(body) },
    }), ctx);
}

describe("/api/kokoro : phrases, réglages, iPhone relié", () => {
  it("enregistre des お守りの言葉 avec leur moment, 6 au plus", async () => {
    const call = api();
    const charms = [{ text: "いつも通りで大丈夫", when: "hour" }, { text: "笑顔で入る", when: "tenmin" }];
    expect((await call("u1", "PUT", "charms", { charms })).jsonBody).toEqual({ charms });
    expect((await call("u1", "GET")).jsonBody).toMatchObject({ charms, cheerFrequency: "daily" });
    expect((await call("u1", "PUT", "charms", { charms: [{ text: "x", when: "noon" }] })).status).toBe(400);
    expect((await call("u1", "PUT", "charms", { charms: Array(7).fill({ text: "x", when: "eve" }) })).status).toBe(400);
  });

  it("change la fréquence des encouragements", async () => {
    const call = api();
    expect((await call("u1", "PUT", "settings", { cheerFrequency: "weekly" })).jsonBody).toEqual({ cheerFrequency: "weekly" });
    expect((await call("u1", "GET")).jsonBody).toMatchObject({ cheerFrequency: "weekly" });
    expect((await call("u1", "PUT", "settings", { cheerFrequency: "hourly" })).status).toBe(400);
  });

  it("montre les iPhone reliés, et envoie une notification d'essai (3 par jour au plus)", async () => {
    const store = new MemoryStore();
    const sender = new FakeSender();
    const call = api(store, sender);
    expect((await call("u1", "POST", "test-push")).status).toBe(409);
    expect((await call("u1", "GET")).jsonBody).toMatchObject({ devices: { count: 0, lastSeen: null } });
    await store.put(containers.devices, device("u1", "ja"));
    expect((await call("u1", "GET")).jsonBody).toMatchObject({ devices: { count: 1, lastSeen: "2026-10-20" } });
    for (let i = 0; i < TEST_PUSH_PER_DAY; i++) expect((await call("u1", "POST", "test-push")).jsonBody).toEqual({ sent: 1 });
    expect((await call("u1", "POST", "test-push")).status).toBe(429);
    expect(sender.sent[0].title).toBe("Clean Work とつながっています");
  });

  it("les encouragements arrivent avec la page", async () => {
    const body = (await api()("u1", "GET")).jsonBody as { cheers: { kind: string }[] };
    expect(body.cheers.at(-1)?.kind).toBe("word");
  });
});
