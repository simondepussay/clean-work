/**
 * Contenu du 職務経歴書 (S12) : emplois dans l'ordre chronologique (編年体), périodes.
 * Le dessin est dans workHistoryPdf.ts.
 */
import type { Profile } from "./models";
import { monthYearLabel, type Era } from "./resume";

export type Job = { period: string; company: string; role?: string; description?: string };

/** « 2023年4月～2023年9月 », ou « 2023年4月～現在 » pour un emploi en cours. */
export function periodLabel(start: string, end: string | undefined, era: Era): string {
  const at = (m: string) => `${monthYearLabel(m, era)}年${Number(m.slice(5))}月`;
  return `${at(start)}～${end ? at(end) : "現在"}`;
}

export function jobs(profile: Profile, era: Era): Job[] {
  return [...profile.work]
    .sort((a, b) => a.start.localeCompare(b.start))
    .map((w) => ({ period: periodLabel(w.start, w.end, era), company: w.company, role: w.role, description: w.description }));
}
