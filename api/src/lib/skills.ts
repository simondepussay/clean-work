/**
 * スキル辞典 : auto-évaluation sur une liste de compétences classées (la liste vit dans
 * web/public/skills.json, partagée par le site et l'iPhone). Pour chaque compétence :
 *   1 = ○ (des notions), 2 = ◎ (bien maîtrisée) ; absente = pas cochée.
 * Un seul document par utilisateur, dans le conteneur des profils (id « skills »).
 */
import { z } from "zod";
import { containers } from "./models";
import type { DocStore } from "./store";

export const SKILLS_DOC = "skills";
export const MAX_SKILLS = 400;

export const skillLevelsSchema = z.object({
  levels: z
    .record(z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/), z.union([z.literal(1), z.literal(2)]))
    .refine((o) => Object.keys(o).length <= MAX_SKILLS, { message: `${MAX_SKILLS} max` }),
});

export type SkillLevels = Record<string, 1 | 2>;
type SkillsDoc = { id: string; userId: string; levels: SkillLevels; updatedAt: string };

export class SkillsService {
  constructor(private store: DocStore, private now: () => Date = () => new Date()) {}

  async get(userId: string) {
    const doc = await this.store.get<SkillsDoc>(containers.profiles, userId, SKILLS_DOC);
    return { levels: doc?.levels ?? {}, updatedAt: doc?.updatedAt ?? null };
  }

  async save(userId: string, input: unknown) {
    const { levels } = skillLevelsSchema.parse(input);
    const doc: SkillsDoc = { id: SKILLS_DOC, userId, levels, updatedAt: this.now().toISOString() };
    await this.store.put(containers.profiles, doc);
    return { levels, updatedAt: doc.updatedAt };
  }
}
