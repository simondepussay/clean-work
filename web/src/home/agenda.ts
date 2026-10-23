import type { Application, Plan } from "../api";
import { stepName } from "../apps/deadlines";

/**
 * Tout ce qui a une date, au même endroit (accueil) : les étapes des candidatures
 * (entretiens, ES, tests…), les événements et les objectifs de l'utilisateur.
 */
export type AgendaKind = "interview" | "step" | "event" | "goal" | "note";
export type AgendaItem = {
  key: string;
  date: string;
  time?: string;
  kind: AgendaKind;
  title: string;
  /** Sous-titre : l'étape pour une candidature. */
  detail?: string;
  done: boolean;
  plan?: Plan;
  applicationId?: string;
};

const INTERVIEWS = new Set(["interview1", "interview2", "final"]);
const CLOSED = new Set(["rejected", "withdrawn"]);
const ORDER: Record<AgendaKind, number> = { interview: 0, goal: 1, step: 2, event: 3, note: 4 };

export function buildAgenda(apps: Application[], plans: Plan[]): AgendaItem[] {
  const steps = apps
    .filter((a) => !CLOSED.has(a.status))
    .flatMap((a) => a.steps.filter((s) => s.dueDate).map((s): AgendaItem => ({
      key: `step-${a.id}-${s.id}`,
      date: s.dueDate!,
      kind: INTERVIEWS.has(s.type) ? "interview" : "step",
      title: a.company,
      detail: stepName(s.type),
      done: s.done,
      applicationId: a.id,
    })));
  const own = plans.map((p): AgendaItem => ({
    key: `plan-${p.id}`, date: p.date, ...(p.time ? { time: p.time } : {}), kind: p.kind, title: p.title, done: p.done, plan: p,
  }));
  return [...steps, ...own].sort((a, b) =>
    a.date.localeCompare(b.date) || (a.time ?? "99").localeCompare(b.time ?? "99") || ORDER[a.kind] - ORDER[b.kind]);
}

/** Date locale au format AAAA-MM-JJ (pas toISOString : elle passe en UTC et décale d'un jour au Japon). */
export const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * Les semaines à afficher pour un mois : du dimanche avant le 1er au samedi après le dernier jour
 * (calendrier japonais : la semaine commence le dimanche).
 */
export function monthGrid(year: number, month: number): Date[][] {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - first.getDay());
  const weeks: Date[][] = [];
  for (let d = new Date(start); weeks.length === 0 || d.getMonth() === month || weeks[weeks.length - 1].length < 7; ) {
    if (weeks.length === 0 || weeks[weeks.length - 1].length === 7) {
      if (weeks.length > 0 && d.getMonth() !== month) break;
      weeks.push([]);
    }
    weeks[weeks.length - 1].push(new Date(d));
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
  }
  return weeks;
}
