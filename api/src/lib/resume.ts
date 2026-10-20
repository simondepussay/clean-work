/**
 * Contenu du 履歴書 (S11), indépendant du dessin : dates (西暦 ou 和暦), âge, lignes
 * des tableaux. Mise en page : modèle du 厚生労働省 (2021), qui remplace l'ancien JIS.
 */
import type { Profile } from "./models";

export type Era = "western" | "japanese";

/** Ères japonaises, de la plus récente à la plus ancienne (date de début incluse). */
const ERAS = [
  { name: "令和", start: "2019-05-01" },
  { name: "平成", start: "1989-01-08" },
  { name: "昭和", start: "1926-12-25" },
] as const;

/** Année affichée : « 2026 » (西暦) ou « 令和8 », « 令和元 » (和暦). `date` : AAAA-MM-JJ. */
export function yearLabel(date: string, era: Era): string {
  const year = Number(date.slice(0, 4));
  if (era === "western") return String(year);
  const found = ERAS.find((e) => date >= e.start);
  if (!found) return String(year);
  const n = year - Number(found.start.slice(0, 4)) + 1;
  return `${found.name}${n === 1 ? "元" : n}`;
}

/** Pour une date AAAA-MM, l'ère est celle du 1er du mois (mai 2019 → 令和元). */
export const monthYearLabel = (month: string, era: Era) => yearLabel(`${month}-01`, era);

/** Âge révolu (満年齢) à une date donnée. */
export function age(birthDate: string, on: string): number {
  const years = Number(on.slice(0, 4)) - Number(birthDate.slice(0, 4));
  return on.slice(5) < birthDate.slice(5) ? years - 1 : years;
}

/** Une ligne du tableau 学歴・職歴 ou 免許・資格 : année, mois, texte, alignement. */
export type Row = { year: string; month: string; text: string; align?: "center" | "right" };

const STATUS_END: Record<string, string> = { graduated: "卒業", expected: "卒業見込み", completed: "修了", left: "中退" };

/** Un événement daté (entrée, sortie) ; `order` départage deux événements du même mois. */
type Event = { month: string; order: number; text: string };

/**
 * Lignes 学歴・職歴 terminées par « 以上 ». Chaque section liste des ÉVÉNEMENTS (入学, 卒業,
 * 入社, 退社) dans l'ordre des dates : un échange universitaire s'insère donc entre l'entrée
 * et la sortie de l'école principale.
 */
export function historyRows(profile: Profile, era: Era): Row[] {
  const toRows = (events: Event[]): Row[] =>
    events
      .sort((a, b) => a.month.localeCompare(b.month) || a.order - b.order)
      .map((e) => ({ year: monthYearLabel(e.month, era), month: String(Number(e.month.slice(5))), text: e.text }));

  const rows: Row[] = [{ year: "", month: "", text: "学　歴", align: "center" }];
  const education: Event[] = [];
  const studying: string[] = [];
  for (const e of profile.education) {
    const school = [e.school, e.faculty].filter(Boolean).join("　");
    education.push({ month: e.start, order: 1, text: `${school}　入学` });
    if (e.end && STATUS_END[e.status]) education.push({ month: e.end, order: 0, text: `${school}　${STATUS_END[e.status]}` });
    else if (e.status === "enrolled" && !e.end) studying.push(school);
  }
  rows.push(...toRows(education));
  if (studying.length > 0) rows.push({ year: "", month: "", text: "　　現在に至る（在学中）" });

  rows.push({ year: "", month: "", text: "職　歴", align: "center" });
  if (profile.work.length === 0) rows.push({ year: "", month: "", text: "なし" });
  const work: Event[] = [];
  let ongoing = false;
  for (const w of profile.work) {
    work.push({ month: w.start, order: 1, text: `${[w.company, w.role].filter(Boolean).join("　")}　入社` });
    if (w.end) work.push({ month: w.end, order: 0, text: `${w.company}　退社` });
    else ongoing = true;
  }
  rows.push(...toRows(work));
  if (ongoing) rows.push({ year: "", month: "", text: "　　現在に至る" });

  rows.push({ year: "", month: "", text: "以上", align: "right" });
  return rows;
}

const LANGUAGE_NAMES: Record<string, string> = {
  ja: "日本語", en: "英語", zh: "中国語", ko: "韓国語", vi: "ベトナム語", ne: "ネパール語", id: "インドネシア語",
  th: "タイ語", fr: "フランス語", es: "スペイン語", de: "ドイツ語", pt: "ポルトガル語",
};
const LEVEL_NAMES: Record<string, string> = { native: "ネイティブ", business: "ビジネスレベル", conversational: "日常会話レベル", basic: "基礎レベル" };

/** 合格 pour un examen qu'on réussit (JLPT, 英検) ; 取得 pour un score (TOEIC…) ou un diplôme, un permis. */
function verb(c: { category: string; name: string }) {
  const score = /TOEIC|TOEFL|IELTS|点|スコア|score/i.test(c.name);
  return c.category === "language" && !score ? "合格" : "取得";
}

/** Lignes 免許・資格 (par date), puis les langues (sans date). */
export function certificationRows(profile: Profile, era: Era): Row[] {
  const rows: Row[] = [...profile.certifications]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((c) => ({ year: monthYearLabel(c.date, era), month: String(Number(c.date.slice(5))), text: `${c.name}　${verb(c)}` }));
  for (const l of profile.languages) {
    const name = "languageOther" in l ? l.languageOther ?? "" : LANGUAGE_NAMES[l.language] ?? l.language;
    rows.push({ year: "", month: "", text: `${name}（${LEVEL_NAMES[l.level] ?? l.level}）` });
  }
  if (rows.length === 0) rows.push({ year: "", month: "", text: "特になし" });
  return rows;
}
