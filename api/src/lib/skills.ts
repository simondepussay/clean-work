/**
 * スキル辞典 : auto-évaluation sur une liste de compétences classées (la liste vit dans
 * web/public/skills.json, partagée par le site et l'iPhone). Pour chaque compétence :
 *   1 = ○ (des notions), 2 = ◎ (bien maîtrisée) ; absente = pas cochée.
 * Un seul document par utilisateur, dans le conteneur des profils (id « skills »).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
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

// ------------------------------------------------------------------ pour l'IA (relecture d'ES, entretiens)

type Catalog = { categories: { skills: { id: string; name: string | { ja: string } }[] }[] };

/**
 * Les noms japonais des compétences, lus dans la liste du site (web/public/skills.json) : copiée dans
 * content/ au déploiement, lue directement dans le dépôt pendant les tests (src/lib) et en local (dist/src/lib).
 */
let names: Map<string, string> | null = null;
export function skillNames(paths = [join(__dirname, "../../../content/skills.json"), join(__dirname, "../../../web/public/skills.json"), join(__dirname, "../../../../web/public/skills.json")]) {
  if (names) return names;
  const path = paths.find(existsSync);
  const catalog: Catalog = path ? JSON.parse(readFileSync(path, "utf8")) : { categories: [] };
  names = new Map(catalog.categories.flatMap((c) => c.skills.map((s) => [s.id, typeof s.name === "string" ? s.name : s.name.ja] as const)));
  return names;
}

/** « ◎ 得意：Swift、SwiftUI » et « ○ 基礎あり：Python » ; rien si aucune compétence n'est cochée. */
export function skillLines(levels: SkillLevels | null | undefined, known = skillNames()): string[] {
  if (!levels) return [];
  const pick = (level: 1 | 2) => Object.entries(levels).filter(([, l]) => l === level).map(([id]) => known.get(id)).filter((n): n is string => !!n);
  const strong = pick(2);
  const basic = pick(1);
  return [
    ...(strong.length ? [`スキル ◎得意（自己評価）：${strong.slice(0, 40).join("、")}`] : []),
    ...(basic.length ? [`スキル ○基礎あり（自己評価）：${basic.slice(0, 40).join("、")}`] : []),
  ];
}
