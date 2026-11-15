import { app } from "@azure/functions";
import type { IdentityVerifier } from "../lib/identity";
import { withUser } from "../lib/http";
import { SkillsService } from "../lib/skills";
import { getStore, type DocStore } from "../lib/store";

/**
 * スキル辞典.
 *   GET /api/skills   → { levels: { [skillId]: 1 | 2 }, updatedAt }
 *   PUT /api/skills   { levels } (toutes les compétences cochées) → { levels, updatedAt } ; 400 si invalide
 */
export function skillsHandler(verifier?: () => IdentityVerifier | null, store: () => DocStore = getStore) {
  return withUser(async (req, user) => {
    const skills = new SkillsService(store());
    if (req.method === "PUT") return { jsonBody: await skills.save(user.userId, await req.json().catch(() => null)) };
    return { jsonBody: await skills.get(user.userId) };
  }, verifier);
}

app.http("skills", { methods: ["GET", "PUT"], authLevel: "anonymous", route: "skills", handler: skillsHandler() });
