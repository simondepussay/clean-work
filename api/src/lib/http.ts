/**
 * Enveloppes communes des routes :
 *   - withUser : routes protégées. Vérifie le jeton, puis appelle le gestionnaire avec
 *     l'utilisateur connecté. Les erreurs de validation (zod) deviennent des 400 lisibles,
 *     le reste des 500 sans détail interne.
 *   - withCron : tâches planifiées (GitHub Actions), protégées par un secret partagé.
 *
 * Les deux refusent d'abord les corps trop gros (413), avant toute lecture du JSON.
 */
import type { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { timingSafeEqual } from "node:crypto";
import { ZodError } from "zod";
import { TOKEN_HEADER, verifierFromEnv, type IdentityVerifier, type SignedInUser } from "./identity";

export type AuthedHandler = (req: HttpRequest, user: SignedInUser, ctx: InvocationContext) => Promise<HttpResponseInit>;

/**
 * Taille maximale d'une requête. Le plus gros envoi légitime est un profil complet
 * (30 emplois × 1000 caractères japonais ≈ 90 Ko) ou un CV de 15 000 caractères (≈ 45 Ko).
 */
export const MAX_BODY_BYTES = 256 * 1024;

/** 413 si la requête annonce un corps trop gros ; null sinon. */
export function tooLarge(req: HttpRequest, max = MAX_BODY_BYTES): HttpResponseInit | null {
  const length = Number(req.headers.get("content-length") ?? 0);
  return length > max ? { status: 413, jsonBody: { error: "too_large", max } } : null;
}

/**
 * Limite de débit par utilisateur, en mémoire de l'instance : elle ne coûte aucune requête
 * à Cosmos DB. Imparfaite si Azure lance plusieurs instances, mais elle suffit à empêcher
 * un compte de faire monter la facture en boucle. Les limites de l'IA (UsageLimiter) restent
 * la vraie protection du budget.
 */
export class RateLimiter {
  private hits = new Map<string, number[]>();

  constructor(private readonly limit: number, private readonly windowMs = 60_000, private readonly now = () => Date.now()) {}

  /** true si la requête passe (et la compte), false si la limite est atteinte. */
  take(key: string): boolean {
    const t = this.now();
    const recent = (this.hits.get(key) ?? []).filter((at) => t - at < this.windowMs);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(t);
    this.hits.set(key, recent);
    // Ménage de temps en temps : les utilisateurs inactifs ne restent pas en mémoire.
    if (this.hits.size > 5000) for (const [k, v] of this.hits) if (v.every((at) => t - at >= this.windowMs)) this.hits.delete(k);
    return true;
  }
}

/** Par minute et par utilisateur : 300 requêtes en tout, dont 60 écritures. */
export const LIMITS_PER_MINUTE = { all: 300, writes: 60 };
const allRequests = new RateLimiter(LIMITS_PER_MINUTE.all);
const writeRequests = new RateLimiter(LIMITS_PER_MINUTE.writes);
const isWrite = (method: string) => method !== "GET" && method !== "HEAD";

let shared: IdentityVerifier | null | undefined;

export function withUser(
  handler: AuthedHandler,
  verifier?: () => IdentityVerifier | null,
  limiters: { all: RateLimiter; writes: RateLimiter } = { all: allRequests, writes: writeRequests },
) {
  const resolve = verifier ?? (() => (shared ??= verifierFromEnv()));
  return async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    const v = resolve();
    if (!v) return { status: 503, jsonBody: { error: "auth_not_configured" } };

    const big = tooLarge(req);
    if (big) return big;

    const user = await v.verify(req.headers.get(TOKEN_HEADER));
    if (!user) return { status: 401, jsonBody: { error: "unauthorized" } };

    if (!limiters.all.take(user.userId) || (isWrite(req.method) && !limiters.writes.take(user.userId))) {
      return { status: 429, headers: { "retry-after": "60" }, jsonBody: { error: "rate_limited" } };
    }

    try {
      return await handler(req, user, ctx);
    } catch (e) {
      if (e instanceof ZodError) return invalid(e);
      ctx.error("erreur inattendue", e);
      return { status: 500, jsonBody: { error: "internal" } };
    }
  };
}

/** 400 avec la liste des champs refusés. */
export function invalid(e: ZodError): HttpResponseInit {
  return { status: 400, jsonBody: { error: "invalid", issues: e.issues.map((i) => ({ path: i.path.join("."), message: i.message })) } };
}

// ------------------------------------------------------------------ tâches planifiées

export const CRON_HEADER = "x-shukatsu-cron";

/** Compare deux secrets en temps constant (le temps de réponse ne révèle pas combien de caractères sont bons). */
export function sameSecret(given: string | null, expected: string | undefined) {
  if (!given || !expected || expected.length < 32) return false;
  const a = Buffer.from(given), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Chaque tâche a son propre secret (CRON_SECRET_PUSH, CRON_SECRET_INFO, CRON_SECRET_REPORT,
 * CRON_SECRET_BETA, posés par infra/cron-secrets.mjs) : une fuite n'en ouvre qu'une.
 * Tant qu'un secret propre n'est pas posé, l'ancien secret commun PUSH_CRON_SECRET sert encore,
 * pour ne rien casser pendant la transition.
 */
export type CronTask = "PUSH" | "INFO" | "REPORT" | "BETA";
export const cronSecretFromEnv = (task: CronTask, env: NodeJS.ProcessEnv = process.env) =>
  env[`CRON_SECRET_${task}`] || env.PUSH_CRON_SECRET;

/** Route de tâche planifiée : 401 sans le bon secret dans l'en-tête x-shukatsu-cron. */
export function withCron(secret: () => string | undefined, handler: (req: HttpRequest, ctx: InvocationContext) => Promise<HttpResponseInit>) {
  return async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    if (!sameSecret(req.headers.get(CRON_HEADER), secret())) return { status: 401, jsonBody: { error: "unauthorized" } };
    return handler(req, ctx);
  };
}
