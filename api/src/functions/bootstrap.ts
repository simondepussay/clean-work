import { app } from "@azure/functions";
import type { IdentityVerifier } from "../lib/identity";
import { withUser } from "../lib/http";
import { KokoroService } from "../lib/kokoro";
import { holidays } from "../lib/openData";
import { tokyoDate } from "../lib/reminders";
import { Repository } from "../lib/repository";
import { getStore, type DocStore } from "../lib/store";

type Fetcher = typeof fetch;

/**
 * GET /api/bootstrap?today=YYYY-MM-DD — tout ce que les écrans ouvrent d'abord, en UNE réponse
 * (« Backend for Frontend ») : compte, profil, candidatures, agenda, ES, こころ et jours fériés.
 *
 * Avant, l'accueil faisait trois vagues d'appels l'une après l'autre (chacun ~0,3 s) ; ici, toutes les
 * lectures partent en même temps vers Cosmos DB, à côté : la réponse prend le temps de la plus lente.
 * Le web s'en sert pour remplir son cache (et le garder sur l'appareil), les onglets s'ouvrent sans attendre.
 * Les routes habituelles (/api/applications…) restent : elles servent aux mises à jour et à l'iPhone.
 */
export function bootstrapHandler(deps: { verifier?: () => IdentityVerifier | null; store?: () => DocStore; now?: () => Date; fetcher?: Fetcher } = {}) {
  return withUser(async (req, user) => {
    const store = (deps.store ?? getStore)();
    const now = deps.now ?? (() => new Date());
    const repo = new Repository(store, now);
    const query = req.query.get("today");
    const today = query && /^\d{4}-\d{2}-\d{2}$/.test(query) ? query : tokyoDate(now());

    const [profile, applications, plans, drafts, kokoro, days] = await Promise.all([
      repo.getProfile(user.userId),
      repo.listApplications(user.userId),
      repo.listPlans(user.userId),
      repo.listDrafts(user.userId),
      new KokoroService(store, now).view(user.userId, today),
      // Les jours fériés viennent d'un service extérieur (mis en cache) : leur absence ne bloque rien.
      holidays(deps.fetcher ?? fetch).catch(() => null),
    ]);

    return {
      jsonBody: {
        me: { userId: user.userId, email: user.email ?? null, name: user.name ?? null, hasProfile: profile !== null },
        profile,
        applications,
        plans,
        drafts,
        kokoro,
        holidays: days,
        today,
      },
    };
  }, deps.verifier);
}

app.http("bootstrap", { methods: ["GET"], authLevel: "anonymous", route: "bootstrap", handler: bootstrapHandler() });
