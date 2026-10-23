import type { AppStatus, CompanyType, Industry, StepType } from "../api";
import type { Lang } from "../i18n";

type Named = { ja: string; en: string; fr: string };

/** Étapes du 就活 dans l'ordre : une colonne du tableau chacune (S08). */
export const COLUMNS: (Named & { status: AppStatus })[] = [
  { status: "interested", ja: "気になる", en: "Interested", fr: "Intéressé" },
  { status: "es", ja: "ES", en: "Entry sheet", fr: "ES" },
  { status: "test", ja: "適性検査", en: "Aptitude test", fr: "Test d'aptitude" },
  { status: "interview1", ja: "一次面接", en: "1st interview", fr: "1er entretien" },
  { status: "interview2", ja: "二次面接", en: "2nd interview", fr: "2e entretien" },
  { status: "final", ja: "最終面接", en: "Final interview", fr: "Entretien final" },
  { status: "offer", ja: "内定", en: "Offer", fr: "Offre" },
];

/** Fin de parcours : dernière colonne « 終了 ». */
export const CLOSED: (Named & { status: AppStatus })[] = [
  { status: "rejected", ja: "不合格", en: "Rejected", fr: "Refusé" },
  { status: "withdrawn", ja: "辞退", en: "Withdrawn", fr: "Désisté" },
];

/** Étapes proposées dans une candidature, libellées dans la langue choisie. */
export const stepTypes = (lang: Lang): { value: StepType; label: string }[] => COLUMNS.filter((c) => c.status !== "interested")
  .map((c) => ({ value: c.status as StepType, label: c[lang] }));

export const statusLabel = (s: AppStatus, lang: Lang) => [...COLUMNS, ...CLOSED].find((c) => c.status === s)?.[lang] ?? s;

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

export function deadlineLabel(days: number, lang: Lang) {
  const labels = {
    ja: [`今日`, `明日`, `あと${days}日`],
    en: ["Today", "Tomorrow", `${days} days left`],
    fr: ["Aujourd'hui", "Demain", `Dans ${days} jours`],
  }[lang];
  return labels[Math.min(days, 2)];
}

/** 業界 (mêmes codes que l'API). */
export const INDUSTRIES: (Named & { value: Industry })[] = [
  { value: "it", ja: "IT・通信", en: "IT & telecom", fr: "Informatique et télécoms" },
  { value: "maker", ja: "メーカー", en: "Manufacturing", fr: "Industrie" },
  { value: "trading", ja: "商社", en: "Trading", fr: "Maison de commerce" },
  { value: "finance", ja: "金融", en: "Finance", fr: "Finance" },
  { value: "consulting", ja: "コンサル", en: "Consulting", fr: "Conseil" },
  { value: "retail", ja: "小売・流通", en: "Retail", fr: "Distribution" },
  { value: "service", ja: "サービス・人材", en: "Services & HR", fr: "Services et RH" },
  { value: "media", ja: "広告・マスコミ", en: "Advertising & media", fr: "Publicité et médias" },
  { value: "infrastructure", ja: "インフラ・交通", en: "Infrastructure & transport", fr: "Infrastructures et transports" },
  { value: "public", ja: "官公庁・団体", en: "Public sector", fr: "Secteur public" },
  { value: "other", ja: "その他", en: "Other", fr: "Autre" },
];

export const COMPANY_TYPES: (Named & { value: CompanyType })[] = [
  { value: "large", ja: "大手", en: "Large company", fr: "Grande entreprise" },
  { value: "sme", ja: "中小企業", en: "Small or medium-sized", fr: "PME" },
  { value: "startup", ja: "ベンチャー", en: "Startup", fr: "Start-up" },
  { value: "foreign", ja: "外資系", en: "Foreign-owned", fr: "Entreprise étrangère" },
];
