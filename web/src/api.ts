/** Appels à l'API (/api, servie par Azure Functions). */

/** En-tête du jeton : Static Web Apps se réserve `Authorization`. */
export const TOKEN_HEADER = "x-shukatsu-token";

export type Health = { status: "ok" | "error"; version: string; database: "ok" | "error" };
export type Me = { userId: string; email: string | null; name: string | null; hasProfile: boolean };

export async function fetchHealth(fetcher: typeof fetch = fetch): Promise<Health | null> {
  try {
    const res = await fetcher("/api/health");
    return (await res.json()) as Health;
  } catch {
    return null;
  }
}

export async function fetchMe(token: string, fetcher: typeof fetch = fetch): Promise<Me | null> {
  const res = await fetcher("/api/me", { headers: { [TOKEN_HEADER]: token } });
  return res.ok ? ((await res.json()) as Me) : null;
}

/** Supprime le compte et toutes ses données (S25). */
export async function deleteAccount(token: string, fetcher: typeof fetch = fetch): Promise<boolean> {
  const res = await fetcher("/api/me", { method: "DELETE", headers: { [TOKEN_HEADER]: token } });
  return res.ok;
}

// ------------------------------------------------------------------ profil (S05)

export type Education = { school: string; faculty?: string; start: string; end?: string; status: "enrolled" | "graduated" | "expected" | "completed" | "left" };
export type Work = { company: string; role?: string; start: string; end?: string; description?: string };
export type Certification = { category: string; name: string; date: string };
export type Language = { language: string; languageOther?: string; level: string };

export type ProfileInput = {
  nameKanji: string;
  nameKana: string;
  nameLatin?: string;
  birthDate?: string;
  email?: string;
  phone?: string;
  address?: string;
  education: Education[];
  work: Work[];
  certifications: Certification[];
  languages: Language[];
};

export type Issue = { path: string; message: string };

export type SaveResult = { ok: true; profile: ProfileInput } | { ok: false; issues: Issue[] };

/** Le profil, ou null s'il n'existe pas encore (404). */
export async function getProfile(token: string, fetcher: typeof fetch = fetch): Promise<ProfileInput | null> {
  const res = await fetcher("/api/profile", { headers: { [TOKEN_HEADER]: token } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`profil : ${res.status}`);
  return (await res.json()) as ProfileInput;
}

export async function saveProfile(token: string, profile: ProfileInput, fetcher: typeof fetch = fetch): Promise<SaveResult> {
  const res = await fetcher("/api/profile", {
    method: "PUT",
    headers: { [TOKEN_HEADER]: token, "content-type": "application/json" },
    body: JSON.stringify(withoutEmptyFields(profile)),
  });
  if (res.status === 400) return { ok: false, issues: ((await res.json()) as { issues: Issue[] }).issues };
  if (!res.ok) throw new Error(`profil : ${res.status}`);
  return { ok: true, profile: (await res.json()) as ProfileInput };
}

/** Un champ facultatif laissé vide doit être absent, pas "" (sinon « email invalide », « date invalide »…). */
export function withoutEmptyFields<T>(value: T): T {
  if (Array.isArray(value)) return value.map(withoutEmptyFields) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).filter(([, v]) => v !== "" && v !== undefined).map(([k, v]) => [k, withoutEmptyFields(v)]),
    ) as T;
  }
  return value;
}

// ------------------------------------------------------------------ ES (S13)

/** applicationId : candidature reliée ; null pour délier (ES commune). */
export type DraftInput = { kind?: string; applicationId?: string | null; company?: string; question: string; charLimit?: number; body: string };
export type Draft = DraftInput & { id: string; createdAt: string; updatedAt: string };

