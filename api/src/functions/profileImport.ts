import { app } from "@azure/functions";
import { cvMessages, cvSchema, importRequestSchema, sanitizeCv, type CvResult } from "../lib/cvImport";
import type { IdentityVerifier } from "../lib/identity";
import { withUser } from "../lib/http";
import { costJpy, reviewModelFromEnv, type StructuredModel } from "../lib/review";
import { getStore, type DocStore } from "../lib/store";
import { UsageLimiter } from "../lib/usage";

type Deps = { verifier?: () => IdentityVerifier | null; store?: () => DocStore; model?: () => StructuredModel | null; now?: () => Date };

/**
 * POST /api/profile/import { text } → les champs du profil trouvés dans le CV (rien n'est enregistré).
 * Compte comme une relecture par IA (mêmes limites, même budget).
 */
export function profileImportHandler(deps: Deps = {}) {
  return withUser(async (req, user, ctx) => {
    const ai = (deps.model ?? reviewModelFromEnv)();
    if (!ai) return { status: 503, jsonBody: { error: "ai_not_configured" } };
    const { text } = importRequestSchema.parse(await req.json().catch(() => null));
    const store = (deps.store ?? getStore)();
    const limiter = new UsageLimiter(store, deps.now);
    const reserved = await limiter.reserve(user.userId);
    if (!reserved.ok) {
      const { reason, retryAfter } = reserved.refusal;
      return { status: reason === "budget" ? 503 : 429, jsonBody: { error: "limit", reason, retryAfter } };
    }
    try {
      const { result, usage } = await ai.complete<CvResult>(cvMessages(text), "cv_import", cvSchema);
      await limiter.recordCost(costJpy(usage));
      return { jsonBody: sanitizeCv(result) };
    } catch (e) {
      await reserved.reservation.release();
      ctx.error("import de CV : échec du modèle", e);
      return { status: 502, jsonBody: { error: "ai_failed" } };
    }
  }, deps.verifier);
}

app.http("profileImport", { methods: ["POST"], authLevel: "anonymous", route: "profile/import", handler: profileImportHandler() });
