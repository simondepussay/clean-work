import { app } from "@azure/functions";
import type { IdentityVerifier } from "../lib/identity";
import { withUser } from "../lib/http";
import { Repository } from "../lib/repository";
import { award, applicationEvents, profileEvents } from "../lib/score";
import { getStore, type DocStore } from "../lib/store";

/**
 * Candidatures (S07, S08) :
 *   GET    /api/applications        liste, l'échéance la plus proche d'abord
 *   POST   /api/applications        création → 201
 *   PUT    /api/applications/{id}   modification (statut, étapes…), échéance recalculée
 *   DELETE /api/applications/{id}   suppression → 204
 */
export function applicationsHandler(deps: { verifier?: () => IdentityVerifier | null; store?: () => DocStore; now?: () => Date } = {}) {
  return withUser(async (req, user) => {
    const store = (deps.store ?? getStore)();
    const repo = new Repository(store, deps.now);
    const id = req.params.id;
    const body = () => req.json().catch(() => null);
    const notFound = { status: 404, jsonBody: { error: "not_found" } };

    if (!id) {
      if (req.method === "POST") {
        const created = await repo.createApplication(user.userId, await body());
        await award(store, user.userId, applicationEvents(created, true), deps.now);
        return { status: 201, jsonBody: created };
      }
      return { jsonBody: await repo.listApplications(user.userId) };
    }
    if (req.method === "PUT") {
      const updated = await repo.updateApplication(user.userId, id, await body());
      if (updated) await award(store, user.userId, applicationEvents(updated, false), deps.now);
      return updated ? { jsonBody: updated } : notFound;
    }
    if (req.method === "DELETE") return (await repo.deleteApplication(user.userId, id)) ? { status: 204 } : notFound;
    return notFound;
  }, deps.verifier);
}

app.http("applications", { methods: ["GET", "POST", "PUT", "DELETE"], authLevel: "anonymous", route: "applications/{id?}", handler: applicationsHandler() });
