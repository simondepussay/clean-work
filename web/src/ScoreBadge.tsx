import { useEffect, useRef, useState } from "react";
import { getScore, onScoreMaybeChanged, type Score } from "./api";
import { useTr, type T3 } from "./i18n";

/** Les niveaux doux, du 種 au 実 (mêmes seuils que l'API, lib/score.ts). */
export const LEVEL_NAMES: { kanji: string; name: T3 }[] = [
  { kanji: "種", name: { ja: "たね", en: "Seed", fr: "Graine" } },
  { kanji: "芽", name: { ja: "め", en: "Sprout", fr: "Pousse" } },
  { kanji: "若葉", name: { ja: "わかば", en: "Young leaf", fr: "Jeune feuille" } },
  { kanji: "蕾", name: { ja: "つぼみ", en: "Bud", fr: "Bouton" } },
  { kanji: "花", name: { ja: "はな", en: "Bloom", fr: "Fleur" } },
  { kanji: "実", name: { ja: "み", en: "Fruit", fr: "Fruit" } },
];

const WAYS: T3[] = [
  { ja: "プロフィールを書く・スキルに ○ ◎ をつける", en: "Fill in your profile, mark skills ○ or ◎", fr: "Remplir son profil, noter ses compétences ○ ou ◎" },
  { ja: "応募を追加して、選考を進める", en: "Add applications and move them forward", fr: "Ajouter des candidatures et les faire avancer" },
  { ja: "ESのレビュー、面接練習、企業研究", en: "ES review, interview practice, company research", fr: "Relecture d'ES, entretien simulé, recherche d'entreprise" },
  { ja: "予定や目標をカレンダーに", en: "Plan events and goals in the calendar", fr: "Noter événements et objectifs au calendrier" },
  { ja: "こころの天気と日記", en: "Kokoro weather and journal", fr: "Météo intérieure et journal" },
];

/**
 * La pastille de score, à droite du bouton du compte : le niveau (kanji) et les points.
 * Elle se met à jour après chaque geste (api.ts prévient), et montre « +10 » quand les points montent.
 * Un clic ouvre une petite carte : le niveau, la progression vers le suivant, comment gagner des points.
 */
export function ScoreBadge({ getToken }: { getToken: () => Promise<string | null> }) {
  const tr = useTr();
  const [score, setScore] = useState<Score | null>(null);
  const [gain, setGain] = useState<{ n: number; key: number } | null>(null);
  const [open, setOpen] = useState(false);
  const last = useRef<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  // La fonction peut changer à chaque rendu : on garde la dernière, sans relancer le chargement.
  const tokenRef = useRef(getToken);
  tokenRef.current = getToken;

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      const token = await tokenRef.current();
      const next = token ? await getScore(token) : null;
      if (!alive || !next) return;
      if (last.current !== null && next.points !== last.current) setGain({ n: next.points - last.current, key: Date.now() });
      last.current = next.points;
      setScore(next);
    };
    load();
    // Plusieurs gestes d'affilée (un formulaire qui enregistre trois choses) : une seule requête.
    const off = onScoreMaybeChanged(() => { clearTimeout(timer); timer = setTimeout(load, 400); });
    return () => { alive = false; off(); clearTimeout(timer); };
  }, []);

  useEffect(() => {
    if (!gain) return;
    const t = setTimeout(() => setGain(null), 1800);
    return () => clearTimeout(t);
  }, [gain]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [open]);

  if (!score) return null;
  const level = LEVEL_NAMES[Math.min(score.level, LEVEL_NAMES.length - 1)];
  const progress = score.next === null ? 1 : (score.points - score.floor) / (score.next - score.floor);
  const r = 15, c = 2 * Math.PI * r;
  const label = tr({ ja: `スコア ${score.points} ポイント、${level.kanji}`, en: `Score: ${score.points} points, ${tr(level.name)}`, fr: `Score : ${score.points} points, ${tr(level.name)}` });

  return (
    <div className="score" ref={box}>
      <button className={`score-pill${open ? " current" : ""}`} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={label} title={label}>
        <span className="score-ring" aria-hidden="true">
          <svg viewBox="0 0 36 36"><circle cx="18" cy="18" r={r} className="track" /><circle cx="18" cy="18" r={r} className="fill" strokeDasharray={c} strokeDashoffset={c * (1 - progress)} /></svg>
          <span className={`score-kanji${level.kanji.length > 1 ? " two" : ""}`}>{level.kanji}</span>
        </span>
        <span className="score-points">{score.points}<small>pt</small></span>
      </button>
      {gain && <span key={gain.key} className={`score-gain${gain.n < 0 ? " down" : ""}`} aria-live="polite">{gain.n > 0 ? `+${gain.n}` : `−${-gain.n}`}</span>}
      {open && (
        <div className="score-card" role="dialog" aria-label={tr({ ja: "スコア", en: "Score", fr: "Score" })}>
          <div className="score-card-head">
            <span className="score-card-kanji">{level.kanji}</span>
            <div><strong>{tr(level.name)}</strong><span className="muted">{score.points} pt</span></div>
          </div>
          <div className="score-bar"><span style={{ width: `${Math.round(progress * 100)}%` }} /></div>
          <p className="muted score-next">
            {score.next === null
              ? tr({ ja: "いちばん上の段階です。ここまで、おつかれさま。", en: "The last stage. Well done for coming this far.", fr: "Le dernier palier. Bravo pour tout ce chemin." })
              : tr({ ja: `次の「${LEVEL_NAMES[score.level + 1].kanji}」まで、あと ${score.next - score.points} pt`, en: `${score.next - score.points} pt to ${tr(LEVEL_NAMES[score.level + 1].name)}`, fr: `Encore ${score.next - score.points} pt avant ${tr(LEVEL_NAMES[score.level + 1].name)}` })}
          </p>
          <p className="score-ways-title">{tr({ ja: "ポイントがたまること", en: "How to earn points", fr: "Comment gagner des points" })}</p>
          <ul className="score-ways">{WAYS.map((w, i) => <li key={i}>{tr(w)}</li>)}</ul>
          <p className="muted score-note">{tr({ ja: "ポイントは減りません（スキルを外したときだけ、その分が戻ります）。自分のペースで大丈夫です。", en: "Points don't go down (except when you remove a skill: its points go back). Go at your own pace.", fr: "Les points ne baissent pas (sauf si vous retirez une compétence : ses points sont repris). À votre rythme." })}</p>
        </div>
      )}
    </div>
  );
}
