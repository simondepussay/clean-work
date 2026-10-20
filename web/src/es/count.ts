const segmenter = new Intl.Segmenter("ja", { granularity: "grapheme" });

/**
 * Nombre de caractères d'une ES, comme le comptent les entreprises : tous les caractères
 * visibles (ponctuation et espaces compris), sans les retours à la ligne. Un caractère
 * composé (emoji, lettre + accent combinant) compte pour un.
 */
export function countChars(text: string): number {
  let n = 0;
  for (const { segment } of segmenter.segment(text)) if (segment !== "\n" && segment !== "\r\n" && segment !== "\r") n++;
  return n;
}
