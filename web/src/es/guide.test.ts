import { describe, expect, it } from "vitest";
import guide from "../../public/es-guide.json";
import { countChars } from "./count";

// Les exemples montrent la bonne pratique : ils doivent passer les règles de la relecture IA.
describe("es-guide.json", () => {
  it.each(guide.types.map((t) => [t.id, t] as const))("l'exemple « %s » remplit 80 à 100 % de sa limite", (_id, type) => {
    const n = countChars(type.example);
    expect(n).toBeLessThanOrEqual(type.charLimit);
    expect(n).toBeGreaterThanOrEqual(0.8 * type.charLimit);
  });

  it.each(guide.types.map((t) => [t.id, t.example] as const))("l'exemple « %s » respecte les règles d'écriture", (_id, example) => {
    expect(example).not.toContain("御社");
    expect(example).not.toMatch(/なので|すごく|けど|見れる|来れる|おっしゃられ/);
    expect(example).not.toMatch(/[^でし]だ。|である。/); // style です・ます uniquement
  });

  it("chaque texte d'aide existe en japonais, anglais et français", () => {
    const texts = [guide.intro, guide.exampleWarning, ...guide.steps, ...guide.types.flatMap((t) => [t.label, t.purpose, ...t.structure, ...t.tips]),
      ...guide.differences.flatMap((d) => [d.question, d.answer]), ...guide.keywords,
      ...guide.checks.flatMap((c) => [c.message, ...("missingTip" in c && c.missingTip ? [c.missingTip] : [])])];
    for (const text of texts) {
      expect(Object.keys(text).sort()).toEqual(["en", "fr", "ja"]);
      expect(Object.values(text).every((v) => v.trim().length > 0)).toBe(true);
    }
  });

  it("les règles de la checklist sont valides", () => {
    const kinds = new Set([...guide.types.map((t) => t.id), "free"]);
    for (const c of guide.checks) {
      expect(c.kinds.every((k) => kinds.has(k))).toBe(true);
      for (const re of ["pattern" in c ? c.pattern : undefined, "unless" in c ? c.unless : undefined]) if (re) expect(() => new RegExp(re, "u")).not.toThrow();
    }
    expect(new Set(guide.checks.map((c) => c.id)).size).toBe(guide.checks.length);
  });
});
