/**
 * Import d'un suivi existant (export CSV de Notion, Huntr, Excel ou Google Sheets) dans 応募.
 * Tout se fait dans le navigateur : le fichier n'est pas envoyé tel quel, seules les candidatures
 * confirmées par l'utilisateur sont créées, une par une, par l'API habituelle.
 */
import type { AppStatus, ApplicationInput } from "../api";

/** Lit un CSV (RFC 4180) : guillemets, virgules et retours à la ligne dans les champs, BOM d'Excel. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^\uFEFF/, "");
  // Excel en japonais enregistre parfois avec des points-virgules ou des tabulations.
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const sep = [",", ";", "\t"].map((s) => [s, firstLine.split(s).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f.trim())) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim())) rows.push(row);
  return rows;
}

export type Target = "company" | "position" | "url" | "status" | "notes" | "location" | "deadline" | "ignore";

/** Noms de colonnes connus (Notion, Huntr, modèles japonais), en minuscules. */
const HEADERS: Record<Exclude<Target, "ignore">, string[]> = {
  company: ["company", "company name", "employer", "organization", "企業", "企業名", "会社", "会社名", "name", "名前"],
  position: ["title", "job title", "position", "role", "job", "職種", "ポジション", "役職", "募集職種"],
  url: ["url", "link", "job url", "job link", "posting", "リンク", "求人url", "採用ページ"],
  status: ["status", "stage", "list", "state", "ステータス", "状況", "選考状況", "進捗"],
  notes: ["notes", "note", "description", "comments", "memo", "メモ", "備考", "詳細"],
  location: ["location", "city", "place", "勤務地", "場所", "所在地"],
  deadline: ["deadline", "due", "due date", "close date", "締切", "締め切り", "応募締切", "期限"],
};

/** Devine à quoi sert chaque colonne d'après son titre (« ignore » sinon). */
export function guessColumns(header: string[]): Target[] {
  const used = new Set<Target>();
  return header.map((h) => {
    const name = h.trim().toLowerCase();
    const hit = (Object.keys(HEADERS) as Exclude<Target, "ignore">[]).find((t) => !used.has(t) && HEADERS[t].includes(name));
    if (hit) used.add(hit);
    return hit ?? "ignore";
  });
}

/** Statut d'un autre outil → étape de Clean Work (Huntr : Wishlist, Applied, Interview, Offer, Rejected…). */
export function mapStatus(value: string): AppStatus {
  const v = value.trim().toLowerCase();
  const rules: [RegExp, AppStatus][] = [
    [/reject|declin|不合格|お祈り|落選|見送/, "rejected"],
    [/withdr|辞退|取り下げ/, "withdrawn"],
    [/offer|内定|内々定/, "offer"],
    [/final|最終/, "final"],
    [/second|2nd|二次|2次/, "interview2"],
    [/interview|面接|面談/, "interview1"],
    [/test|spi|適性|webテスト|筆記/, "test"],
    // « ES提出済み » : l'ES est envoyée, donc la candidature aussi.
    [/提出済|submitted|sent/, "applied"],
    [/\bes\b|entry sheet|エントリーシート/, "es"],
    [/appl|応募|エントリー|submitted|提出/, "applied"],
  ];
  return rules.find(([r]) => r.test(v))?.[1] ?? "interested";
}

/** Date en AAAA-MM-JJ depuis « 2026/12/15 », « 2026-12-15 », « December 15, 2026 », « 2026年12月15日 »… */
export function normaliseDate(value: string): string | undefined {
  const v = value.trim();
  const jp = v.match(/(\d{4})\s*[年/.-]\s*(\d{1,2})\s*[月/.-]\s*(\d{1,2})/);
  if (jp) return `${jp[1]}-${jp[2].padStart(2, "0")}-${jp[3].padStart(2, "0")}`;
  const t = Date.parse(v);
  if (!v || Number.isNaN(t)) return undefined;
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Lignes du CSV → candidatures (sans entreprise, la ligne est ignorée). */
export function toApplications(rows: string[][], columns: Target[]): ApplicationInput[] {
  return rows.flatMap((row) => {
    const get = (t: Target) => {
      const i = columns.indexOf(t);
      return i >= 0 ? (row[i] ?? "").trim() : "";
    };
    const company = get("company").slice(0, 100);
    if (!company) return [];
    const url = get("url");
    const deadline = normaliseDate(get("deadline"));
    const location = get("location");
    const notes = [location && `勤務地：${location}`, get("notes")].filter(Boolean).join("\n\n").slice(0, 5000);
    const app: ApplicationInput = {
      company,
      status: get("status") ? mapStatus(get("status")) : "interested",
      steps: deadline ? [{ id: crypto.randomUUID(), type: "es", dueDate: deadline, done: false }] : [],
    };
    const position = get("position").slice(0, 100);
    if (position) app.position = position;
    if (/^https?:\/\//i.test(url)) app.url = url;
    if (notes) app.notes = notes;
    return [app];
  });
}

/** Déjà dans 応募 : même entreprise et même poste (sans tenir compte des espaces ni de la casse). */
export const sameApplication = (a: { company: string; position?: string }, b: { company: string; position?: string }) => {
  const key = (x: { company: string; position?: string }) => `${x.company}|${x.position ?? ""}`.replace(/\s+/g, "").toLowerCase();
  return key(a) === key(b);
};
