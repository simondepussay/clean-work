import { useEffect, useState } from "react";
import type { Check } from "./checks";

/** Contenu de web/public/es-guide.json (lu aussi par l'app iOS). */
export type Lang = "ja" | "en" | "fr";
export type Text = Record<Lang, string>;
export type GuideType = {
  id: string;
  label: Text;
  question: string;
  charLimit: number;
  purpose: Text;
  structure: Text[];
  tips: Text[];
  example: string;
  /** Début de texte 3部構成 ; {k1} et {k2} = mots-clés choisis. */
  starter?: { one: string; two: string };
};
export type Guide = {
  intro: Text;
  steps: Text[];
  exampleWarning: Text;
  types: GuideType[];
  /** 自己紹介 / 自己PR / 長所と短所 : trois questions différentes. */
  differences?: { question: Text; answer: Text }[];
  /** Mots-clés de qualités, pour choisir 1 ou 2 points forts. */
  keywords?: Text[];
  /** Règles de la checklist instantanée (voir checks.ts). */
  checks?: Check[];
};

export const LANGS: { value: Lang; label: string }[] = [
  { value: "ja", label: "日本語" },
  { value: "en", label: "English" },
  { value: "fr", label: "Français" },
];

let cached: Promise<Guide | null> | null = null;

export function useGuide() {
  const [guide, setGuide] = useState<Guide | null>(null);
  useEffect(() => {
    cached ??= fetch("/es-guide.json").then((r) => (r.ok ? (r.json() as Promise<Guide>) : null)).catch(() => null);
    cached.then(setGuide);
  }, []);
  return guide;
}

/** Pour les tests : oublier le guide déjà chargé. */
export function resetGuideCache() {
  cached = null;
}

const STORAGE_KEY = "help-language";
const CHANGE_EVENT = "help-language-change";

/** Le choix de cette visite, gardé en mémoire aussi : il vaut même si le stockage du navigateur est bloqué. */
let current: Lang | null = null;

function savedLanguage(): Lang {
  if (current) return current;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "ja" || saved === "en" || saved === "fr") return saved;
  } catch { /* stockage indisponible */ }
  return firstVisitLanguage();
}

/** Première visite : la langue du navigateur si c'est ja, en ou fr ; sinon l'anglais. */
function firstVisitLanguage(): Lang {
  const prefs = typeof navigator === "undefined" ? [] : navigator.languages ?? [navigator.language];
  for (const p of prefs) {
    const code = (p ?? "").slice(0, 2).toLowerCase();
    if (code === "ja" || code === "en" || code === "fr") return code;
  }
  return "en";
}

/**
 * Change la langue des explications pour toute l'app (globe en haut à droite) : retenue sur
 * cet appareil, et annoncée aux écrans ouverts (ES, entretiens) pour qu'ils suivent tout de suite.
 */
export function setHelpLanguage(l: Lang) {
  current = l;
  try {
    localStorage.setItem(STORAGE_KEY, l);
  } catch { /* stockage indisponible : le choix vaut pour cette page */ }
  window.dispatchEvent(new CustomEvent<Lang>(CHANGE_EVENT, { detail: l }));
}

/** Langue de l'aide, des explications de la relecture et de l'entraînement aux entretiens. */
export function useHelpLanguage(): [Lang, (l: Lang) => void] {
  const [lang, setLang] = useState<Lang>(savedLanguage);
  useEffect(() => {
    const onChange = (e: Event) => setLang((e as CustomEvent<Lang>).detail);
    window.addEventListener(CHANGE_EVENT, onChange);
    return () => window.removeEventListener(CHANGE_EVENT, onChange);
  }, []);
  return [lang, setHelpLanguage];
}
