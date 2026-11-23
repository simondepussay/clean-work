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
 * Proposition à trous (« ○○ », « （数値を記入） », « （例：…） ») ou consigne (« 〜を明記します ») :
 * pas une phrase prête à coller. Le serveur les remplace déjà par le passage lui-même ; ce test sert
 * aux relectures enregistrées avant ce changement.
 */
const PLACEHOLDER = /[○〇◯□＿_]{2}|[ＸX]{2}|記入|[（(]例[:：）)]|書き加え|書き足し|明記し|入れてください|書いてください|加えてください|追加してください|具体的に書/;

/** Conseil seul : rien à appliquer, seule l'explication compte. */
const isAdvice = (issue: Issue) => same(issue.suggestion, issue.quote) || PLACEHOLDER.test(issue.suggestion);

/**
 * Où en est une remarque de l'IA par rapport au texte actuel :
 * - « applied » : sa correction est déjà dans le texte ;
 * - « open » : le passage à corriger est encore là ;
 * - « alternative » : une autre remarque sur la même phrase a été appliquée (`current`) ;
 *   on peut remplacer sa correction par celle-ci ;
 * - « gone » : ni l'un ni l'autre (le texte a changé depuis la relecture) ;
 * - « advice » : conseil seul, sans texte à appliquer (vérifié en premier : une proposition
 *   identique au passage serait sinon toujours « déjà appliquée »).
 */
export type IssueState = { state: "applied" | "open" | "gone" | "advice" } | { state: "alternative"; current: string };

export function issueState(body: string, issue: Issue, all: Issue[] = []): IssueState {
  if (isAdvice(issue)) return { state: "advice" };
  if (has(body, issue.suggestion)) return { state: "applied" };
  if (has(body, issue.quote)) return { state: "open" };
  const other = all.find((o) => o !== issue && !isAdvice(o) && same(o.quote, issue.quote) && has(body, o.suggestion));
  return other ? { state: "alternative", current: other.suggestion } : { state: "gone" };
}

/** Remplace `from` par `to` dans le texte (première occurrence) ; null si `from` n'y est plus. */
export function applyIssue(body: string, from: string, to: string): string | null {
  const range = locate(body, from);
  return range ? body.slice(0, range[0]) + to + body.slice(range[1]) : null;
}
