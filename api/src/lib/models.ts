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

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date au format AAAA-MM-JJ");
const yearMonth = z.string().regex(/^\d{4}-\d{2}$/, "mois au format AAAA-MM");
const text = (max: number) => z.string().trim().max(max);

// ------------------------------------------------------------------ profil

export const educationSchema = z.object({
  school: text(100).min(1),
  faculty: text(100).optional(),
  start: yearMonth,
  end: yearMonth.optional(),
  status: z.enum(["enrolled", "graduated", "expected", "left"]),
});

export const workSchema = z.object({
  company: text(100).min(1),
  role: text(100).optional(),
  start: yearMonth,
  end: yearMonth.optional(),
  description: text(1000).optional(),
});

export const profileInputSchema = z.object({
  nameKanji: text(50).min(1),
  nameKana: text(50).min(1),
  nameLatin: text(80).optional(),
  birthDate: isoDate.optional(),
  email: z.string().email().optional(),
  phone: text(30).optional(),
  address: text(200).optional(),
  education: z.array(educationSchema).max(20).default([]),
  work: z.array(workSchema).max(30).default([]),
  certifications: z.array(z.object({ name: text(100).min(1), date: yearMonth })).max(30).default([]),
  languages: z.array(z.object({ language: text(30).min(1), level: text(50) })).max(10).default([]),
});

export type ProfileInput = z.infer<typeof profileInputSchema>;
export type Profile = ProfileInput & { id: string; userId: string; updatedAt: string };

// ------------------------------------------------------------------ candidatures

/** Ordre des étapes du 就活, de la candidature à l'offre. */
export const stepTypes = ["es", "test", "interview1", "interview2", "final", "offer"] as const;

export const applicationStatuses = ["interested", ...stepTypes, "rejected", "withdrawn"] as const;

export const stepSchema = z.object({
  id: z.string().min(1),
  type: z.enum(stepTypes),
  dueDate: isoDate.optional(),
  done: z.boolean().default(false),
  note: text(500).optional(),
});

export const applicationInputSchema = z.object({
  company: text(100).min(1),
  position: text(100).optional(),
  url: z.string().url().optional(),
  status: z.enum(applicationStatuses).default("interested"),
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

export const draftInputSchema = z.object({
  applicationId: z.string().min(1),
  question: text(300).min(1),
  charLimit: z.number().int().positive().max(5000).optional(),
  body: z.string().max(5000).default(""),
});

export type DraftInput = z.infer<typeof draftInputSchema>;
export type Draft = DraftInput & { id: string; userId: string; updatedAt: string };

export type Review = {
  id: string;
  userId: string;
  draftId: string;
  score: number;
  issues: { quote: string; problem: string; suggestion: string }[];
  createdAt: string;
};

// ------------------------------------------------------------------ conteneurs Cosmos

export const containers = {
  profiles: "profiles",
  applications: "applications",
  drafts: "drafts",
  reviews: "reviews",
} as const;

export type ContainerName = (typeof containers)[keyof typeof containers];
