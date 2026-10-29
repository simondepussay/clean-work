/**
 * Données des écrans : « afficher tout de suite, mettre à jour en arrière-plan » (stale-while-revalidate),
 * comme Notion, Linear ou Gmail.
 *
 * 1. À l'ouverture, la dernière copie gardée sur cet appareil remplit le cache de api.ts :
 *    les onglets s'affichent aussitôt, sans attendre le réseau.
 * 2. En même temps, /api/bootstrap (une seule requête, côté serveur toutes les lectures en parallèle)
 *    rapporte les données fraîches : le cache est rempli à nouveau, la copie mise à jour, et les écrans
 *    ouverts sont prévenus (événement « cw:data ») pour se relire, sans clignoter.
 * 3. Après chaque modification, la même chose en arrière-plan, quelques instants plus tard.
 *
 * La copie ne quitte pas l'appareil ; elle est effacée à la déconnexion et à la suppression du compte,
 * et n'est utilisée que pour le même compte.
 */
import { API_BASE, TOKEN_HEADER, onApiChange, primeCache, primeProfile, type Application, type Draft, type Kokoro, type Me, type Plan, type ProfileInput } from "./api";

export type Bootstrap = {
  me: Me;
  profile: ProfileInput | null;
  applications: Application[];
  plans: Plan[];
  drafts: Draft[];
  kokoro: Kokoro;
  holidays: Record<string, string> | null;
  today: string;
};

const SNAPSHOT_KEY = "clean-work-snapshot-v1";
export const DATA_EVENT = "cw:data";

/** Date locale AAAA-MM-JJ (celle que les écrans utilisent pour /api/kokoro?today=…). */
const localDay = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function prime(token: string, b: Bootstrap) {
  primeCache(token, "/api/applications", b.applications);
  primeCache(token, "/api/plans", b.plans);
  primeCache(token, "/api/drafts", b.drafts);
  // « こころ » dépend du jour (météo du jour, encouragements) : seulement si la copie est d'aujourd'hui.
  if (b.today === localDay()) primeCache(token, `/api/kokoro?today=${b.today}`, b.kokoro);
  if (b.holidays) primeCache(token, "/api/holidays", b.holidays);
  primeProfile(token, b.profile);
}

/** La copie gardée sur l'appareil, seulement si elle appartient au compte connecté. */
export function readSnapshot(owner: string | null): Bootstrap | null {
  if (!owner) return null;
  try {
    const raw = JSON.parse(localStorage.getItem(SNAPSHOT_KEY) ?? "null") as { owner: string; data: Bootstrap } | null;
    return raw && raw.owner === owner ? raw.data : null;
  } catch {
    return null;
  }
}

export function clearSnapshot() {
  try { localStorage.removeItem(SNAPSHOT_KEY); } catch { /* stockage indisponible */ }
}

function saveSnapshot(owner: string, data: Bootstrap) {
  try { localStorage.setItem(SNAPSHOT_KEY, JSON.stringify({ owner, data })); } catch { /* plein ou interdit : tant pis */ }
}

/** Remplit le cache avec la copie de l'appareil (affichage immédiat). Renvoie le compte, s'il y en avait une. */
export function primeFromSnapshot(token: string, owner: string | null): Me | null {
  const snapshot = readSnapshot(owner);
  if (!snapshot) return null;
  prime(token, snapshot);
  return snapshot.me;
}

/** Les données fraîches, en une requête : cache rempli, copie mise à jour, écrans prévenus. */
export async function loadBootstrap(token: string, owner: string | null, fetcher: typeof fetch = fetch): Promise<Bootstrap | null> {
  try {
    const res = await fetcher(`${API_BASE}/api/bootstrap?today=${localDay()}`, { headers: { [TOKEN_HEADER]: token } });
    if (!res.ok) return null;
    const data = (await res.json()) as Bootstrap;
    // Réponse inattendue (ancienne API, panne…) : on n'en fait rien, l'app reprend le chemin habituel.
    if (!data?.me?.userId || !Array.isArray(data.applications) || !Array.isArray(data.plans)) return null;
    prime(token, data);
    if (owner) saveSnapshot(owner, data);
    window.dispatchEvent(new Event(DATA_EVENT));
    return data;
  } catch {
    return null;
  }
}

/** Après une modification : nouvelles données en arrière-plan (une seule fois pour plusieurs changements rapprochés). */
let pending: ReturnType<typeof setTimeout> | null = null;
export function refreshAfterChanges(owner: () => string | null) {
  onApiChange((token) => {
    if (pending) clearTimeout(pending);
    pending = setTimeout(() => { pending = null; loadBootstrap(token, owner()); }, 600);
  });
  return () => { onApiChange(null); if (pending) clearTimeout(pending); };
}
