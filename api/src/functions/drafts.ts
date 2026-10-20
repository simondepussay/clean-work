import { app } from "@azure/functions";
import type { IdentityVerifier } from "../lib/identity";
import { withUser } from "../lib/http";
import { Repository } from "../lib/repository";
import { getStore } from "../lib/store";

/**
 * ES (S13) :
 *   GET    /api/drafts        liste, la plus récemment modifiée d'abord
 *   POST   /api/drafts        création → 201
 *   PUT    /api/drafts/{id}   modification (champs envoyés seulement)
 *   DELETE /api/drafts/{id}   suppression → 204
 */
export function draftsHandler(verifier?: () => IdentityVerifier | null) {
  return withUser(async (req, user) => {
    const repo = new Repository(getStore());
    const id = req.params.id;
    const body = () => req.json().catch(() => null);
    const notFound = { status: 404, jsonBody: { error: "not_found" } };

    if (!id) {
      if (req.method === "POST") return { status: 201, jsonBody: await repo.createDraft(user.userId, await body()) };
      return { jsonBody: await repo.listDrafts(user.userId) };
    }
    if (req.method === "PUT") {
      const draft = await repo.updateDraft(user.userId, id, await body());
      return draft ? { jsonBody: draft } : notFound;
    }
    if (req.method === "DELETE") return (await repo.deleteDraft(user.userId, id)) ? { status: 204 } : notFound;
    const draft = await repo.getDraft(user.userId, id);
    return draft ? { jsonBody: draft } : notFound;
  }, verifier);
}

app.http("drafts", { methods: ["GET", "POST", "PUT", "DELETE"], authLevel: "anonymous", route: "drafts/{id?}", handler: draftsHandler() });
