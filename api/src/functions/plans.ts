import { app } from "@azure/functions";
import type { IdentityVerifier } from "../lib/identity";
import { withUser } from "../lib/http";
import { Repository } from "../lib/repository";
import { getStore, type DocStore } from "../lib/store";

/**
 * Agenda de l'accueil : événements et objectifs ajoutés par l'utilisateur.
 *   GET    /api/plans        liste, par date
 *   POST   /api/plans        { kind, title, date, time?, note?, done? } → 201
 *   PUT    /api/plans/{id}   champs envoyés seulement (null efface)
 *   DELETE /api/plans/{id}   → 204
 */
export function plansHandler(deps: { verifier?: () => IdentityVerifier | null; store?: () => DocStore; now?: () => Date } = {}) {
  return withUser(async (req, user) => {
    const repo = new Repository((deps.store ?? getStore)(), deps.now);
    const id = req.params.id;
    const body = () => req.json().catch(() => null);
    const notFound = { status: 404, jsonBody: { error: "not_found" } };

    if (!id) {
      if (req.method === "POST") return { status: 201, jsonBody: await repo.createPlan(user.userId, await body()) };
      return { jsonBody: await repo.listPlans(user.userId) };
    }
    if (req.method === "PUT") {
      const plan = await repo.updatePlan(user.userId, id, await body());
      return plan ? { jsonBody: plan } : notFound;
    }
    if (req.method === "DELETE") return (await repo.deletePlan(user.userId, id)) ? { status: 204 } : notFound;
    return notFound;
  }, deps.verifier);
}

app.http("plans", { methods: ["GET", "POST", "PUT", "DELETE"], authLevel: "anonymous", route: "plans/{id?}", handler: plansHandler() });
