import { app } from "@azure/functions";
import type { IdentityVerifier } from "../lib/identity";
import { withUser } from "../lib/http";
import { latestNews, NEWS_SOURCES } from "../lib/news";

/** GET /api/news — actualités de l'onglet « 情報 » (titres, liens, extraits ; cache de 30 minutes). */
export function newsHandler(deps: { verifier?: () => IdentityVerifier | null; news?: typeof latestNews } = {}) {
  return withUser(async () => ({
    jsonBody: {
      sources: NEWS_SOURCES.map(({ id, name, site, lang }) => ({ id, name, site, lang })),
      items: await (deps.news ?? latestNews)(),
    },
  }), deps.verifier);
}

app.http("news", { methods: ["GET"], authLevel: "anonymous", route: "news", handler: newsHandler() });
