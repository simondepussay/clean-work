import { HttpRequest, InvocationContext } from "@azure/functions";
import { describe, expect, it } from "vitest";
import { pushRunHandler } from "../src/functions/pushRun";
import { containers, type Application, type Device } from "../src/lib/models";
import type { PushMessage, PushResult, PushSender } from "../src/lib/push";
import { dueSoon, reminderMessage, runReminders, tokyoDate } from "../src/lib/reminders";
import { MemoryStore } from "../src/lib/store";

// 23 h UTC le 22 = 8 h le 23 à Tokyo : c'est l'heure du workflow.
const NOW = new Date("2026-10-22T23:00:00Z");

const application = (userId: string, company: string, steps: { type: string; dueDate: string; done?: boolean }[], status = "es") =>
  ({ id: `${userId}-${company}`, userId, company, status, nextDeadline: null, createdAt: "", updatedAt: "",
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
    expect(await runReminders(store, sender, NOW)).toMatchObject({ users: 1, notified: 1, sent: 2 });
    expect(await runReminders(store, sender, NOW)).toMatchObject({ notified: 0, skipped: 1 });
    expect(sender.sent).toHaveLength(2);
  });

  it("rien à rappeler → rien d'envoyé", async () => {
    const store = await seed([application("u1", "楽天", [{ type: "es", dueDate: "2026-11-30" }])], [device("u1", "aa")]);
    const sender = new FakeSender();
    expect(await runReminders(store, sender, NOW)).toMatchObject({ users: 1, notified: 0 });
    expect(sender.sent).toEqual([]);
  });

  it("oublie les jetons refusés par Apple", async () => {
    const store = await seed([application("u1", "楽天", [{ type: "es", dueDate: "2026-10-23" }])], [device("u1", "aa"), device("u1", "old")]);
    await runReminders(store, new FakeSender((d) => (d.token === "old" ? "gone" : "sent")), NOW);
    expect((await store.list<Device>(containers.devices, "u1")).map((d) => d.token)).toEqual(["aa"]);
  });

  it("panne d'Apple : la marque est retirée, un nouvel essai peut envoyer", async () => {
    const store = await seed([application("u1", "楽天", [{ type: "es", dueDate: "2026-10-23" }])], [device("u1", "aa")]);
    expect(await runReminders(store, new FakeSender(() => "failed"), NOW)).toMatchObject({ notified: 0, failed: 1 });
    expect(await runReminders(store, new FakeSender(), NOW)).toMatchObject({ notified: 1, sent: 1 });
  });

  it("un iPhone passé d'un compte à un autre ne reçoit que les échéances du compte le plus récent", async () => {
    const store = await seed([
      application("ancien", "秘密の会社", [{ type: "es", dueDate: "2026-10-23" }]),
      application("nouveau", "楽天", [{ type: "es", dueDate: "2026-10-23" }]),
    ], [device("ancien", "aa", "2026-10-01"), device("nouveau", "aa", "2026-10-20")]);
    const sender = new FakeSender();
    await runReminders(store, sender, NOW);
    expect(sender.sent.map((s) => s.message.body)).toEqual(["今日：楽天 ES"]);
  });

  it("les comptes supprimés (S25) ne reçoivent plus rien", async () => {
    const store = await seed([application("u1", "楽天", [{ type: "es", dueDate: "2026-10-23" }])], [device("u1", "aa")]);
    await store.markDeleted(containers.devices, "u1", { deletedAt: "2026-10-22", ttl: 100 });
    const sender = new FakeSender();
    expect(await runReminders(store, sender, NOW)).toMatchObject({ users: 0 });
  });
});

describe("POST /api/push/run", () => {
  const SECRET = "s".repeat(40);
  const ctx = new InvocationContext({ logHandler: () => {} });
  const call = (header: string | undefined, push: PushSender | null = new FakeSender()) =>
    pushRunHandler({ secret: () => SECRET, store: () => new MemoryStore(), push: () => push, now: () => NOW })(
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
