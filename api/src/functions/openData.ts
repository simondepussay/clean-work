import { app } from "@azure/functions";
import type { IdentityVerifier } from "../lib/identity";
import { withUser } from "../lib/http";
import { dayWeather, gbizFromEnv, holidays, postalAddress, prefectureOf, type GBizClient } from "../lib/openData";

type Deps = { verifier?: () => IdentityVerifier | null; fetcher?: typeof fetch; gbiz?: () => GBizClient | null; now?: () => Date };

/**
 * Données ouvertes (voir lib/openData.ts), réservées aux utilisateurs connectés :
 *   GET /api/holidays                       → { "2026-11-03": "文化の日", … }
 *   GET /api/postal/{code}                  → { postalCode, address, prefecture } ou 404
 *   GET /api/weather?date=&location=        → { date, prefecture, kind, rainChance, tMax, tMin } ou 404
 *   GET /api/company/search?name=           → [{ corporateNumber, name, location }]   (503 sans jeton gBizINFO)
 *   GET /api/company/{corporateNumber}      → fiche (labels, chiffres du lieu de travail) ou 404
 */
export function openDataHandler(what: "holidays" | "postal" | "weather" | "company", deps: Deps = {}) {
  const fetcher = deps.fetcher ?? fetch;
  return withUser(async (req, _user, ctx) => {
    const key = req.params.key;
    try {
      if (what === "holidays") return { jsonBody: await holidays(fetcher) };
      if (what === "postal" && key) {
        const found = await postalAddress(key, fetcher);
        return found ? { jsonBody: found } : { status: 404, jsonBody: { error: "not_found" } };
      }
      if (what === "weather") {
        const date = req.query.get("date") ?? "";
        const w = await dayWeather(date, prefectureOf(req.query.get("location")), fetcher, (deps.now ?? (() => new Date()))());
        return w ? { jsonBody: w } : { status: 404, jsonBody: { error: "not_found" } };
      }
      if (what === "company") {
        const gbiz = (deps.gbiz ?? gbizFromEnv)();
        if (!gbiz) return { status: 503, jsonBody: { error: "not_configured" } };
        if (key === "search") return { jsonBody: await gbiz.search(req.query.get("name") ?? "") };
        const facts = key ? await gbiz.facts(key) : null;
        return facts ? { jsonBody: facts } : { status: 404, jsonBody: { error: "not_found" } };
      }
    } catch (e) {
      // Service extérieur en panne : l'app continue sans ces informations.
      ctx.warn(`données ouvertes (${what}) indisponibles`, e);
      return { status: 502, jsonBody: { error: "unavailable" } };
    }
    return { status: 404, jsonBody: { error: "not_found" } };
  }, deps.verifier);
}

app.http("holidays", { methods: ["GET"], authLevel: "anonymous", route: "holidays", handler: openDataHandler("holidays") });
app.http("postal", { methods: ["GET"], authLevel: "anonymous", route: "postal/{key}", handler: openDataHandler("postal") });
app.http("weather", { methods: ["GET"], authLevel: "anonymous", route: "weather", handler: openDataHandler("weather") });
app.http("company", { methods: ["GET"], authLevel: "anonymous", route: "company/{key}", handler: openDataHandler("company") });
