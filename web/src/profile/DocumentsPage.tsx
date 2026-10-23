import type { ReactNode } from "react";
import { useTr } from "../i18n";
import { DocIcon, PenIcon } from "../icons";

export type DocumentKind = "es" | "pdf";

/**
 * Onglet « 書類 » : tout ce qu'on envoie aux entreprises, au même endroit. Deux boutons
 * centrés sous le titre : les ES (avec le guide et la relecture par IA) ou les CV en PDF.
 */
export function DocumentsPage({ current, onChoose, children }: { current: DocumentKind; onChoose: (d: DocumentKind) => void; children: ReactNode }) {
  const tr = useTr();
  const choices = [
    { id: "es" as const, Icon: PenIcon, title: tr({ ja: "ES", en: "Entry sheets", fr: "ES" }),
      text: tr({ ja: "書き方ガイドとAI添削", en: "Writing guide and AI review", fr: "Guide et relecture par IA" }) },
    { id: "pdf" as const, Icon: DocIcon, title: tr({ ja: "履歴書・職務経歴書", en: "Résumé PDFs", fr: "CV en PDF" }),
      text: tr({ ja: "厚生労働省の様式でPDFを作成", en: "Created in the official Japanese format", fr: "Au format officiel japonais" }) },
  ];
  return (
    <div className="documents">
      <header className="documents-head">
        <h2>{tr({ ja: "書類", en: "Documents", fr: "Documents" })}</h2>
        <div className="doc-switch" role="tablist" aria-label={tr({ ja: "書類の種類", en: "Document type", fr: "Type de document" })}>
          {choices.map(({ id, Icon, title, text }) => (
            <button key={id} role="tab" aria-selected={current === id} onClick={() => onChoose(id)}>
              <Icon size={28} />
              <strong>{title}</strong>
              <small>{text}</small>
            </button>
          ))}
        </div>
      </header>
      {children}
    </div>
  );
}
