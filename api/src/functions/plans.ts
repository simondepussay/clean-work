import { app } from "@azure/functions";
import type { IdentityVerifier } from "../lib/identity";
import { withUser } from "../lib/http";
import { Repository } from "../lib/repository";
import { award, applicationEvents, profileEvents } from "../lib/score";
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
    const store = (deps.store ?? getStore)();
    const repo = new Repository(store, deps.now);
    const id = req.params.id;
    const body = () => req.json().catch(() => null);
    const notFound = { status: 404, jsonBody: { error: "not_found" } };

    if (!id) {
      if (req.method === "POST") {
        const plan = await repo.createPlan(user.userId, await body());
        await award(store, user.userId, [{ kind: "plan", key: plan.id }], deps.now);
        return { status: 201, jsonBody: plan };
      }
      return { jsonBody: await repo.listPlans(user.userId) };
    }
    if (req.method === "PUT") {
      const plan = await repo.updatePlan(user.userId, id, await body());
      if (plan?.done) await award(store, user.userId, [{ kind: "goalDone", key: plan.id }], deps.now);
      return plan ? { jsonBody: plan } : notFound;
    }
    if (req.method === "DELETE") return (await repo.deletePlan(user.userId, id)) ? { status: 204 } : notFound;
    return notFound;
  }, deps.verifier);
}

app.http("plans", { methods: ["GET", "POST", "PUT", "DELETE"], authLevel: "anonymous", route: "plans/{id?}", handler: plansHandler() });
