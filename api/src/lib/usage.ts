/**
 * Limites d'utilisation de l'IA (S16).
 *
 * Avant chaque relecture, on réserve une place (+1) puis on vérifie ; au-delà d'une
 * limite, on rend la place (−1). Les compteurs sont incrémentés de façon atomique par
 * Cosmos DB : deux requêtes simultanées ne peuvent pas dépasser la limite ensemble.
 */
import { containers } from "./models";
import type { DocStore } from "./store";

export const LIMITS = {
  perDay: 10,
  perMonth: 30,
  /** Budget de l'app entière, en yens, au-delà duquel la relecture s'arrête jusqu'au mois suivant. */
  monthlyBudgetJpy: 3000,
};

/** Les compteurs d'un mois sont gardés 400 jours, puis Cosmos DB les efface. */
const USAGE_TTL = 400 * 86400;
/** Partition des compteurs de l'app entière (aucun utilisateur n'a cet identifiant). */
export const GLOBAL = "_global";

export type Refusal = { reason: "day" | "month" | "budget"; retryAfter: string };
export type Reservation = { release(): Promise<void> };

export class UsageLimiter {
  constructor(private store: DocStore, private now: () => Date = () => new Date(), private limits = LIMITS) {}

  private keys() {
    const iso = this.now().toISOString();
    return { month: iso.slice(0, 7), dayField: `day_${iso.slice(0, 10)}` };
  }

  /** Réserve une relecture pour l'utilisateur, ou explique pourquoi c'est refusé. */
  async reserve(userId: string): Promise<{ ok: true; reservation: Reservation } | { ok: false; refusal: Refusal }> {
    const { month, dayField } = this.keys();

    const budget = await this.store.increment(containers.usage, GLOBAL, month, { costJpy: 0 }, USAGE_TTL);
    if (budget.costJpy >= this.limits.monthlyBudgetJpy) return { ok: false, refusal: { reason: "budget", retryAfter: this.nextMonth() } };

    const deltas = { reviews: 1, [dayField]: 1 };
    const counts = await this.store.increment(containers.usage, userId, month, deltas, USAGE_TTL);
    const release = async () => {
      await this.store.increment(containers.usage, userId, month, { reviews: -1, [dayField]: -1 });
    };

    if (counts[dayField] > this.limits.perDay) {
      await release();
      return { ok: false, refusal: { reason: "day", retryAfter: this.tomorrow() } };
    }
    if (counts.reviews > this.limits.perMonth) {
      await release();
      return { ok: false, refusal: { reason: "month", retryAfter: this.nextMonth() } };
    }
    return { ok: true, reservation: { release } };
  }

  /** Ajoute le coût d'une relecture au budget du mois. */
  async recordCost(costJpy: number) {
    await this.store.increment(containers.usage, GLOBAL, this.keys().month, { costJpy }, USAGE_TTL);
  }

  /** Ce qu'il reste à l'utilisateur ce mois-ci et aujourd'hui (pour l'afficher). */
  async remaining(userId: string) {
    const { month, dayField } = this.keys();
    const counts = await this.store.increment(containers.usage, userId, month, { reviews: 0, [dayField]: 0 }, USAGE_TTL);
    return {
      today: Math.max(0, this.limits.perDay - counts[dayField]),
      month: Math.max(0, this.limits.perMonth - counts.reviews),
    };
  }

  private tomorrow() {
    const d = this.now();
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1)).toISOString();
  }

  private nextMonth() {
    const d = this.now();
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString();
  }
}
