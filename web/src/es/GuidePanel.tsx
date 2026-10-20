import { countChars } from "./count";
import type { Guide, GuideType, Lang } from "./guide";

/** Encadré « ES とは ? » : ce qu'est une ES et les 4 étapes. */
export function Intro({ guide, lang }: { guide: Guide; lang: Lang }) {
  return (
    <details className="intro" open>
      <summary>ESとは？ / What is an ES?</summary>
      <p>{guide.intro[lang]}</p>
      <ol>{guide.steps.map((s) => <li key={s.ja}>{s[lang]}</li>)}</ol>
    </details>
  );
}

/** Guide d'un type de question : but, structure, conseils, exemple. */
export function GuidePanel({ guide, type, lang }: { guide: Guide; type: GuideType; lang: Lang }) {
  return (
    <aside className="guide" aria-label="書き方ガイド / How to write">
      <h3>{type.label.ja} — {type.label[lang]}</h3>
      <p>{type.purpose[lang]}</p>
      <h4>構成 / Structure</h4>
      <ol>{type.structure.map((s) => <li key={s.ja}>{s[lang]}</li>)}</ol>
      <h4>ポイント / Tips</h4>
      <ul>{type.tips.map((t) => <li key={t.ja}>{t[lang]}</li>)}</ul>
      <details>
        <summary>例を見る / See an example（{countChars(type.example)}字）</summary>
        <p className="warning">{guide.exampleWarning[lang]}</p>
        <blockquote lang="ja">{type.example}</blockquote>
      </details>
    </aside>
  );
}
