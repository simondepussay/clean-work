import { HttpRequest, InvocationContext } from "@azure/functions";
import { describe, expect, it } from "vitest";
import { pushRunHandler } from "../src/functions/pushRun";
import { containers, type Application, type Device, type Profile } from "../src/lib/models";
import type { PushMessage, PushResult, PushSender } from "../src/lib/push";
import { dueSoon, idleMessage, jlptMessage, needsJlpt, reminderMessage, runReminders, tokyoDate, type JlptSchedule } from "../src/lib/reminders";
import { MemoryStore } from "../src/lib/store";

// 23 h UTC le 22 = 8 h le 23 à Tokyo : c'est l'heure du workflow.
const NOW = new Date("2026-10-22T23:00:00Z");
/** Ces tests portent sur les échéances, le JLPT et la relance : ni JLPT ni mot du jour par défaut. */
const NO_JLPT: JlptSchedule = { url: "", sessions: [] };

const application = (userId: string, company: string, steps: { type: string; dueDate: string; done?: boolean }[], status = "es") =>
  ({ id: `${userId}-${company}`, userId, company, status, nextDeadline: null, createdAt: "2026-10-20T00:00:00Z", updatedAt: "2026-10-20T00:00:00Z",
    steps: steps.map((s, i) => ({ id: `s${i}`, done: false, ...s })) }) as Application;

const device = (userId: string, token: string, updatedAt = "2026-10-01"): Device =>
  ({ id: token, token, userId, environment: "sandbox", createdAt: updatedAt, updatedAt });

class FakeSender implements PushSender {
  sent: { token: string; message: PushMessage }[] = [];
  constructor(private result: (d: Device) => PushResult = () => "sent") {}
  async send(d: Device, message: PushMessage) {
    this.sent.push({ token: d.token, message });
    return this.result(d);
  }
}

async function seed(apps: Application[], devices: Device[]) {
  const store = new MemoryStore();
  for (const a of apps) await store.put(containers.applications, a);
  for (const d of devices) await store.put(containers.devices, d);
  return store;
}

