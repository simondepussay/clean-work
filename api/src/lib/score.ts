/**
 * Le score : des points quand on avance dans son 就活, et un niveau doux (種 → 芽 → 若葉 → 蕾 → 花 → 実).
 *
 * Règles :
 *   - on ne perd jamais de points (supprimer une candidature ne retire rien) ;
 *   - chaque geste ne rapporte qu'une fois : une clé par geste (« candidature X créée », « météo du 17/11 »…),
 *     donc modifier dix fois la même chose ne rapporte rien de plus ;
 *   - au plus DAILY_CAP points par jour (heure UTC), pour que créer et supprimer en boucle ne serve à rien ;
 *   - pas de classement, pas de série de jours à ne pas casser : l'app reste calme.
 *
 * Stockage : un document « score » par utilisateur dans le conteneur des compteurs, sans durée de vie.
 * Tout passe par `increment` (atomique dans Cosmos DB) : deux requêtes simultanées ne comptent pas deux fois
 * le même geste. La clé déjà vue revient à 2 → on rend les points.
 */
import { containers } from "./models";
import type { DocStore } from "./store";

export const SCORE_DOC = "score";
export const DAILY_CAP = 150;

/** Ce que rapporte chaque geste. */
export const POINTS = {
  profileField: 5,
  skill: 3,
  application: 10,
  step: 15,
  offer: 50,
  plan: 3,
  goalDone: 5,
  draft: 5,
  review: 10,
  interview: 15,
  research: 10,
  debrief: 10,
  email: 5,
  document: 5,
  mood: 5,
  journal: 5,
} as const;

export type ScoreKind = keyof typeof POINTS;
export type ScoreEvent = { kind: ScoreKind; key: string };

/** Les niveaux, du plus bas au plus haut : à partir de combien de points. */
export const LEVELS = [0, 50, 150, 400, 800, 1500] as const;

export function levelOf(points: number) {
  let level = 0;
  for (const [i, floor] of LEVELS.entries()) if (points >= floor) level = i;
  const next = LEVELS[level + 1] ?? null;
  return { points, level, floor: LEVELS[level], next };
}

/** Une clé sûre pour un nom de champ Cosmos DB (pas de « / » ni de « ~ » dans un chemin de patch). */
const field = (key: string) => `k_${key.replace(/[^A-Za-z0-9_-]/g, "_")}`;

export class ScoreService {
  constructor(private store: DocStore, private now: () => Date = () => new Date()) {}

  async view(userId: string) {
    const { points } = await this.store.increment(containers.usage, userId, SCORE_DOC, { points: 0 });
    return levelOf(points);
  }

  /** Donne les points de ces gestes (ceux déjà comptés ne rapportent rien). Renvoie le nombre de points gagnés. */
  async award(userId: string, events: ScoreEvent[]) {
    let gained = 0;
    const day = `day_${this.now().toISOString().slice(0, 10)}`;
    for (const { kind, key } of events) {
      const points = POINTS[kind];
      const seen = field(`${kind}_${key}`);
      const counts = await this.store.increment(containers.usage, userId, SCORE_DOC, { points, [seen]: 1, [day]: points });
      if (counts[seen] > 1 || counts[day] > DAILY_CAP) {
        // Déjà compté, ou plafond du jour atteint : on rend tout (au plafond, le geste pourra compter un autre jour).
        await this.store.increment(containers.usage, userId, SCORE_DOC, { points: -points, [seen]: -1, [day]: -points });
        continue;
      }
      gained += points;
    }
    return gained;
  }

  /** Comme `award`, mais une erreur ne fait jamais échouer le geste de l'utilisateur. */
  async safeAward(userId: string, events: ScoreEvent[], log?: (msg: string) => void) {
    if (events.length === 0) return 0;
    try {
      return await this.award(userId, events);
    } catch (e) {
      log?.(`score non compté : ${(e as Error).message}`);
      return 0;
    }
  }
}

/** Donne des points sans jamais faire échouer la requête (le score est un bonus, pas une fonction critique). */
export async function award(store: DocStore, userId: string, events: ScoreEvent[], now?: () => Date) {
  if (events.length === 0) return;
  await new ScoreService(store, now).safeAward(userId, events, (m) => console.warn(m));
}

/** Les points d'une candidature : la créer, puis chaque étape atteinte (l'offre vaut plus). */
export function applicationEvents(app: { id: string; status: string }, created: boolean): ScoreEvent[] {
  const events: ScoreEvent[] = created ? [{ kind: "application", key: app.id }] : [];
  if (app.status === "offer") events.push({ kind: "offer", key: app.id });
  else if (!["interested", "rejected", "withdrawn"].includes(app.status)) events.push({ kind: "step", key: `${app.id}_${app.status}` });
  return events;
}

/** Les points du profil : une fois par rubrique remplie (nom, école, expériences…). */
export function profileEvents(profile: Record<string, unknown>): ScoreEvent[] {
  const filled = (v: unknown) => Array.isArray(v) ? v.length > 0 : typeof v === "string" ? v.trim() !== "" : v != null && v !== false;
  return Object.entries(profile)
    .filter(([k, v]) => !["id", "userId", "updatedAt"].includes(k) && filled(v))
    .map(([k]) => ({ kind: "profileField" as const, key: k }));
}
