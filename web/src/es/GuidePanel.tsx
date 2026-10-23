import { countChars } from "./count";
import type { Guide, GuideType, Lang } from "./guide";

const pick = (lang: Lang, t: { ja: string; en: string; fr: string }) => t[lang];

/** Encadré « ES とは ? » : ce qu'est une ES et les 4 étapes. */
export function Intro({ guide, lang }: { guide: Guide; lang: Lang }) {
  return (
    <details className="intro" open>
      <summary>{pick(lang, { ja: "ESとは？", en: "What is an ES?", fr: "Qu'est-ce qu'une ES ?" })}</summary>
      <p>{guide.intro[lang]}</p>
      <ol>{guide.steps.map((s) => <li key={s.ja}>{s[lang]}</li>)}</ol>
    </details>
  );
}

/** Guide d'un type de question : but, structure, conseils, exemple. */
export function GuidePanel({ guide, type, lang }: { guide: Guide; type: GuideType; lang: Lang }) {
  return (
    <aside className="guide" aria-label={pick(lang, { ja: "書き方ガイド", en: "How to write", fr: "Comment l'écrire" })}>
      <h3>{lang === "ja" ? type.label.ja : `${type.label.ja} — ${type.label[lang]}`}</h3>
      <p>{type.purpose[lang]}</p>
      <h4>{pick(lang, { ja: "構成", en: "Structure", fr: "Structure" })}</h4>
      <ol>{type.structure.map((s) => <li key={s.ja}>{s[lang]}</li>)}</ol>
      <h4>{pick(lang, { ja: "ポイント", en: "Tips", fr: "Conseils" })}</h4>
      <ul>{type.tips.map((t) => <li key={t.ja}>{t[lang]}</li>)}</ul>
      <details>
        <summary>{pick(lang, { ja: `例を見る（${countChars(type.example)}字）`, en: `See an example (${countChars(type.example)} characters)`, fr: `Voir un exemple (${countChars(type.example)} caractères)` })}</summary>
        <p className="warning">{guide.exampleWarning[lang]}</p>
        <blockquote lang="ja">{type.example}</blockquote>
      </details>
    </aside>
  );
}
