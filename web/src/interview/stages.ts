import type { Application, InterviewStage } from "../api";
import type { Lang } from "../i18n";

export const STAGES: { value: InterviewStage; ja: string; en: string; fr: string }[] = [
  { value: "interview1", ja: "一次面接", en: "1st interview", fr: "1er entretien" },
  { value: "interview2", ja: "二次面接", en: "2nd interview", fr: "2e entretien" },
  { value: "final", ja: "最終面接", en: "Final interview", fr: "Entretien final" },
];
export const stageName = (s: InterviewStage, lang: Lang = "ja") => STAGES.find((x) => x.value === s)?.[lang] ?? s;

/** L'étape d'entretien qui suit le statut actuel de la candidature (S08). */
export function stageFor(app: Application | undefined): InterviewStage {
  if (app?.status === "interview2") return "interview2";
  if (app?.status === "final" || app?.status === "offer") return "final";
  return "interview1";
}

export type ScheduledInterview = { applicationId: string; stepId: string; company: string; stage: InterviewStage; date: string };

const INTERVIEW_STEPS = new Set<string>(["interview1", "interview2", "final"]);

/**
 * Les entretiens prévus dans les candidatures (étapes 一次・二次・最終 non terminées, à partir
 * d'aujourd'hui), le plus proche d'abord : on s'entraîne pour l'un d'eux.
 */
export function scheduledInterviews(apps: Application[], today: string): ScheduledInterview[] {
  return apps
    .filter((a) => a.status !== "rejected" && a.status !== "withdrawn")
    .flatMap((a) => a.steps
      .filter((s) => INTERVIEW_STEPS.has(s.type) && !s.done && s.dueDate && s.dueDate >= today)
      .map((s) => ({ applicationId: a.id, stepId: s.id, company: a.company, stage: s.type as InterviewStage, date: s.dueDate! })))
    .sort((x, y) => x.date.localeCompare(y.date));
}
