import { app } from "@azure/functions";
import { getStore } from "../lib/store";
import { appVersion } from "../lib/version";

/** GET /api/health — utilisé par la surveillance et par le déploiement pour vérifier la mise en ligne. */
app.http("health", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "health",
  handler: async (_req, ctx) => {
    const version = appVersion();
    try {
      await getStore().ping();
      return { jsonBody: { status: "ok", version, database: "ok" } };
    } catch (e) {
      ctx.error("health: base de données injoignable", e);
      return { status: 503, jsonBody: { status: "error", version, database: "error" } };
    }
  },
});
