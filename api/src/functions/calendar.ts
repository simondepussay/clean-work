import { app, type HttpRequest } from "@azure/functions";
import { buildFeed, feedToken, verifyFeedToken, type FeedLang } from "../lib/calendarFeed";
import type { IdentityVerifier } from "../lib/identity";
import { withUser } from "../lib/http";
import { containers, type Application, type Plan } from "../lib/models";
import { getStore, type DocStore } from "../lib/store";

type Deps = { verifier?: () => IdentityVerifier | null; store?: () => DocStore; secret?: () => string | undefined; now?: () => Date };

const langOf = (req: HttpRequest): FeedLang => {
  const l = req.query.get("lang");
  return l === "en" || l === "fr" ? l : "ja";
};

/** Version du lien de calendrier de l'utilisateur (0 tant qu'il n'a jamais demandé de nouveau lien). */
const LINK_DOC = "calendar-link";
type LinkDoc = { id: string; userId: string; version?: number };
const versionOf = async (store: DocStore, userId: string) =>
  (await store.get<LinkDoc>(containers.profiles, userId, LINK_DOC))?.version ?? 0;

/**
 * Abonnement de calendrier :
 *   GET  /api/calendar-link           (connecté) → { url } : le lien privé à donner à Google, Apple, Outlook…
 *   POST /api/calendar-link           (connecté) → { url } : nouveau lien ; l'ancien ne marche plus
 *   GET  /api/calendar/{token}.ics    (sans connexion, le jeton fait foi) → text/calendar
 */
export function calendarHandlers(deps: Deps = {}) {
  const secret = deps.secret ?? (() => process.env.CALENDAR_FEED_SECRET);
  const store = deps.store ?? getStore;

  const link = withUser(async (req, user) => {
    const s = secret();
    if (!s) return { status: 503, jsonBody: { error: "calendar_not_configured" } };
    const version = req.method === "POST"
      ? (await store().increment(containers.profiles, user.userId, LINK_DOC, { version: 1 })).version
      : await versionOf(store(), user.userId);
    // L'adresse publique du site (PUBLIC_SITE_URL) : le lien reste sur cleanwork.simondepussay.com,
    // même quand l'API qui répond est la Function App de Séoul.
    const origin = (process.env.PUBLIC_SITE_URL || new URL(req.url).origin).replace(/\/$/, "");
    return { jsonBody: { url: `${origin}/api/calendar/${feedToken(user.userId, s, version)}.ics?lang=${langOf(req)}` } };
  }, deps.verifier);

  const feed = async (req: HttpRequest) => {
    const s = secret();
    const link = s ? verifyFeedToken(req.params.token ?? "", s) : null;
    // Lien faux, révoqué ou secret absent : 404, sans dire lequel (rien à deviner).
    if (!link || link.version !== (await versionOf(store(), link.userId))) return { status: 404, body: "Not found" };
    const { userId } = link;
    const [apps, plans] = await Promise.all([
      store().list<Application>(containers.applications, userId),
      store().list<Plan>(containers.plans, userId),
    ]);
    return {
      status: 200,
      headers: {
        "content-type": "text/calendar; charset=utf-8",
        "content-disposition": 'inline; filename="clean-work.ics"',
        "cache-control": "private, max-age=900",
      },
      body: buildFeed(apps, plans, langOf(req), (deps.now ?? (() => new Date()))()),
    };
  };

  return { link, feed };
}

const handlers = calendarHandlers();
app.http("calendarLink", { methods: ["GET", "POST"], authLevel: "anonymous", route: "calendar-link", handler: handlers.link });
app.http("calendarFeed", { methods: ["GET"], authLevel: "anonymous", route: "calendar/{token}", handler: handlers.feed });
