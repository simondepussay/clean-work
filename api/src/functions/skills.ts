import { app } from "@azure/functions";
import type { IdentityVerifier } from "../lib/identity";
import { withUser } from "../lib/http";
import { SkillsService } from "../lib/skills";
import { award, applicationEvents, profileEvents } from "../lib/score";
import { getStore, type DocStore } from "../lib/store";

/**
 * スキル辞典.
 *   GET /api/skills   → { levels: { [skillId]: 1 | 2 }, updatedAt }
 *   PUT /api/skills   { levels } (toutes les compétences cochées) → { levels, updatedAt } ; 400 si invalide
 */
export function skillsHandler(verifier?: () => IdentityVerifier | null, store: () => DocStore = getStore) {
  return withUser(async (req, user) => {
    const skills = new SkillsService(store());
    if (req.method === "PUT") {
      const saved = await skills.save(user.userId, await req.json().catch(() => null));
      await award(store(), user.userId, Object.keys(saved.levels).map((id) => ({ kind: "skill" as const, key: id })));
      return { jsonBody: saved };
    }
    return { jsonBody: await skills.get(user.userId) };
  }, verifier);
}

app.http("skills", { methods: ["GET", "PUT"], authLevel: "anonymous", route: "skills", handler: skillsHandler() });
