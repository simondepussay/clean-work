/**
 * Modèle de données (S03).
 *
 * Le diagramme E-R du plan est le modèle logique (normalisé : STEP est une entité à part).
 * Ici c'est le modèle physique pour Cosmos DB (base documents) : on regroupe ce qui est
 * lu ensemble. Les étapes de sélection sont donc intégrées au document de candidature
 * (une seule lecture pour afficher le kanban), tandis que les ES et les relectures
 * restent des documents à part parce qu'ils grossissent avec le temps.
 *
 * Chaque document porte `userId`, qui est aussi la clé de partition de chaque conteneur.
 */
import { z } from "zod";

// Messages montrés à l'utilisateur sous le champ concerné : japonais / anglais.
export const messages = {
  required: "入力してください / Required",
  tooLong: (max: number) => `${max}文字以内で入力してください / ${max} characters max`,
  date: "YYYY-MM-DD の形式で入力してください / Use the format YYYY-MM-DD",
  month: "YYYY-MM の形式で入力してください / Use the format YYYY-MM",
  kana: "ひらがなかカタカナで入力してください / Use hiragana or katakana",
  email: "メールアドレスが正しくありません / Invalid email address",
  url: "URLが正しくありません / Invalid URL",
  choice: "選択してください / Please choose",
  number: "1〜5000の数字で入力してください / Enter a number from 1 to 5000",
} as const;

const isoDate = z.string({ required_error: messages.required }).regex(/^\d{4}-\d{2}-\d{2}$/, messages.date);
const yearMonth = z.string({ required_error: messages.required }).regex(/^\d{4}-\d{2}$/, messages.month);
const text = (max: number) => z.string({ required_error: messages.required }).trim().max(max, messages.tooLong(max));
const required = (max: number) => text(max).min(1, messages.required);

/** Hiragana, katakana (dont « ー » et « ・ ») et espaces, demi- ou pleine largeur. */
export const KANA = /^[\u3040-\u309F\u30A0-\u30FF\s\u3000]+$/;

// ------------------------------------------------------------------ profil

export const educationSchema = z.object({
  school: required(100),
  faculty: text(100).optional(),
  start: yearMonth,
  end: yearMonth.optional(),
  // completed : programme terminé sans diplôme au sens strict (日本語学校, échange) → « 修了 ».
  status: z.enum(["enrolled", "graduated", "expected", "completed", "left"]),
});

export const workSchema = z.object({
  company: required(100),
  role: text(100).optional(),
  start: yearMonth,
  end: yearMonth.optional(),
  description: text(1000).optional(),
});

/** Langues proposées (codes ISO 639-1) ; « other » pour le reste. */
export const languageCodes = ["ja", "en", "zh", "ko", "vi", "ne", "id", "th", "fr", "es", "de", "pt", "other"] as const;
/** Niveaux habituels d'un 履歴書 : ネイティブ, ビジネス, 日常会話, 基礎. */
export const languageLevels = ["native", "business", "conversational", "basic"] as const;
/** Catégories de certification : 語学, IT, ビジネス, 学位・学校, 運転免許, その他. */
export const certificationCategories = ["language", "it", "business", "degree", "driving", "other"] as const;

const choice = <T extends readonly [string, ...string[]]>(values: T) =>
  z.enum(values, { errorMap: () => ({ message: messages.choice }) });

export const certificationSchema = z.object({
  category: choice(certificationCategories).default("other"),
  name: required(100),
  date: yearMonth,
});

export const languageSchema = z
  .object({
    language: choice(languageCodes),
    /** Nom de la langue quand `language` vaut « other ». */
    languageOther: text(30).optional(),
    level: choice(languageLevels),
  })
  .superRefine((l, ctx) => {
    if (l.language === "other" && !l.languageOther) {
      ctx.addIssue({ code: "custom", path: ["languageOther"], message: messages.required });
    }
  })
  // Un nom saisi puis abandonné (langue changée) n'est pas gardé.
  .transform(({ languageOther, ...rest }) => (rest.language === "other" ? { ...rest, languageOther } : rest));

export const profileInputSchema = z.object({
  nameKanji: required(50),
  // Le 履歴書 attend la lecture du nom en kana (ふりがな).
  nameKana: required(50).regex(KANA, messages.kana),
  nameLatin: text(80).optional(),
  birthDate: isoDate.optional(),
  email: z.string().email(messages.email).optional(),
  phone: text(30).optional(),
  address: text(200).optional(),
  education: z.array(educationSchema).max(20).default([]),
  work: z.array(workSchema).max(30).default([]),
  certifications: z.array(certificationSchema).max(30).default([]),
  languages: z.array(languageSchema).max(10).default([]),
});

