/**
 * Trouve un passage dans le texte : tel quel, sinon en ignorant les espaces et retours à la ligne
 * (l'IA en recopie parfois un de plus ou de moins). Renvoie [début, fin[ ou null.
 */
function locate(body: string, passage: string): [number, number] | null {
  const exact = passage === "" ? -1 : body.indexOf(passage);
  if (exact >= 0) return [exact, exact + passage.length];
  const chars = [...passage].filter((c) => !/\s/.test(c));
  if (chars.length === 0) return null;
  const match = new RegExp(chars.map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s*"), "u").exec(body);
  return match ? [match.index, match.index + match[0].length] : null;
}

const has = (body: string, passage: string) => passage.trim() !== "" && locate(body, passage) !== null;
const same = (a: string, b: string) => a.replace(/\s/g, "") === b.replace(/\s/g, "");

type Issue = { quote: string; suggestion: string };

/**
 * Où en est une remarque de l'IA par rapport au texte actuel :
 * - « applied » : sa correction est déjà dans le texte ;
 * - « open » : le passage à corriger est encore là ;
 * - « alternative » : une autre remarque sur la même phrase a été appliquée (`current`) ;
 *   on peut remplacer sa correction par celle-ci ;
 * - « gone » : ni l'un ni l'autre (le texte a changé depuis la relecture).
 */
export type IssueState = { state: "applied" | "open" | "gone" } | { state: "alternative"; current: string };

export function issueState(body: string, issue: Issue, all: Issue[] = []): IssueState {
  if (has(body, issue.suggestion)) return { state: "applied" };
  if (has(body, issue.quote)) return { state: "open" };
  const other = all.find((o) => o !== issue && same(o.quote, issue.quote) && has(body, o.suggestion));
  return other ? { state: "alternative", current: other.suggestion } : { state: "gone" };
}

/** Remplace `from` par `to` dans le texte (première occurrence) ; null si `from` n'y est plus. */
export function applyIssue(body: string, from: string, to: string): string | null {
  const range = locate(body, from);
  return range ? body.slice(0, range[0]) + to + body.slice(range[1]) : null;
}
