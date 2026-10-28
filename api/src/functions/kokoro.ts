import { app } from "@azure/functions";
import type { IdentityVerifier } from "../lib/identity";
import { withUser } from "../lib/http";
import { KokoroService } from "../lib/kokoro";
import { getStore, type DocStore } from "../lib/store";

/**
 * Onglet « こころ » (données privées, jamais envoyées à l'IA).
 *   GET    /api/kokoro?today=YYYY-MM-DD   humeurs des 8 dernières semaines, valeurs, palier de soutien
 *   PUT    /api/kokoro/mood               { date, weather: "sunny"|"cloudy"|"rainy"|null, word? } → 204
 *   PUT    /api/kokoro/values             { values: string[] (3 max) } → { values }
 *   DELETE /api/kokoro                    efface tout → 204
 */
export function kokoroHandler(deps: { verifier?: () => IdentityVerifier | null; store?: () => DocStore; now?: () => Date } = {}) {
  return withUser(async (req, user) => {
    const kokoro = new KokoroService((deps.store ?? getStore)(), deps.now);
    const part = req.params.part;
    const body = () => req.json().catch(() => null);

    if (!part && req.method === "GET") {
      const today = req.query.get("today");
      return { jsonBody: await kokoro.view(user.userId, today && /^\d{4}-\d{2}-\d{2}$/.test(today) ? today : undefined) };
    }
    if (!part && req.method === "DELETE") {
      await kokoro.erase(user.userId);
      return { status: 204 };
    }
    if (part === "mood" && req.method === "PUT") {
      await kokoro.setMood(user.userId, await body());
      return { status: 204 };
    }
    if (part === "values" && req.method === "PUT") return { jsonBody: { values: await kokoro.setValues(user.userId, await body()) } };
    return { status: 404, jsonBody: { error: "not_found" } };
  }, deps.verifier);
}

app.http("kokoro", { methods: ["GET", "PUT", "DELETE"], authLevel: "anonymous", route: "kokoro/{part?}", handler: kokoroHandler() });