describe("rappels du jour (S26)", () => {
  it("la date est celle du Japon", () => {
    expect(tokyoDate(NOW)).toBe("2026-10-23");
    expect(tokyoDate(NOW, 1)).toBe("2026-10-24");
  });

  it("ne garde que les étapes non terminées des candidatures en cours, aujourd'hui et demain", () => {
    const due = dueSoon([
      application("u", "楽天", [{ type: "es", dueDate: "2026-10-23" }, { type: "test", dueDate: "2026-10-24", done: true }]),
      application("u", "ソニー", [{ type: "interview1", dueDate: "2026-10-24" }]),
      application("u", "辞退した会社", [{ type: "es", dueDate: "2026-10-23" }], "withdrawn"),
      application("u", "来週", [{ type: "es", dueDate: "2026-10-30" }]),
    ], "2026-10-23", "2026-10-24");
    expect(due).toEqual({ today: [{ company: "楽天", step: "es" }], tomorrow: [{ company: "ソニー", step: "interview1" }] });
  });

  it("une seule notification qui résume, au plus 3 lignes", () => {
    expect(reminderMessage({ today: [], tomorrow: [] })).toBeNull();
    const m = reminderMessage({
      today: [{ company: "A社", step: "es" }],
      tomorrow: [{ company: "B社", step: "test" }, { company: "C社", step: "final" }, { company: "D社", step: "es" }, { company: "E社", step: "es" }],
    })!;
    expect(m.title).toBe("今日締切があります / Due today");
    expect(m.body).toBe("今日：A社 ES\n明日：B社 適性検査\n明日：C社 最終面接\nほか2件 / 2 more");
  });

  it("envoie à tous les iPhone de l'utilisateur, une seule fois par jour", async () => {
    const store = await seed([application("u1", "楽天", [{ type: "es", dueDate: "2026-10-24" }])], [device("u1", "aa"), device("u1", "bb")]);
    const sender = new FakeSender();
    expect(await runReminders(store, sender, NOW, NO_JLPT, [], false)).toMatchObject({ users: 1, notified: 1, sent: 2 });
    expect(await runReminders(store, sender, NOW, NO_JLPT, [], false)).toMatchObject({ notified: 0, skipped: 1 });
    expect(sender.sent).toHaveLength(2);
  });

  it("rien à rappeler → rien d'envoyé", async () => {
    const store = await seed([application("u1", "楽天", [{ type: "es", dueDate: "2026-11-30" }])], [device("u1", "aa")]);
    const sender = new FakeSender();
    expect(await runReminders(store, sender, NOW, NO_JLPT, [], false)).toMatchObject({ users: 1, notified: 0 });
    expect(sender.sent).toEqual([]);
  });

  it("oublie les jetons refusés par Apple", async () => {
    const store = await seed([application("u1", "楽天", [{ type: "es", dueDate: "2026-10-23" }])], [device("u1", "aa"), device("u1", "old")]);
    await runReminders(store, new FakeSender((d) => (d.token === "old" ? "gone" : "sent")), NOW, NO_JLPT, [], false);
    expect((await store.list<Device>(containers.devices, "u1")).map((d) => d.token)).toEqual(["aa"]);
  });

  it("panne d'Apple : la marque est retirée, un nouvel essai peut envoyer", async () => {
    const store = await seed([application("u1", "楽天", [{ type: "es", dueDate: "2026-10-23" }])], [device("u1", "aa")]);
    expect(await runReminders(store, new FakeSender(() => "failed"), NOW, NO_JLPT, [], false)).toMatchObject({ notified: 0, failed: 1 });
    expect(await runReminders(store, new FakeSender(), NOW, NO_JLPT, [], false)).toMatchObject({ notified: 1, sent: 1 });
  });

  it("un iPhone passé d'un compte à un autre ne reçoit que les échéances du compte le plus récent", async () => {
    const store = await seed([
      application("ancien", "秘密の会社", [{ type: "es", dueDate: "2026-10-23" }]),
      application("nouveau", "楽天", [{ type: "es", dueDate: "2026-10-23" }]),
    ], [device("ancien", "aa", "2026-10-01"), device("nouveau", "aa", "2026-10-20")]);
    const sender = new FakeSender();
    await runReminders(store, sender, NOW, NO_JLPT, [], false);
    expect(sender.sent.map((s) => s.message.body)).toEqual(["今日：楽天 ES"]);
  });

  it("les comptes supprimés (S25) ne reçoivent plus rien", async () => {
    const store = await seed([application("u1", "楽天", [{ type: "es", dueDate: "2026-10-23" }])], [device("u1", "aa")]);
    await store.markDeleted(containers.devices, "u1", { deletedAt: "2026-10-22", ttl: 100 });
    const sender = new FakeSender();
    expect(await runReminders(store, sender, NOW, NO_JLPT, [], false)).toMatchObject({ users: 0 });
  });
});

