import { useEffect, useRef, useState } from "react";
import { LANGS, useHelpLanguage } from "./es/guide";
import { CheckIcon, GlobeIcon } from "./icons";
import { useTr } from "./i18n";

/**
 * Globe de l'en-tête : la langue des explications (guide des ES, avis de l'IA, entretiens).
 * Un seul réglage pour toute l'app, retenu sur cet appareil.
 */
export function LanguageMenu() {
  const [lang, setLang] = useHelpLanguage();
  const tr = useTr();
  const title = tr({ ja: "表示言語", en: "Language", fr: "Langue" });
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  // Fermer en cliquant ailleurs ou avec Échap.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="language-menu" ref={root}>
      <button className={`round-button${open ? " current" : ""}`} onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu" aria-expanded={open} aria-label={`${title}: ${LANGS.find((l) => l.value === lang)?.label}`}>
        <GlobeIcon size={22} />
        <span className="code">{lang.toUpperCase()}</span>
      </button>
      {open && (
        <div className="menu" role="menu" aria-label={title}>
          <p className="menu-title">{title}</p>
          {LANGS.map((l) => (
            <button key={l.value} role="menuitemradio" aria-checked={l.value === lang} onClick={() => { setLang(l.value); setOpen(false); }}>
              <span>{l.label}</span>{l.value === lang && <CheckIcon size={16} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
