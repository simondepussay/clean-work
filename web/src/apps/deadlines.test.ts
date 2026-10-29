import { describe, expect, it } from "vitest";
import type { Application } from "../api";
import { fold, toICalendar, upcomingDeadlines } from "./deadlines";

const today = new Date(2026, 9, 22); // 22 octobre 2026, heure locale
const app = (p: Partial<Application>): Application => ({
  id: "a", company: "楽天", status: "es", steps: [], nextDeadline: null, createdAt: "t", updatedAt: "t", ...p,
});

describe("upcomingDeadlines", () => {
  const apps = [
    app({ id: "a1", company: "楽天", steps: [
      { id: "s1", type: "es", dueDate: "2026-10-24", done: false },
      { id: "s2", type: "test", dueDate: "2026-10-20", done: false }, // passée
      { id: "s3", type: "interview1", dueDate: "2026-10-23", done: true }, // terminée
    ] }),
    app({ id: "a2", company: "ソニー", status: "interview1", steps: [{ id: "s4", type: "interview1", dueDate: "2026-10-22", done: false }] }),
    app({ id: "a3", company: "辞退した会社", status: "withdrawn", steps: [{ id: "s5", type: "es", dueDate: "2026-10-23", done: false }] }),
    app({ id: "a4", company: "遠い会社", steps: [{ id: "s6", type: "es", dueDate: "2026-12-01", done: false }] }),
  ];

  it("garde les étapes à venir et non terminées des candidatures en cours, la plus proche d'abord", () => {
    expect(upcomingDeadlines(apps, today).map((d) => `${d.company} ${d.step} ${d.days}`)).toEqual([
      "ソニー interview1 0",
      "楽天 es 2",
      "遠い会社 es 40",
    ]);
  });

  it("peut se limiter aux 14 prochains jours", () => {
    expect(upcomingDeadlines(apps, today, 14).map((d) => d.company)).toEqual(["ソニー", "楽天"]);
  });
});

describe("toICalendar", () => {
  const ics = toICalendar(
    [{ applicationId: "a1", stepId: "s1", company: "楽天, Inc.", step: "es", date: "2026-10-31", days: 9, note: "マイページから提出" }],
    new Date("2026-10-22T03:04:05.678Z"),
  );

  it("un événement « journée entière » avec une alarme la veille à 9 h", () => {
    expect(ics).toContain("DTSTART;VALUE=DATE:20261031\r\n");
    expect(ics).toContain("DTEND;VALUE=DATE:20261101\r\n");
    expect(ics).toContain("TRIGGER:-PT15H\r\n");
    expect(ics).toContain("UID:s1@shukatsu-pilot\r\n");
    expect(ics).toContain("DTSTAMP:20261022T030405Z\r\n");
  });

  it("échappe les virgules et utilise CRLF", () => {
    expect(ics).toContain("SUMMARY:【締切】楽天\\, Inc. ES\r\n");
    expect(ics.split("\r\n").every((l) => !l.includes("\n"))).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("échappe aussi les points-virgules et les retours à la ligne (trouvé par le lint)", () => {
    const out = toICalendar([{ applicationId: "a", stepId: "s", company: "A;B", step: "es", date: "2026-11-01", days: 1, note: "行1\n行2" }]);
    expect(out).toContain("SUMMARY:【締切】A\\;B ES\r\n");
    expect(out).toContain("DESCRIPTION:行1\\n行2\r\n");
  });

  it("change de mois et d'année correctement pour DTEND", () => {
    const end = toICalendar([{ applicationId: "a", stepId: "s", company: "A", step: "es", date: "2026-12-31", days: 1 }]);
    expect(end).toContain("DTEND;VALUE=DATE:20270101");
  });
});

describe("fold", () => {
  it("coupe à 75 octets sans couper un caractère japonais (3 octets en UTF-8)", () => {
    const line = "SUMMARY:" + "締".repeat(40);
    const parts = fold(line).split("\r\n ");
    const enc = new TextEncoder();
    expect(parts.length).toBeGreaterThan(1);
    expect(enc.encode(parts[0]).length).toBeLessThanOrEqual(75);
    expect(parts.slice(1).every((p) => enc.encode(p).length <= 74)).toBe(true);
    expect(parts.join("")).toBe(line);
  });

  it("ne touche pas une ligne courte", () => {
    expect(fold("VERSION:2.0")).toBe("VERSION:2.0");
  });
});

describe("relances (フォローアップ)", () => {
  const withFollowUps = app({ id: "f", company: "LINEヤフー", followUps: [
    { id: "f1", date: "2026-10-25", note: "お礼メール", done: false },
    { id: "f2", date: "2026-10-23", note: "送った", done: true },
  ] });

  it("une relance à faire rejoint les échéances, avec ce qu'il faut faire", () => {
    expect(upcomingDeadlines([withFollowUps], today)).toEqual([
      expect.objectContaining({ company: "LINEヤフー", step: "followup", date: "2026-10-25", days: 3, note: "お礼メール" }),
    ]);
  });

  it("et dans le fichier de calendrier", () => {
    expect(toICalendar(upcomingDeadlines([withFollowUps], today))).toContain("SUMMARY:【フォローアップ】LINEヤフー お礼メール");
  });
});
