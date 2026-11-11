import { countChars } from "./count";
import type { Guide, Text } from "./guide";

/**
 * Checklist instantanée d'une ES (conseils du cours 就職対策) : des règles simples, écrites dans
 * es-guide.json pour que le web et l'app iOS montrent les mêmes. Pas d'IA : elle repère des mots
 * et des formes, sans comprendre le sens, d'où des messages qui laissent la nuance (« sauf si… »).
 */
export type Check = {
  id: string;
  /** Types d'ES concernés (jikopr, strengths…). */
  kinds: string[];
  /** bad = à corriger, warn = à vérifier, good = bonne pratique trouvée. */
  level: "bad" | "warn" | "good";
  /** Expression régulière cherchée dans le texte. */
  pattern?: string;
  /** Si elle est aussi présente, la règle ne s'applique pas (ex. : 短所 + 改善). */
  unless?: string;
  /** Première phrase plus longue que ce nombre de caractères. */
  firstSentenceOver?: number;
  /** Plus de mots-clés de qualités (guide.keywords) que ce nombre. */
  maxKeywords?: number;
  /** {n} est remplacé par la longueur ou le nombre trouvé. */
  message: Text;
  /** Pour une bonne pratique absente : le conseil à afficher. */
  missingTip?: Text;
};

export type CheckResult = { id: string; state: "bad" | "warn" | "good" | "tip"; text: Text };

/** Première phrase, sans le 【titre】 éventuel : jusqu'au premier 。！？ ou retour à la ligne. */
export function firstSentence(body: string): string {
  const rest = body.trimStart().replace(/^【[^】]*】\s*/, "");
  return rest.split(/[。！？!?\n]/)[0].trim();
}

/** Mots-clés de qualités présents dans le texte, sans doublon. */
export function keywordsIn(body: string, keywords: Text[]): string[] {
  return keywords.map((k) => k.ja).filter((k) => body.includes(k));
}

const fill = (text: Text, n: number): Text =>
  ({ ja: text.ja.replace("{n}", String(n)), en: text.en.replace("{n}", String(n)), fr: text.fr.replace("{n}", String(n)) });

export function runChecks(guide: Guide, kind: string | undefined, body: string): CheckResult[] {
  if (!body.trim()) return [];
  const results: CheckResult[] = [];
  for (const check of guide.checks ?? []) {
    if (!check.kinds.includes(kind ?? "free")) continue;
    let hit = false;
    let n = 0;
    if (check.pattern !== undefined) {
      hit = new RegExp(check.pattern, "u").test(body) && !(check.unless && new RegExp(check.unless, "u").test(body));
    } else if (check.firstSentenceOver !== undefined) {
      n = countChars(firstSentence(body));
      hit = n > check.firstSentenceOver;
    } else if (check.maxKeywords !== undefined) {
      n = keywordsIn(body, guide.keywords ?? []).length;
      hit = n > check.maxKeywords;
    }
    if (hit) results.push({ id: check.id, state: check.level, text: fill(check.message, n) });
    else if (check.level === "good" && check.missingTip) results.push({ id: check.id, state: "tip", text: check.missingTip });
  }
  // À corriger d'abord, puis à vérifier, les conseils, et ce qui va bien.
  const order = { bad: 0, warn: 1, tip: 2, good: 3 };
  return results.sort((a, b) => order[a.state] - order[b.state]);
}

/** Début de texte 3部構成 (キーワード → エピソード → 自分の想い) avec les mots-clés choisis. */
export function starterText(starter: { one: string; two: string }, picked: string[]): string {
  const [k1 = "〇〇", k2] = picked;
  return k2 ? starter.two.replace("{k1}", k1).replace("{k2}", k2) : starter.one.replace("{k1}", k1);
}
