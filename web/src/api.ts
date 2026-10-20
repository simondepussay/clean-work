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

export type Education = { school: string; faculty?: string; start: string; end?: string; status: "enrolled" | "graduated" | "expected" | "left" };
export type Work = { company: string; role?: string; start: string; end?: string; description?: string };
export type Certification = { category: string; name: string; date: string };
export type Language = { language: string; level: string };

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
