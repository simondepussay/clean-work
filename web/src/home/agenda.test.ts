import { describe, expect, it } from "vitest";
import type { Application, Plan } from "../api";
import { buildAgenda, monthGrid, ymd } from "./agenda";

const app = (id: string, status: Application["status"], steps: Application["steps"]): Application =>
  ({ id, company: `${id}社`, status, steps, nextDeadline: null, createdAt: "", updatedAt: "" });

describe("agenda", () => {
  it("rassemble étapes, événements et objectifs, triés par date et heure", () => {
    const plans = [
      { id: "p1", kind: "goal", title: "ES 3本", date: "2026-10-28", done: false, createdAt: "", updatedAt: "" },
      { id: "p2", kind: "event", title: "説明会", date: "2026-10-28", time: "10:00", done: false, createdAt: "", updatedAt: "" },
    ] as Plan[];
    const items = buildAgenda([
      app("A", "interview1", [{ id: "s1", type: "interview1", dueDate: "2026-10-28", done: false }, { id: "s2", type: "es", dueDate: "2026-10-25", done: true }]),
      app("B", "withdrawn", [{ id: "s3", type: "es", dueDate: "2026-10-26", done: false }]),
    ], plans);
    expect(items.map((i) => [i.date, i.kind, i.title])).toEqual([
      ["2026-10-25", "step", "A社"],
      ["2026-10-28", "event", "説明会"],
      ["2026-10-28", "interview", "A社"],
      ["2026-10-28", "goal", "ES 3本"],
    ]);
    expect(items[0].done).toBe(true);
  });

  it("grille du mois : semaines du dimanche au samedi", () => {
    const weeks = monthGrid(2026, 9); // octobre 2026 : le 1er est un jeudi
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(ymd(weeks[0][0])).toBe("2026-09-27");
    expect(ymd(weeks[weeks.length - 1][6])).toBe("2026-10-31");
    expect(weeks).toHaveLength(5);
  });

  it("février qui commence un dimanche : 4 semaines exactement", () => {
    expect(monthGrid(2026, 1)).toHaveLength(4);
  });
});