async function call<T>(token: string, method: string, path: string, body?: unknown, fetcher: typeof fetch = fetch) {
  const res = await fetcher(path, {
    method,
    headers: { [TOKEN_HEADER]: token, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(withoutEmptyFields(body)),
  });
  if (res.status === 400) return { ok: false as const, issues: ((await res.json()) as { issues: Issue[] }).issues };
  if (!res.ok) throw new Error(`${method} ${path} : ${res.status}`);
  return { ok: true as const, value: (res.status === 204 ? null : await res.json()) as T };
}

export const listDrafts = (token: string, f?: typeof fetch) => call<Draft[]>(token, "GET", "/api/drafts", undefined, f);
export const createDraft = (token: string, d: DraftInput, f?: typeof fetch) => call<Draft>(token, "POST", "/api/drafts", d, f);
export const updateDraft = (token: string, id: string, d: DraftInput, f?: typeof fetch) =>
  call<Draft>(token, "PUT", `/api/drafts/${encodeURIComponent(id)}`, d, f);
export const deleteDraft = (token: string, id: string, f?: typeof fetch) =>
  call<null>(token, "DELETE", `/api/drafts/${encodeURIComponent(id)}`, undefined, f);

// ------------------------------------------------------------------ relecture IA (S14, S16)

export type ReviewIssue = { category: string; quote: string; problem: string; suggestion: string };
export type Review = {
  id: string; draftId: string; createdAt: string; language: string; bodySnapshot: string;
  score: number; summary: string; strengths: string[]; issues: ReviewIssue[];
};
export type Usage = { today: number; month: number };
export type ReviewOutcome =
  | { ok: true; review: Review }
  | { ok: false; error: "limit"; reason: "day" | "month" | "budget"; retryAfter: string }
  | { ok: false; error: "ai_failed" | "ai_not_configured" | "empty" };

export async function reviewDraft(token: string, id: string, language: string, fetcher: typeof fetch = fetch): Promise<ReviewOutcome> {
  const res = await fetcher(`/api/drafts/${encodeURIComponent(id)}/review`, {
    method: "POST",
    headers: { [TOKEN_HEADER]: token, "content-type": "application/json" },
    body: JSON.stringify({ language }),
  });
  const body = await res.json().catch(() => ({}));
  if (res.status === 201) return { ok: true, review: body as Review };
  if (res.status === 429 || body.error === "limit") return { ok: false, error: "limit", reason: body.reason, retryAfter: body.retryAfter };
  if (res.status === 400) return { ok: false, error: "empty" };
  if (body.error === "ai_not_configured") return { ok: false, error: "ai_not_configured" };
  return { ok: false, error: "ai_failed" };
}

export const listReviews = (token: string, id: string, f?: typeof fetch) =>
  call<Review[]>(token, "GET", `/api/drafts/${encodeURIComponent(id)}/reviews`, undefined, f);
export const getUsage = (token: string, f?: typeof fetch) => call<Usage>(token, "GET", "/api/usage", undefined, f);

// ------------------------------------------------------------------ 履歴書 PDF (S11)

export type ResumeOptions = { era: "western" | "japanese"; appeal?: string; wishes?: string };
/** 職務経歴書 (S12) */
export type WorkHistoryOptions = { era: "western" | "japanese"; summary?: string; skills?: string; selfPr?: string };
export type ResumeOutcome = { ok: true; pdf: Blob; filename: string } | { ok: false; error: "profile_missing" | "no_work" | "invalid" | "failed" };

export const downloadResume = (token: string, options: ResumeOptions, fetcher: typeof fetch = fetch) =>
  downloadPdf(token, "/api/resume", options, fetcher);
export const downloadWorkHistory = (token: string, options: WorkHistoryOptions, fetcher: typeof fetch = fetch) =>
  downloadPdf(token, "/api/work-history", options, fetcher);

async function downloadPdf(token: string, path: string, options: object, fetcher: typeof fetch): Promise<ResumeOutcome> {
  const res = await fetcher(path, {
    method: "POST",
    headers: { [TOKEN_HEADER]: token, "content-type": "application/json" },
    body: JSON.stringify(withoutEmptyFields(options)),
  });
  if (res.status === 404) return { ok: false, error: "profile_missing" };
  if (res.status === 400) {
    const body = await res.json().catch(() => ({}));
    return { ok: false, error: body.error === "no_work" ? "no_work" : "invalid" };
  }
  if (!res.ok) return { ok: false, error: "failed" };
  const disposition = res.headers.get("content-disposition") ?? "";
  const utf8 = /filename\*=UTF-8''([^;]+)/.exec(disposition)?.[1];
  return { ok: true, pdf: await res.blob(), filename: utf8 ? decodeURIComponent(utf8) : "rirekisho.pdf" };
}

// ------------------------------------------------------------------ candidatures (S07, S08)

export type StepType = "es" | "test" | "interview1" | "interview2" | "final" | "offer";
export type AppStatus = "interested" | StepType | "rejected" | "withdrawn";
export type Step = { id: string; type: StepType; dueDate?: string; done: boolean; note?: string };
export type Industry = "it" | "maker" | "trading" | "finance" | "consulting" | "retail" | "service" | "media" | "infrastructure" | "public" | "other";
export type CompanyType = "large" | "sme" | "startup" | "foreign";
export type ApplicationInput = {
  company: string; position?: string; url?: string; status: AppStatus; steps: Step[];
  /** null : effacer le champ (l'API garde sinon l'ancienne valeur). */
  industry?: Industry | null; companyType?: CompanyType | null; notes?: string;
};
export type Application = ApplicationInput & { id: string; nextDeadline: string | null; createdAt: string; updatedAt: string };

export const listApplications = (token: string, f?: typeof fetch) => call<Application[]>(token, "GET", "/api/applications", undefined, f);
export const createApplication = (token: string, a: ApplicationInput, f?: typeof fetch) =>
  call<Application>(token, "POST", "/api/applications", a, f);
export const updateApplication = (token: string, id: string, a: Partial<ApplicationInput>, f?: typeof fetch) =>
  call<Application>(token, "PUT", `/api/applications/${encodeURIComponent(id)}`, a, f);
export const deleteApplication = (token: string, id: string, f?: typeof fetch) =>
  call<null>(token, "DELETE", `/api/applications/${encodeURIComponent(id)}`, undefined, f);

// ------------------------------------------------------------------ entretiens (S17–S19)

export type InterviewStage = "interview1" | "interview2" | "final";
export type InterviewFeedback = { score: number; comment: string; improvements: string[]; expressions: { quote: string; suggestion: string }[] };
export type InterviewTurn = {
  question: string; intent: string; kind: "main" | "followUp";
  answer?: string; durationSec?: number; spoken?: boolean; feedback?: InterviewFeedback;
};
export type InterviewSummary = { score: number; summary: string; strengths: string[]; improvements: string[] };
export type Interview = {
  id: string; applicationId?: string; company?: string; stepId?: string; stepDate?: string; stage: InterviewStage; language: string;
  status: "active" | "finished"; turns: InterviewTurn[]; summary?: InterviewSummary; createdAt: string; updatedAt: string;
};
export type InterviewListItem = Pick<Interview, "id" | "company" | "applicationId" | "stepId" | "stepDate" | "stage" | "status" | "createdAt"> & { score: number | null; questions: number };
export type InterviewOutcome =
  | { ok: true; interview: Interview }
  | { ok: false; error: "limit"; reason: "day" | "month" | "budget"; retryAfter: string }
  | { ok: false; error: "ai_failed" | "ai_not_configured" | "finished" | "not_found" | "invalid" };

async function interviewCall(token: string, path: string, body: unknown, fetcher: typeof fetch): Promise<InterviewOutcome> {
  const res = await fetcher(path, {
    method: "POST",
    headers: { [TOKEN_HEADER]: token, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (res.ok) return { ok: true, interview: json as Interview };
  if (json.error === "limit") return { ok: false, error: "limit", reason: json.reason, retryAfter: json.retryAfter };
  if (res.status === 400) return { ok: false, error: "invalid" };
  if (res.status === 404) return { ok: false, error: "not_found" };
  if (res.status === 409) return { ok: false, error: "finished" };
  if (json.error === "ai_not_configured") return { ok: false, error: "ai_not_configured" };
  return { ok: false, error: "ai_failed" };
}

const interviewPath = (id: string) => `/api/interviews/${encodeURIComponent(id)}`;

export const startInterview = (token: string, input: { applicationId?: string; stepId?: string; stage: InterviewStage; language: string }, f: typeof fetch = fetch) =>
  interviewCall(token, "/api/interviews", input, f);
export const answerInterview = (token: string, id: string, input: { answer: string; durationSec?: number; spoken: boolean }, f: typeof fetch = fetch) =>
  interviewCall(token, `${interviewPath(id)}/answers`, input, f);
export const finishInterview = (token: string, id: string, f: typeof fetch = fetch) => interviewCall(token, `${interviewPath(id)}/finish`, {}, f);
export const listInterviews = (token: string, f?: typeof fetch) => call<InterviewListItem[]>(token, "GET", "/api/interviews", undefined, f);
export const getInterview = (token: string, id: string, f?: typeof fetch) => call<Interview>(token, "GET", interviewPath(id), undefined, f);
export const deleteInterview = (token: string, id: string, f?: typeof fetch) => call<null>(token, "DELETE", interviewPath(id), undefined, f);
export const getInterviewUsage = (token: string, f?: typeof fetch) => call<Usage>(token, "GET", "/api/interview-usage", undefined, f);

// ------------------------------------------------------------------ agenda (événements et objectifs)

export type PlanKind = "event" | "goal" | "note";
export type PlanInput = { kind: PlanKind; title: string; date: string; time?: string | null; note?: string; done?: boolean };
export type Plan = PlanInput & { id: string; done: boolean; createdAt: string; updatedAt: string };

export const listPlans = (token: string, f?: typeof fetch) => call<Plan[]>(token, "GET", "/api/plans", undefined, f);
export const createPlan = (token: string, p: PlanInput, f?: typeof fetch) => call<Plan>(token, "POST", "/api/plans", p, f);
export const updatePlan = (token: string, id: string, p: Partial<PlanInput>, f?: typeof fetch) =>
  call<Plan>(token, "PUT", `/api/plans/${encodeURIComponent(id)}`, p, f);
export const deletePlan = (token: string, id: string, f?: typeof fetch) =>
  call<null>(token, "DELETE", `/api/plans/${encodeURIComponent(id)}`, undefined, f);

// ------------------------------------------------------------------ abonnement de calendrier

/** Le lien privé d'abonnement (Google, Apple, Outlook…), dans la langue choisie. */
export const getCalendarLink = (token: string, lang: string, f?: typeof fetch) =>
  call<{ url: string }>(token, "GET", `/api/calendar-link?lang=${lang}`, undefined, f);

// ------------------------------------------------------------------ onglet « 情報 » : actualités

export type NewsSource = { id: string; name: string; site: string; lang: "ja" | "en" };
export type NewsItem = { source: string; title: string; link: string; date: string | null; excerpt: string };
export const getNews = (token: string, f?: typeof fetch) => call<{ sources: NewsSource[]; items: NewsItem[] }>(token, "GET", "/api/news", undefined, f);

/** Une carte de l'onglet « 情報 » : article ou interview de Clean Work, ou actualité choisie chaque matin. */
export type InfoCard = {
  id: string; kind: "article" | "interview" | "news"; date: string;
  title: { ja: string; en: string; fr: string };
  summary: { ja: string; en: string; fr: string };
  body?: string; lang?: "ja" | "en" | "fr"; link?: string; source?: string;
};
export type InfoPageData = { items: InfoCard[]; page: number; pages: number; total: number; sources: { id: string; name: string }[] };
export const getInfoPage = (token: string, page: number, f?: typeof fetch) => call<InfoPageData>(token, "GET", `/api/info?page=${page}`, undefined, f);
