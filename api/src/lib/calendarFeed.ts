/**
 * Abonnement de calendrier (Google, Apple, Outlook…) : un lien privé vers un fichier iCalendar
 * que le calendrier relit tout seul. Il contient les étapes des candidatures et l'agenda de
 * l'utilisateur (événements, objectifs, notes), et suit les changements sans rien réimporter.
 *
 * Le calendrier ne peut pas se connecter avec un compte : le lien porte donc un jeton secret,
 * `<userId>.<signature>`. La signature (HMAC-SHA256 avec CALENDAR_FEED_SECRET) prouve que le
 * lien a été donné par l'app ; rien n'est stocké. Changer le secret invalide tous les liens.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Application, Plan } from "./models";

export type FeedLang = "ja" | "en" | "fr";

const b64url = (buf: Buffer) => buf.toString("base64url");

function signature(userId: string, secret: string) {
  return createHmac("sha256", secret).update(`calendar:${userId}`).digest().subarray(0, 18);
}

export function feedToken(userId: string, secret: string) {
  return `${b64url(Buffer.from(userId))}.${b64url(signature(userId, secret))}`;
}

/** L'utilisateur du lien, ou null si le jeton est faux (comparaison en temps constant). */
export function verifyFeedToken(token: string, secret: string): string | null {
  const [id, sig] = token.replace(/\.ics$/, "").split(".");
  if (!id || !sig) return null;
  const userId = Buffer.from(id, "base64url").toString("utf8");
  const expected = signature(userId, secret);
  const given = Buffer.from(sig, "base64url");
  return given.length === expected.length && timingSafeEqual(given, expected) ? userId : null;
}

// ------------------------------------------------------------------ iCalendar (RFC 5545)

const STEP_NAMES: Record<string, Record<FeedLang, string>> = {
  es: { ja: "ES", en: "Entry sheet", fr: "ES" },
  applied: { ja: "応募済み", en: "Applied", fr: "Postulé" },
  test: { ja: "適性検査", en: "Aptitude test", fr: "Test d'aptitude" },
  interview1: { ja: "一次面接", en: "1st interview", fr: "1er entretien" },
  interview2: { ja: "二次面接", en: "2nd interview", fr: "2e entretien" },
  final: { ja: "最終面接", en: "Final interview", fr: "Entretien final" },
  offer: { ja: "内定", en: "Offer", fr: "Offre" },
};
const PREFIX: Record<"goal" | "note", Record<FeedLang, string>> = {
  goal: { ja: "【目標】", en: "[Goal] ", fr: "[Objectif] " },
  note: { ja: "【メモ】", en: "[Note] ", fr: "[Note] " },
};
const CLOSED = new Set(["rejected", "withdrawn"]);

/** Échappe le texte d'une propriété (\ ; , et retours à la ligne). */
const escape = (text: string) => text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Coupe une ligne à 75 octets UTF-8 sans couper un caractère japonais en deux. */
export function fold(line: string): string {
  const parts: string[] = [];
  let current = "";
  let bytes = 0;
  for (const ch of line) {
    const size = Buffer.byteLength(ch);
    if (bytes + size > (parts.length === 0 ? 75 : 74)) {
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
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
};
/** Heure de fin : une heure plus tard (sans dépasser 23:59). */
const plusHour = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return h >= 23 ? "2359" : `${String(h + 1).padStart(2, "0")}${String(m).padStart(2, "0")}`;
};

type Event = { uid: string; date: string; time?: string; title: string; description?: string; done?: boolean; place?: string };

export function buildFeed(apps: Application[], plans: Plan[], lang: FeedLang, now = new Date()): string {
  const events: Event[] = [
    ...apps.filter((a) => !CLOSED.has(a.status)).flatMap((a) => a.steps.filter((s) => s.dueDate).map((s): Event => ({
      uid: `step-${s.id}`, date: s.dueDate!, time: s.time, title: `${a.company} ${STEP_NAMES[s.type]?.[lang] ?? s.type}`, description: s.note, done: s.done,
      place: s.place,
    }))),
    ...plans.map((p): Event => ({
      uid: `plan-${p.id}`, date: p.date, time: p.kind === "event" ? p.time : undefined,
      title: `${p.kind === "event" ? "" : PREFIX[p.kind][lang]}${p.title}`, description: p.note, done: p.done,
    })),
  ];
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Clean Work//Agenda//JA",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Clean Work",
    "X-WR-TIMEZONE:Asia/Tokyo",
    // Le calendrier relit le lien toutes les 6 heures (Google décide lui-même, souvent moins souvent).
    "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
    "X-PUBLISHED-TTL:PT6H",
  ];
  for (const e of events) {
    lines.push("BEGIN:VEVENT", `UID:${e.uid}@clean-work`, `DTSTAMP:${stamp}`);
    if (e.time) {
      lines.push(`DTSTART;TZID=Asia/Tokyo:${ymd(e.date)}T${e.time.replace(":", "")}00`, `DTEND;TZID=Asia/Tokyo:${ymd(e.date)}T${plusHour(e.time)}00`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${ymd(e.date)}`, `DTEND;VALUE=DATE:${ymd(nextDay(e.date))}`);
    }
    lines.push(`SUMMARY:${escape(`${e.done ? "✓ " : ""}${e.title}`)}`);
    if (e.description) lines.push(`DESCRIPTION:${escape(e.description)}`);
    // Lieu de l'entretien, ou lien s'il est en ligne (Google et Apple affichent LOCATION ; URL est le lien cliquable).
    if (e.place) {
      lines.push(`LOCATION:${escape(e.place)}`);
      if (/^https?:\/\//i.test(e.place)) lines.push(`URL:${e.place}`);
    }
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
