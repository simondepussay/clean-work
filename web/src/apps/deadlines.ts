import type { Application, StepType } from "../api";
import { COLUMNS, daysUntil } from "./statuses";

export type Deadline = { applicationId: string; stepId: string; company: string; step: StepType; date: string; days: number; note?: string };

const CLOSED = new Set(["rejected", "withdrawn"]);

/**
 * Échéances à venir (S09) : étapes non terminées, datées d'aujourd'hui ou plus tard,
 * des candidatures encore en cours ; la plus proche d'abord.
 */
export function upcomingDeadlines(apps: Application[], today = new Date(), withinDays = Infinity): Deadline[] {
  return apps
    .filter((a) => !CLOSED.has(a.status))
    .flatMap((a) => a.steps
      .filter((s) => !s.done && s.dueDate)
      .map((s) => ({ applicationId: a.id, stepId: s.id, company: a.company, step: s.type, date: s.dueDate!, days: daysUntil(s.dueDate!, today), note: s.note })))
    .filter((d) => d.days >= 0 && d.days <= withinDays)
    .sort((a, b) => a.date.localeCompare(b.date) || a.company.localeCompare(b.company));
}

export const stepName = (step: StepType) => COLUMNS.find((c) => c.status === step)?.ja ?? step;

// ------------------------------------------------------------------ calendrier (.ics, RFC 5545)

/** Échappe le texte d'une propriété iCalendar (\ ; , et retours à la ligne). */
const escape = (text: string) => text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Coupe une ligne à 75 octets (UTF-8), sans couper un caractère japonais en deux. */
export function fold(line: string): string {
  const encoder = new TextEncoder();
  const parts: string[] = [];
  let current = "";
  let bytes = 0;
  for (const ch of line) {
    const size = encoder.encode(ch).length;
    const limit = parts.length === 0 ? 75 : 74; // les lignes suivantes commencent par une espace
    if (bytes + size > limit) {
      parts.push(current);
      current = "";
      bytes = 0;
    }
    current += ch;
    bytes += size;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

const ymd = (date: string) => date.replace(/-/g, "");
const nextDay = (date: string) => {
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return next.toISOString().slice(0, 10);
};

/**
 * Calendrier des échéances : un événement « journée entière » par étape, avec une alarme
 * la veille à 9 h (15 h avant le début de la journée).
 */
export function toICalendar(deadlines: Deadline[], now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Shukatsu Pilot//Deadlines//JA",
    "CALSCALE:GREGORIAN",
    "X-WR-CALNAME:就活パイロット 締切",
  ];
  for (const d of deadlines) {
    const title = `【締切】${d.company} ${stepName(d.step)}`;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${d.stepId}@shukatsu-pilot`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${ymd(d.date)}`,
      `DTEND;VALUE=DATE:${ymd(nextDay(d.date))}`,
      `SUMMARY:${escape(title)}`,
      ...(d.note ? [`DESCRIPTION:${escape(d.note)}`] : []),
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `DESCRIPTION:${escape(`明日：${title}`)}`,
      "TRIGGER:-PT15H",
      "END:VALARM",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
