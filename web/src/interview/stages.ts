import type { Application, InterviewStage } from "../api";

export const STAGES: { value: InterviewStage; ja: string; en: string }[] = [
  { value: "interview1", ja: "一次面接", en: "1st interview" },
  { value: "interview2", ja: "二次面接", en: "2nd interview" },
  { value: "final", ja: "最終面接", en: "Final interview" },
];
export const stageName = (s: InterviewStage) => STAGES.find((x) => x.value === s)?.ja ?? s;

/** L'étape d'entretien qui suit le statut actuel de la candidature (S08). */
export function stageFor(app: Application | undefined): InterviewStage {
  if (app?.status === "interview2") return "interview2";
  if (app?.status === "final" || app?.status === "offer") return "final";
  return "interview1";
}