export type ProfileInput = z.infer<typeof profileInputSchema>;
export type Profile = ProfileInput & { id: string; userId: string; updatedAt: string };

// ------------------------------------------------------------------ candidatures

/** Ordre des étapes du 就活, de la candidature à l'offre. */
export const stepTypes = ["es", "test", "interview1", "interview2", "final", "offer"] as const;

export const applicationStatuses = ["interested", ...stepTypes, "rejected", "withdrawn"] as const;

export const stepSchema = z.object({
  id: z.string().min(1),
  type: choice(stepTypes),
  dueDate: isoDate.optional(),
  done: z.boolean().default(false),
  note: text(500).optional(),
});

export const applicationInputSchema = z.object({
  company: required(100),
  position: text(100).optional(),
  url: z.string().url().optional(),
  status: choice(applicationStatuses).default("interested"),
  steps: z.array(stepSchema).max(20).default([]),
});

export type Step = z.infer<typeof stepSchema>;
export type ApplicationInput = z.infer<typeof applicationInputSchema>;
export type Application = ApplicationInput & {
  id: string;
  userId: string;
  nextDeadline: string | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * Prochaine échéance d'une candidature : la date la plus proche parmi les étapes
 * non terminées, à partir d'aujourd'hui. Stockée dans le document pour pouvoir
 * trier et envoyer les rappels (S09) sans relire toutes les étapes.
 */
export function nextDeadline(steps: Step[], today: string): string | null {
  const upcoming = steps
    .filter((s) => !s.done && s.dueDate && s.dueDate >= today)
    .map((s) => s.dueDate as string)
    .sort();
  return upcoming[0] ?? null;
}

// ------------------------------------------------------------------ ES et relectures

/** Types de questions guidés (web/public/es-guide.json) ; « free » pour une question libre. */
export const draftKinds = ["jikopr", "motivation", "gakuchika", "strengths", "free"] as const;

export const draftInputSchema = z.object({
  kind: choice(draftKinds).default("free"),
  /** Candidature concernée ; absent pour une ES « commune » (自己PR utilisé partout). null = délier. */
  applicationId: z.string().min(1).nullish().transform((v) => v ?? undefined),
  /** L'entreprise, en clair, tant que le suivi des candidatures (S07) n'existe pas. */
  company: text(100).optional(),
  question: required(300),
  charLimit: z.number({ invalid_type_error: messages.number }).int(messages.number).positive(messages.number).max(5000, messages.number).optional(),
  body: z.string().max(5000, messages.tooLong(5000)).default(""),
});

export type DraftInput = z.infer<typeof draftInputSchema>;
export type Draft = DraftInput & { id: string; userId: string; createdAt: string; updatedAt: string };

/** Une relecture par IA (S14), avec le texte relu tel qu'il était (pour comparer, S15). */
export type Review = {
  id: string;
  userId: string;
  draftId: string;
  createdAt: string;
  model: string;
  language: string;
  bodySnapshot: string;
  score: number;
  summary: string;
  strengths: string[];
  issues: { category: string; quote: string; problem: string; suggestion: string }[];
  /** Citations écartées parce qu'introuvables dans le texte (le modèle les a inventées). */
  discarded: number;
};

// ------------------------------------------------------------------ appareils (S26)

/** Environnement APNs : « sandbox » pour les builds lancés depuis Xcode, « production » pour TestFlight et l'App Store. */
export const pushEnvironments = ["sandbox", "production"] as const;

export const deviceInputSchema = z.object({
  /** Jeton d'appareil APNs, en hexadécimal (64 caractères aujourd'hui, Apple se réserve de l'allonger). */
  token: z.string().trim().toLowerCase().regex(/^[0-9a-f]{64,200}$/, "invalid device token"),
  environment: z.enum(pushEnvironments),
});

export type DeviceInput = z.infer<typeof deviceInputSchema>;
/** Un iPhone qui reçoit les rappels. L'identifiant du document est le jeton lui-même. */
export type Device = DeviceInput & { id: string; userId: string; createdAt: string; updatedAt: string };

// ------------------------------------------------------------------ conteneurs Cosmos

export const containers = {
  profiles: "profiles",
  applications: "applications",
  drafts: "drafts",
  reviews: "reviews",
  /** Compteurs d'utilisation de l'IA (S16) : un document par utilisateur et par mois. */
  usage: "usage",
  /** Jetons APNs des iPhone (S26), plusieurs par utilisateur possible. */
  devices: "devices",
} as const;

export type ContainerName = (typeof containers)[keyof typeof containers];
