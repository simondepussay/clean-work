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
