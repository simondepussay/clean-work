/** Appels à l'API (/api, servie par Azure Functions). */

export type Health = { status: "ok" | "error"; version: string; database: "ok" | "error" };

export async function fetchHealth(fetcher: typeof fetch = fetch): Promise<Health | null> {
  try {
    const res = await fetcher("/api/health");
    return (await res.json()) as Health;
  } catch {
    return null;
  }
}
