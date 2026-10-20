/**
 * Différences entre deux versions d'une ES (S15).
 *
 * On cherche la plus longue suite commune (LCS, 最長共通部分列) par programmation
 * dynamique : dp[i][j] = longueur de la LCS des i premiers éléments de `a` et des j
 * premiers de `b`. Ce qui n'est pas dans la LCS a été supprimé (seulement dans `a`)
 * ou ajouté (seulement dans `b`).
 *
 * Caractère par caractère tant que le tableau reste petit ; au-delà, phrase par phrase.
 */
export type Part = { type: "same" | "add" | "del"; text: string };

const MAX_CELLS = 4_000_000; // 2 000 × 2 000 caractères

export function diff(before: string, after: string): Part[] {
  const byChar = before.length * after.length <= MAX_CELLS;
  const a = byChar ? [...before] : sentences(before);
  const b = byChar ? [...after] : sentences(after);

  const dp: Uint32Array[] = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const parts: Part[] = [];
  const push = (type: Part["type"], text: string) => {
    const last = parts[parts.length - 1];
    if (last?.type === type) last.text += text;
    else parts.push({ type, text });
  };
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push("same", a[i]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      push("del", a[i++]);
    } else {
      push("add", b[j++]);
    }
  }
  while (i < a.length) push("del", a[i++]);
  while (j < b.length) push("add", b[j++]);
  return parts;
}

/** Découpe en phrases en gardant la ponctuation finale (。！？ et retours à la ligne). */
function sentences(text: string): string[] {
  return text.match(/[^。！？!?\n]*[。！？!?\n]|[^。！？!?\n]+$/g) ?? [];
}

/** Nombre de caractères ajoutés et supprimés, pour un résumé « +12 / −5 ». */
export function stats(parts: Part[]) {
  let added = 0;
  let removed = 0;
  for (const p of parts) {
    if (p.type === "add") added += [...p.text].length;
    if (p.type === "del") removed += [...p.text].length;
  }
  return { added, removed };
}
