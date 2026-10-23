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

/**
 * Abonnement de calendrier :
 *   GET /api/calendar-link            (connecté) → { url } : le lien privé à donner à Google, Apple, Outlook…
 *   GET /api/calendar/{token}.ics     (sans connexion, le jeton fait foi) → text/calendar
 */
export function calendarHandlers(deps: Deps = {}) {
  const secret = deps.secret ?? (() => process.env.CALENDAR_FEED_SECRET);
  const store = deps.store ?? getStore;

  const link = withUser(async (req, user) => {
    const s = secret();
    if (!s) return { status: 503, jsonBody: { error: "calendar_not_configured" } };
    const origin = new URL(req.url).origin;
    return { jsonBody: { url: `${origin}/api/calendar/${feedToken(user.userId, s)}.ics?lang=${langOf(req)}` } };
  }, deps.verifier);

  const feed = async (req: HttpRequest) => {
    const s = secret();
    const userId = s ? verifyFeedToken(req.params.token ?? "", s) : null;
    // Lien faux ou secret absent : 404, sans dire lequel (rien à deviner).
    if (!userId) return { status: 404, body: "Not found" };
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
app.http("calendarLink", { methods: ["GET"], authLevel: "anonymous", route: "calendar-link", handler: handlers.link });
app.http("calendarFeed", { methods: ["GET"], authLevel: "anonymous", route: "calendar/{token}", handler: handlers.feed });
