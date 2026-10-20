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

export type DraftInput = { kind?: string; company?: string; question: string; charLimit?: number; body: string };
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
export type ResumeOutcome = { ok: true; pdf: Blob; filename: string } | { ok: false; error: "profile_missing" | "invalid" | "failed" };

export async function downloadResume(token: string, options: ResumeOptions, fetcher: typeof fetch = fetch): Promise<ResumeOutcome> {
  const res = await fetcher("/api/resume", {
    method: "POST",
    headers: { [TOKEN_HEADER]: token, "content-type": "application/json" },
    body: JSON.stringify(withoutEmptyFields(options)),
  });
  if (res.status === 404) return { ok: false, error: "profile_missing" };
  if (res.status === 400) return { ok: false, error: "invalid" };
  if (!res.ok) return { ok: false, error: "failed" };
  const disposition = res.headers.get("content-disposition") ?? "";
  const utf8 = /filename\*=UTF-8''([^;]+)/.exec(disposition)?.[1];
  return { ok: true, pdf: await res.blob(), filename: utf8 ? decodeURIComponent(utf8) : "rirekisho.pdf" };
}
