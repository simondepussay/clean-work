/**
 * Langue de l'interface : japonais, anglais ou français, choisie avec le globe de l'en-tête.
 *
 * Chaque texte est écrit dans les trois langues à l'endroit où il est utilisé (`{ ja, en, fr }`) :
 * on voit la traduction à côté du code, et un texte oublié ne compile pas (les trois sont exigées).
 * Seul le menu en intercalaires reste en japonais + anglais : c'est la « signature » de l'app.
 */
import { useHelpLanguage, type Lang } from "./es/guide";

export type { Lang };
/** Un texte dans les trois langues. */
export type T3 = { ja: string; en: string; fr: string };

/** Le texte dans la langue choisie : `const tr = useTr(); tr({ ja: "…", en: "…", fr: "…" })`. */
export function useTr() {
  const [lang] = useHelpLanguage();
  const tr = (text: T3) => text[lang];
  return Object.assign(tr, { lang });
}
export type Tr = ReturnType<typeof useTr>;

/** Français des messages de l'API (qui les envoie en « japonais / anglais »), indexés par l'anglais. */
const API_FR: Record<string, string> = {
  "Required": "Obligatoire",
  "Use the format YYYY-MM-DD": "Format attendu : AAAA-MM-JJ",
  "Use the format YYYY-MM": "Format attendu : AAAA-MM",
  "Use hiragana or katakana": "En hiragana ou katakana",
  "Invalid email address": "Adresse e-mail invalide",
  "Invalid URL": "URL invalide",
  "Please choose": "Choisissez une option",
  "Enter a number from 1 to 5000": "Un nombre de 1 à 5000",
  "Use the format HH:MM": "Format attendu : HH:MM",
  "Write your answer first": "Écrivez d'abord votre réponse",
  "Write or say your answer": "Écrivez ou dites votre réponse",
  "Check the month (it wasn't in the CV)": "Vérifiez le mois (il n'était pas dans le CV)",
  "Enter the date (it wasn't in the CV)": "Indiquez la date (elle n'était pas dans le CV)",
};

/** Un message de l'API (« 入力してください / Required ») dans la langue choisie. */
export function apiMessage(message: string, lang: Lang): string {
  const [ja, en] = message.split(" / ");
  if (en === undefined) return message;
  if (lang === "ja") return ja;
  if (lang === "en") return en;
  const max = /^(\d+) characters max$/.exec(en);
  if (max) return `${max[1]} caractères au maximum`;
  return API_FR[en] ?? en;
}

/** Date courte selon la langue : « 10月29日（木） », « Thu, Oct 29 », « jeu. 29 oct. ». */
export function formatDay(iso: string, lang: Lang, withWeekday = true) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const date = new Date(y, m - 1, d);
  if (lang === "ja") return `${m}月${d}日${withWeekday ? `（${"日月火水木金土"[date.getDay()]}）` : ""}`;
  return date.toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US", { ...(withWeekday ? { weekday: "short" } : {}), month: "short", day: "numeric" });
}
