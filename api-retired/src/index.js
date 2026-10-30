/**
 * L'API de Clean Work a déménagé à Séoul (Function App func-shukatsu-ijdqobb4nlsxu, voir infra/api-korea.bicep).
 * Static Web Apps garde sinon la dernière API déployée : celle-ci la remplace et ne touche à aucune donnée.
 */
const { app } = require("@azure/functions");

app.http("retired", {
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  authLevel: "anonymous",
  route: "{*path}",
  handler: async () => ({
    status: 410,
    jsonBody: { error: "moved", api: "https://func-shukatsu-ijdqobb4nlsxu.azurewebsites.net" },
  }),
});
