import type { AppStatus, CompanyType, Industry, StepType } from "../api";

/** Étapes du 就活 dans l'ordre : une colonne du tableau chacune (S08). */
export const COLUMNS: { status: AppStatus; ja: string; en: string }[] = [
  { status: "interested", ja: "気になる", en: "Interested" },
  { status: "es", ja: "ES", en: "Entry sheet" },
  { status: "test", ja: "適性検査", en: "Aptitude test" },
  { status: "interview1", ja: "一次面接", en: "1st interview" },
  { status: "interview2", ja: "二次面接", en: "2nd interview" },
  { status: "final", ja: "最終面接", en: "Final interview" },
  { status: "offer", ja: "内定", en: "Offer" },
];

/** Fin de parcours : dernière colonne « 終了 ». */
export const CLOSED: { status: AppStatus; ja: string; en: string }[] = [
  { status: "rejected", ja: "不合格", en: "Rejected" },
  { status: "withdrawn", ja: "辞退", en: "Withdrawn" },
];

export const STEP_TYPES: { value: StepType; label: string }[] = COLUMNS.filter((c) => c.status !== "interested")
  .map((c) => ({ value: c.status as StepType, label: `${c.ja} / ${c.en}` }));

export const statusLabel = (s: AppStatus) => {
  const found = [...COLUMNS, ...CLOSED].find((c) => c.status === s);
  return found ? `${found.ja} / ${found.en}` : s;
};

/** Étape suivante ou précédente du parcours (pas de passage automatique vers « 終了 »). */
export function neighbour(status: AppStatus, direction: -1 | 1): AppStatus | null {
  const i = COLUMNS.findIndex((c) => c.status === status);
  if (i < 0) return null;
  return COLUMNS[i + direction]?.status ?? null;
}

/** Jours restants avant une date AAAA-MM-JJ, comptés en dates locales (0 = aujourd'hui). */
export function daysUntil(date: string, today = new Date()) {
  const [y, m, d] = date.split("-").map(Number);
  const target = Date.UTC(y, m - 1, d);
  const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target - now) / 86_400_000);
}

export function deadlineLabel(days: number) {
  if (days === 0) return "今日 / today";
  if (days === 1) return "明日 / tomorrow";
  return `あと${days}日 / ${days} days left`;
}

/** 業界 (mêmes codes que l'API). */
export const INDUSTRIES: { value: Industry; ja: string; en: string }[] = [
  { value: "it", ja: "IT・通信", en: "IT & telecom" },
  { value: "maker", ja: "メーカー", en: "Manufacturing" },
  { value: "trading", ja: "商社", en: "Trading" },
  { value: "finance", ja: "金融", en: "Finance" },
  { value: "consulting", ja: "コンサル", en: "Consulting" },
  { value: "retail", ja: "小売・流通", en: "Retail" },
  { value: "service", ja: "サービス・人材", en: "Services & HR" },
  { value: "media", ja: "広告・マスコミ", en: "Advertising & media" },
  { value: "infrastructure", ja: "インフラ・交通", en: "Infrastructure & transport" },
  { value: "public", ja: "官公庁・団体", en: "Public sector" },
  { value: "other", ja: "その他", en: "Other" },
];

export const COMPANY_TYPES: { value: CompanyType; ja: string; en: string }[] = [
  { value: "large", ja: "大手", en: "Large company" },
  { value: "sme", ja: "中小企業", en: "Small / medium" },
  { value: "startup", ja: "ベンチャー", en: "Startup" },
  { value: "foreign", ja: "外資系", en: "Foreign-owned" },
];
