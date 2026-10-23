import { app } from "@azure/functions";
import type { IdentityVerifier } from "../lib/identity";
import { withUser } from "../lib/http";
import { Repository } from "../lib/repository";
import { getStore, type DocStore } from "../lib/store";

/**
 * GET /api/profile — le profil de l'utilisateur connecté, ou 404 s'il n'en a pas encore.
 * PUT /api/profile — enregistre le profil entier (S05) ; 400 avec le détail si un champ est invalide.
 */
export function profileHandler(verifier?: () => IdentityVerifier | null, store: () => DocStore = getStore) {
  return withUser(async (req, user) => {
    const repo = new Repository(store());
    if (req.method === "PUT") {
      const body = await req.json().catch(() => null);
      return { jsonBody: await repo.saveProfile(user.userId, body) };
    }
    const profile = await repo.getProfile(user.userId);
    return profile ? { jsonBody: profile } : { status: 404, jsonBody: { error: "not_found" } };
  }, verifier);
}

app.http("profile", { methods: ["GET", "PUT"], authLevel: "anonymous", route: "profile", handler: profileHandler() });
