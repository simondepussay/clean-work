import { app, type InvocationContext } from "@azure/functions";
import type { IdentityVerifier } from "../lib/identity";
import { withUser } from "../lib/http";
import { buildCardReadMessages, cardReadingSchema, cardReadSchema, CardService, matchesCard, sanitizeReading, type CardReading } from "../lib/cards";
import { costJpy, reviewModelFromEnv, type StructuredModel } from "../lib/review";
import { award } from "../lib/score";
import { getStore, type DocStore } from "../lib/store";
import { CARD_READ_LIMITS, CARD_READS, UsageLimiter } from "../lib/usage";

type Deps = { verifier?: () => IdentityVerifier | null; model?: () => StructuredModel | null; store?: () => DocStore; now?: () => Date };

/**
 * Cartes de visite (名刺) :
 *   GET    /api/cards?q=…          liste (la plus récente d'abord), filtrée par mots-clés si q est donné
 *   POST   /api/cards              { …champs, image? } → 201 (409 au-delà de MAX_CARDS)
 *   GET    /api/cards/{id}         une carte
 *   PUT    /api/cards/{id}         modification (champs envoyés seulement)
 *   DELETE /api/cards/{id}         suppression (et sa photo) → 204
 *   GET    /api/cards/{id}/image   la photo (image/jpeg)
 *   POST   /api/cards/read         { text } → les champs rangés par l'IA (rien n'est enregistré)
 */
export function cardHandlers(deps: Deps = {}) {
  const store = deps.store ?? getStore;
  const model = deps.model ?? reviewModelFromEnv;
  const now = deps.now ?? (() => new Date());
  const service = () => new CardService(store(), now);
  const notFound = { status: 404, jsonBody: { error: "not_found" } };

  const cards = withUser(async (req, user) => {
    const id = req.params.id;
    const body = () => req.json().catch(() => null);
    if (!id) {
      if (req.method === "POST") {
        const card = await service().create(user.userId, await body());
        if (!card) return { status: 409, jsonBody: { error: "too_many_cards" } };
        await award(store(), user.userId, [{ kind: "card", key: card.id }], now);
        return { status: 201, jsonBody: card };
      }
      const all = await service().list(user.userId);
      const q = req.query.get("q")?.trim();
      return { jsonBody: q ? all.filter((c) => matchesCard(c, q)) : all };
    }
    if (req.method === "PUT") {
      const card = await service().update(user.userId, id, await body());
      return card ? { jsonBody: card } : notFound;
    }
    if (req.method === "DELETE") return (await service().remove(user.userId, id)) ? { status: 204 } : notFound;
    const card = await service().get(user.userId, id);
    return card ? { jsonBody: card } : notFound;
  }, deps.verifier);

  const image = withUser(async (req, user) => {
    const jpeg = await service().image(user.userId, req.params.id);
    if (!jpeg) return notFound;
    return { body: jpeg, headers: { "content-type": "image/jpeg", "cache-control": "private, max-age=86400" } };
  }, deps.verifier);

  const read = withUser(async (req, user, ctx: InvocationContext) => {
    const ai = model();
    if (!ai) return { status: 503, jsonBody: { error: "ai_not_configured" } };
    const { text } = cardReadSchema.parse((await req.json().catch(() => ({}))) ?? {});
    const limiter = new UsageLimiter(store(), now, CARD_READ_LIMITS, CARD_READS);
    const reserved = await limiter.reserve(user.userId);
    if (!reserved.ok) {
      const { reason, retryAfter } = reserved.refusal;
      return { status: reason === "budget" ? 503 : 429, jsonBody: { error: "limit", reason, retryAfter } };
    }
    let output;
    try {
      output = await ai.complete<CardReading>(buildCardReadMessages(text), "business_card", cardReadingSchema);
    } catch (e) {
      await reserved.reservation.release();
      ctx.error("名刺 : échec du modèle", e);
      return { status: 502, jsonBody: { error: "ai_failed" } };
    }
    const cost = costJpy(output.usage);
    await limiter.recordCost(cost);
    ctx.log(`名刺 : ${output.usage.inputTokens}+${output.usage.outputTokens} jetons, ${cost.toFixed(2)} ¥`);
    return { jsonBody: sanitizeReading(output.result) };
  }, deps.verifier);

  return { cards, image, read };
}

const handlers = cardHandlers();
// « read » d'abord : sinon « cards/read » serait pris pour la carte d'identifiant « read ».
app.http("cardRead", { methods: ["POST"], authLevel: "anonymous", route: "cards/read", handler: handlers.read });
app.http("cardImage", { methods: ["GET"], authLevel: "anonymous", route: "cards/{id}/image", handler: handlers.image });
app.http("cards", { methods: ["GET", "POST", "PUT", "DELETE"], authLevel: "anonymous", route: "cards/{id?}", handler: handlers.cards });
