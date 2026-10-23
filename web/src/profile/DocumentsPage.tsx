import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useTr } from "../i18n";

export type DocumentKind = "es" | "pdf";

/** ES : une feuille, un trait d'écriture et une plume (dessin bicolore, propre à Clean Work). */
function EsIcon() {
  return (
    <svg className="doc-icon" viewBox="0 0 28 28" aria-hidden="true">
      <rect x="4" y="3.5" width="15" height="20" rx="3" fill="var(--blue-100)" stroke="currentColor" strokeWidth="1.6" />
      <path d="M7.5 9.5h8M7.5 13h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M7.5 17.5c1.3-1.4 2.3 1.2 3.6 0s2-1.3 2.9.2" fill="none" stroke="var(--bordeaux)" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M17 21.5l1-3.6 6.4-6.4a1.7 1.7 0 0 1 2.4 2.4L20.4 20.3z" fill="var(--white)" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

/** CV en PDF : une fiche avec photo et lignes, coin plié, et l'étiquette « PDF » en bordeaux. */
function CvIcon() {
  return (
    <svg className="doc-icon" viewBox="0 0 28 28" aria-hidden="true">
      <path d="M6 3.5h10.5L22 9v14a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 23V5A1.5 1.5 0 0 1 6 3.5z" fill="var(--blue-100)" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M16.5 3.5V9H22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <rect x="7.5" y="8" width="5" height="6" rx="1.2" fill="var(--white)" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 16.5h7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <rect x="13" y="18" width="12" height="7" rx="2" fill="var(--bordeaux)" />
      <text x="19" y="23.3" textAnchor="middle" fontSize="5.2" fontWeight="700" fill="#fff" fontFamily="system-ui, sans-serif">PDF</text>
    </svg>
  );
}

/**
 * Onglet « 書類 » : deux petits boutons placés juste sous l'intercalaire « 書類 » (aligné sur son
 * centre), pour passer des ES aux CV en PDF ; puis le contenu choisi.
 */
export function DocumentsPage({ current, onChoose, children }: { current: DocumentKind; onChoose: (d: DocumentKind) => void; children: ReactNode }) {
  const tr = useTr();
  const root = useRef<HTMLDivElement>(null);
  const [align, setAlign] = useState<number | null>(null);

  // Le centre de l'intercalaire « 書類 », mesuré par rapport à la feuille (et recalculé si la fenêtre change).
  useLayoutEffect(() => {
    const measure = () => {
      const tab = document.querySelector<HTMLElement>('.tabs [data-view="documents"]');
      const box = root.current?.getBoundingClientRect();
      if (!tab || !box) return setAlign(null);
      const r = tab.getBoundingClientRect();
      setAlign(r.left + r.width / 2 - box.left);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const choices = [
    { id: "es" as const, Icon: EsIcon, title: tr({ ja: "ES", en: "ES", fr: "ES" }) },
    { id: "pdf" as const, Icon: CvIcon, title: tr({ ja: "履歴書PDF", en: "CV in PDF", fr: "CV en PDF" }) },
  ];
  return (
    <div className="documents" ref={root}>
      <div className="doc-switch" role="tablist" aria-label={tr({ ja: "書類の種類", en: "Document type", fr: "Type de document" })}
        style={align === null ? undefined : { marginLeft: align, transform: "translateX(-50%)" }}>
        {choices.map(({ id, Icon, title }) => (
          <button key={id} role="tab" aria-selected={current === id} onClick={() => onChoose(id)}>
            <Icon />
            <span>{title}</span>
          </button>
        ))}
      </div>
      {children}
    </div>
  );
}
