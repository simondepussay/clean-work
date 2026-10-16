import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { nextDeadline, type Step } from "../src/lib/models";
import { Repository } from "../src/lib/repository";
import { MemoryStore } from "../src/lib/store";

const fixedNow = () => new Date("2026-10-16T09:00:00Z");
const repo = () => new Repository(new MemoryStore(), fixedNow);

const step = (type: Step["type"], dueDate?: string, done = false): Step => ({ id: type, type, dueDate, done });

describe("nextDeadline", () => {
  it("prend l'étape non terminée la plus proche", () => {
    const steps = [step("interview1", "2026-11-20"), step("es", "2026-10-30"), step("test", "2026-11-05")];
    expect(nextDeadline(steps, "2026-10-16")).toBe("2026-10-30");
  });

  it("ignore les étapes terminées et les dates passées", () => {
    const steps = [step("es", "2026-10-20", true), step("test", "2026-10-01"), step("interview1", "2026-11-02")];
    expect(nextDeadline(steps, "2026-10-16")).toBe("2026-11-02");
  });

  it("compte une échéance aujourd'hui", () => {
    expect(nextDeadline([step("es", "2026-10-16")], "2026-10-16")).toBe("2026-10-16");
  });

  it("renvoie null sans échéance à venir", () => {
    expect(nextDeadline([step("es")], "2026-10-16")).toBeNull();
    expect(nextDeadline([], "2026-10-16")).toBeNull();
  });
});

describe("profil", () => {
  it("enregistre un profil valide, un seul par utilisateur", async () => {
    const r = repo();
    await r.saveProfile("u1", { nameKanji: "デプセ シモン", nameKana: "デプセ シモン" });
    await r.saveProfile("u1", { nameKanji: "デプセ シモン", nameKana: "デプセ シモン", phone: "090" });
    const p = await r.getProfile("u1");
    expect(p).toMatchObject({ id: "u1", userId: "u1", phone: "090", education: [] });
  });

  it("refuse un profil sans nom", async () => {
    await expect(repo().saveProfile("u1", { nameKanji: " ", nameKana: "シモン" })).rejects.toBeInstanceOf(ZodError);
  });

  it("refuse une date au mauvais format", async () => {
    const input = { nameKanji: "シモン", nameKana: "シモン", birthDate: "16/10/2000" };
    await expect(repo().saveProfile("u1", input)).rejects.toBeInstanceOf(ZodError);
  });
});

describe("candidatures", () => {
  it("crée une candidature avec id, dates et prochaine échéance", async () => {
    const app = await repo().createApplication("u1", {
      company: "Rakuten",
      steps: [{ id: "s1", type: "es", dueDate: "2026-11-01" }],
    });
    expect(app.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(app).toMatchObject({ status: "interested", nextDeadline: "2026-11-01", createdAt: "2026-10-16T09:00:00.000Z" });
  });

  it("trie par échéance la plus proche, sans échéance en dernier", async () => {
    const r = repo();
    await r.createApplication("u1", { company: "C sans date" });
    await r.createApplication("u1", { company: "B", steps: [{ id: "s", type: "es", dueDate: "2026-12-01" }] });
    await r.createApplication("u1", { company: "A", steps: [{ id: "s", type: "es", dueDate: "2026-11-01" }] });
    expect((await r.listApplications("u1")).map((a) => a.company)).toEqual(["A", "B", "C sans date"]);
  });

  it("met à jour sans perdre createdAt et recalcule l'échéance", async () => {
    const r = repo();
    const app = await r.createApplication("u1", { company: "LINEヤフー", steps: [{ id: "s1", type: "es", dueDate: "2026-11-01" }] });
    const updated = await r.updateApplication("u1", app.id, {
      status: "test",
      steps: [{ id: "s1", type: "es", dueDate: "2026-11-01", done: true }, { id: "s2", type: "test", dueDate: "2026-11-10" }],
    });
    expect(updated).toMatchObject({ status: "test", nextDeadline: "2026-11-10", createdAt: app.createdAt, company: "LINEヤフー" });
  });

  it("ne voit ni ne modifie les candidatures d'un autre utilisateur", async () => {
    const r = repo();
    const app = await r.createApplication("u1", { company: "Secret" });
    expect(await r.listApplications("u2")).toEqual([]);
    expect(await r.updateApplication("u2", app.id, { company: "Piraté" })).toBeNull();
    expect(await r.deleteApplication("u2", app.id)).toBe(false);
    expect((await r.listApplications("u1"))[0].company).toBe("Secret");
  });

  it("supprime une candidature", async () => {
    const r = repo();
    const app = await r.createApplication("u1", { company: "X" });
    expect(await r.deleteApplication("u1", app.id)).toBe(true);
    expect(await r.listApplications("u1")).toEqual([]);
  });

  it("refuse un statut inconnu", async () => {
    await expect(repo().createApplication("u1", { company: "X", status: "hired" })).rejects.toBeInstanceOf(ZodError);
  });
});
