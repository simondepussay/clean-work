import { useEffect, useRef, useState } from "react";
import { getSkills, saveSkills, type SkillLevels } from "../api";
import { useAuth } from "../auth/auth";
import { SearchIcon } from "../icons";
import { useTr, type T3 } from "../i18n";
import { Loader } from "../Loader";

/** Contenu de web/public/skills.json (lu aussi par l'app iOS). Un nom propre (« Python ») n'est pas traduit. */
export type SkillCatalog = {
  version: number;
  categories: { id: string; name: T3; skills: { id: string; name: string | T3 }[] }[];
};

let cached: Promise<SkillCatalog | null> | null = null;
/** Pour les tests : oublier la liste déjà chargée. */
export function resetSkillCatalogCache() { cached = null; }

/** Temps sans clic avant d'enregistrer : plusieurs compétences cochées d'affilée partent en un seul envoi. */
const SAVE_DELAY = 700;

/**
 * Le rond dessiné à la main : ○ (un trait), ◎ (un second trait à l'intérieur, et quelques éclats).
 * Les deux cercles sont toujours là ; leur trait se dessine ou s'efface (transition CSS sur
 * stroke-dashoffset), si bien que le passage d'un état à l'autre est toujours animé.
 */
function Mark({ level, burst }: { level: 0 | 1 | 2; burst: number }) {
  return (
    <svg className={`skill-mark lv${level}`} viewBox="0 0 24 24" aria-hidden="true">
      <circle className="guide" cx="12" cy="12" r="9" />
      <circle className="ring outer" cx="12" cy="12" r="9" pathLength="100" transform="rotate(-115 12 12)" />
      <circle className="ring inner" cx="12" cy="12" r="5" pathLength="100" transform="rotate(-115 12 12)" />
      {level === 2 && burst > 0 && (
        <g key={burst} className="burst">
          {[0, 60, 120, 180, 240, 300].map((a) => <path key={a} d="M12 0.6v2.4" transform={`rotate(${a} 12 12)`} />)}
        </g>
      )}
    </svg>
  );
}

/**
 * スキル辞典 : des compétences classées ; un clic = ○ (des notions), deux = ◎ (bien maîtrisée),
 * trois = plus rien. C'est une auto-évaluation : rien n'est vérifié, elle sert à se situer et à
 * préparer le CV et les entretiens.
 */
export function SkillsPanel() {
  const auth = useAuth();
  const tr = useTr();
  const [catalog, setCatalog] = useState<SkillCatalog | null | undefined>(undefined);
  const [levels, setLevels] = useState<SkillLevels | null>(null);
  const [query, setQuery] = useState("");
  const [failed, setFailed] = useState(false);
  const [bursts, setBursts] = useState<Record<string, number>>({});
  const pending = useRef<{ timer: ReturnType<typeof setTimeout>; levels: SkillLevels } | null>(null);

  useEffect(() => {
    cached ??= fetch("/skills.json").then((r) => (r.ok ? (r.json() as Promise<SkillCatalog>) : null)).catch(() => null);
    cached.then(setCatalog);
    auth.getToken()
      .then((t) => (t ? getSkills(t) : null))
      .then((r) => setLevels(r?.ok ? r.value.levels : {}))
      .catch(() => { setLevels({}); setFailed(true); });
    // Une modification encore en attente part quand on quitte l'écran.
    return () => { if (pending.current) { clearTimeout(pending.current.timer); void send(pending.current.levels); } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function send(next: SkillLevels) {
    pending.current = null;
    try {
      const t = await auth.getToken();
      const r = t ? await saveSkills(t, next) : null;
      setFailed(!r?.ok);
    } catch {
      setFailed(true);
    }
  }

  function cycle(id: string) {
    if (!levels) return;
    const next = { ...levels };
    const level = (levels[id] ?? 0) as 0 | 1 | 2;
    if (level === 0) next[id] = 1;
    else if (level === 1) { next[id] = 2; setBursts((b) => ({ ...b, [id]: (b[id] ?? 0) + 1 })); }
    else delete next[id];
    setLevels(next);
    if (pending.current) clearTimeout(pending.current.timer);
    pending.current = { levels: next, timer: setTimeout(() => void send(next), SAVE_DELAY) };
  }

  if (catalog === undefined || levels === null) return <Loader />;
  if (catalog === null) return <p role="alert" className="notice">{tr({ ja: "読み込めませんでした", en: "Could not load", fr: "Chargement impossible" })}</p>;

  const nameOf = (n: string | T3) => (typeof n === "string" ? n : tr(n));
  const q = query.trim().toLowerCase();
  const matches = (n: string | T3) => !q || (typeof n === "string" ? [n] : [n.ja, n.en, n.fr]).some((x) => x.toLowerCase().includes(q));
  const values = Object.values(levels);
  const levelLabel = (l: 0 | 1 | 2) => [
    tr({ ja: "未選択", en: "not marked", fr: "non cochée" }),
    tr({ ja: "○ 基礎がある", en: "○ some knowledge", fr: "○ des notions" }),
    tr({ ja: "◎ 得意", en: "◎ confident", fr: "◎ bien maîtrisée" }),
  ][l];
  const sections = catalog.categories
    .map((c) => ({ ...c, shown: c.skills.filter((s) => matches(s.name)) }))
    .filter((c) => c.shown.length > 0);

  return (
    <section className="skills" aria-label={tr({ ja: "スキル辞典", en: "Skills", fr: "Compétences" })}>
      <div className="skills-head">
        <p className="skills-legend">
          <span><Mark level={1} burst={0} /> {tr({ ja: "基礎がある", en: "Some knowledge", fr: "Des notions" })}</span>
          <span><Mark level={2} burst={0} /> {tr({ ja: "得意", en: "Confident", fr: "Bien maîtrisée" })}</span>
          <span className="skills-count">◎ {values.filter((v) => v === 2).length}・○ {values.filter((v) => v === 1).length}</span>
        </p>
        <label className="apps-search">
          <SearchIcon size={15} />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder={tr({ ja: "スキルを探す", en: "Find a skill", fr: "Chercher une compétence" })}
            aria-label={tr({ ja: "スキルを探す", en: "Find a skill", fr: "Chercher une compétence" })} />
        </label>
      </div>
      <p className="skills-hint">{tr({
        ja: "自己評価です。1回押すと○、2回で◎、もう1回で消えます。",
        en: "A self-assessment: tap once for ○, twice for ◎, once more to clear.",
        fr: "Une auto-évaluation : un clic pour ○, deux pour ◎, un de plus pour effacer.",
      })}</p>
      {failed && <p role="alert" className="notice">{tr({ ja: "保存できませんでした", en: "Could not save", fr: "Enregistrement impossible" })}</p>}

      {sections.length === 0 && <p className="empty">{tr({ ja: "見つかりませんでした", en: "No match", fr: "Aucun résultat" })}</p>}
      {sections.map((c) => (
        <section key={c.id} className="skill-group" aria-labelledby={`skill-cat-${c.id}`}>
          <h3 id={`skill-cat-${c.id}`}>{tr(c.name)}</h3>
          <ul>
            {c.shown.map((s) => {
              const level = (levels[s.id] ?? 0) as 0 | 1 | 2;
              return (
                <li key={s.id}>
                  <button type="button" className={`skill lv${level}`} onClick={() => cycle(s.id)}
                    aria-label={`${nameOf(s.name)}：${levelLabel(level)}`}>
                    <Mark level={level} burst={bursts[s.id] ?? 0} />
                    <span>{nameOf(s.name)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </section>
  );
}
