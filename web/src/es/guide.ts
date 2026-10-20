import { useEffect, useState } from "react";

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
};
export type Guide = { intro: Text; steps: Text[]; exampleWarning: Text; types: GuideType[] };

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

/** Langue de l'aide et des explications de la relecture, retenue sur cet appareil. */
export function useHelpLanguage(): [Lang, (l: Lang) => void] {
  const [lang, setLang] = useState<Lang>(() => {
    try {
      const saved = localStorage.getItem("help-language");
      return saved === "ja" || saved === "en" || saved === "fr" ? saved : "en";
    } catch {
      return "en";
    }
  });
  const choose = (l: Lang) => {
    setLang(l);
    try {
      localStorage.setItem("help-language", l);
    } catch { /* stockage indisponible : le choix vaut pour cette page */ }
  };
  return [lang, choose];
}
