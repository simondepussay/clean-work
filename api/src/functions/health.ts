import { app } from "@azure/functions";
import { getStore } from "../lib/store";
import { resumeReady } from "../lib/resumePdf";
import { appVersion } from "../lib/version";

/** GET /api/health — utilisé par la surveillance et par le déploiement pour vérifier la mise en ligne. */
app.http("health", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "health",
  handler: async (_req, ctx) => {
    const version = appVersion();
    const resume = resumeReady() ? "ok" : "error";
    try {
      await getStore().ping();
      return { status: resume === "ok" ? 200 : 503, jsonBody: { status: resume, version, database: "ok", resume } };
    } catch (e) {
      ctx.error("health: base de données injoignable", e);
      return { status: 503, jsonBody: { status: "error", version, database: "error", resume } };
    }
  },
});
