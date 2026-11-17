import { app } from "@azure/functions";
import type { IdentityVerifier } from "../lib/identity";
import { withUser } from "../lib/http";
import { ScoreService } from "../lib/score";
import { getStore, type DocStore } from "../lib/store";

/**
 * GET /api/score — les points de l'utilisateur et son niveau :
 *   { points, level (0 = 種 … 5 = 実), floor (points du niveau), next (points du niveau suivant, null au dernier) }
 * Les points sont donnés par les autres routes, au moment du geste (voir lib/score.ts).
 */
export function scoreHandler(deps: { verifier?: () => IdentityVerifier | null; store?: () => DocStore } = {}) {
  return withUser(async (_req, user) => ({
    jsonBody: await new ScoreService((deps.store ?? getStore)()).view(user.userId),
    headers: { "Cache-Control": "no-store" },
  }), deps.verifier);
}

app.http("score", { methods: ["GET"], authLevel: "anonymous", route: "score", handler: scoreHandler() });