describe("notifications personnalisées", () => {
  const JLPT: JlptSchedule = { url: "https://info.jees-jlpt.jp/", sessions: [{ exam: "2027-07-04", open: "2026-10-23", close: "2026-11-13" }] };
  const profile = (languages: { language: string; level: string }[]) => ({ id: "u1", userId: "u1", languages }) as unknown as Profile;

  it("dans la langue de l'iPhone ; japonais + anglais pour une ancienne version sans langue", () => {
    const due = { today: [{ company: "楽天", step: "interview1" }], tomorrow: [] };
    expect(reminderMessage(due, "fr")).toEqual({ title: "Échéance aujourd'hui", body: "Aujourd'hui : 楽天 1er entretien" });
    expect(reminderMessage(due, "ja")).toEqual({ title: "今日締切があります", body: "今日：楽天 一次面接" });
    expect(reminderMessage(due)?.title).toBe("今日締切があります / Due today");
  });

  it("JLPT : seulement pour un japonais non natif renseigné dans le profil", () => {
    expect(needsJlpt(profile([{ language: "fr", level: "native" }, { language: "ja", level: "business" }]))).toBe(true);
    expect(needsJlpt(profile([{ language: "vi", level: "native" }]))).toBe(true);
    expect(needsJlpt(profile([{ language: "ja", level: "native" }, { language: "en", level: "business" }]))).toBe(false);
    expect(needsJlpt(profile([]))).toBe(false);
    expect(needsJlpt(null)).toBe(false);
  });

  it("JLPT : le jour de l'ouverture, puis 3 jours avant la clôture", () => {
    expect(jlptMessage(JLPT, "2026-10-23", "fr")).toMatchObject({ id: "jlpt-2027-07-04-open", message: { title: "Inscriptions au JLPT ouvertes" } });
    expect(jlptMessage(JLPT, "2026-11-10", "ja")?.message.title).toBe("JLPTの申込み締切まであと3日");
    expect(jlptMessage(JLPT, "2026-11-01", "ja")).toBeNull();
  });

  it("relance après 7 jours sans activité, pas avant, et jamais avec un 内定", () => {
    const now = new Date("2026-10-28T00:00:00Z");
    const old = application("u1", "楽天", [], "es");
    expect(idleMessage([old], "2026-10-01", now, "ja")?.title).toBe("最近どうですか？");
    expect(idleMessage([old], "2026-10-01", new Date("2026-10-25T00:00:00Z"), "ja")).toBeNull();
    expect(idleMessage([old, application("u1", "ソニー", [], "offer")], "2026-10-01", now, "ja")).toBeNull();
    expect(idleMessage([], "2026-10-01", now, "en")?.title).toBe("Add your first company?");
  });

  it("chaque sorte part une fois : échéances + JLPT + relance le même jour, puis plus rien en relançant la tâche", async () => {
    const store = await seed([application("u1", "楽天", [{ type: "es", dueDate: "2026-10-23" }])], [{ ...device("u1", "aa"), language: "ja" }]);
    await store.put(containers.applications, { ...application("u1", "楽天", [{ type: "es", dueDate: "2026-10-23" }]), updatedAt: "2026-10-01T00:00:00Z", createdAt: "2026-10-01T00:00:00Z" });
    await store.put(containers.profiles, profile([{ language: "vi", level: "native" }]));
    const sender = new FakeSender();
    expect(await runReminders(store, sender, NOW, JLPT, [], false)).toMatchObject({ notified: 1, sent: 3 });
    expect(sender.sent.map((s) => s.message.title)).toEqual(["今日締切があります", "JLPTの申込みが始まりました", "最近どうですか？"]);
    expect(await runReminders(store, sender, NOW, JLPT, [], false)).toMatchObject({ sent: 0, skipped: 3 });
  });
});

describe("POST /api/push/run", () => {
  const SECRET = "s".repeat(40);
  const ctx = new InvocationContext({ logHandler: () => {} });
  const call = (header: string | undefined, push: PushSender | null = new FakeSender()) =>
    pushRunHandler({ secret: () => SECRET, store: () => new MemoryStore(), push: () => push, now: () => NOW, cheers: false })(
      new HttpRequest({ url: "https://x/api/push/run", method: "POST", headers: header ? { "x-shukatsu-cron": header } : {} }), ctx);

  it("refuse sans le bon secret", async () => {
    expect((await call(undefined)).status).toBe(401);
    expect((await call("s".repeat(39))).status).toBe(401);
    expect((await call("t".repeat(40))).status).toBe(401);
  });

  it("503 si APNs n'est pas configuré, sinon renvoie le bilan", async () => {
    expect((await call(SECRET, null)).status).toBe(503);
    expect((await call(SECRET)).jsonBody).toEqual({ users: 0, notified: 0, skipped: 0, sent: 0, gone: 0, failed: 0 });
  });
});
