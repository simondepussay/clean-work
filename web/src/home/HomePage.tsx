import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createPlan, deletePlan, listApplications, listPlans, updatePlan, type Application, type Issue, type Plan, type PlanKind } from "../api";
import { useAuth } from "../auth/auth";
import { CalendarIcon, CheckIcon, ChevronLeftIcon, ChevronRightIcon, CloseIcon, FlagIcon, PenIcon, PlusIcon, TrashIcon } from "../icons";
import { buildAgenda, monthGrid, ymd, type AgendaItem, type AgendaKind } from "./agenda";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
const KIND_LABEL: Record<AgendaKind, string> = {
  interview: "面接 / Interview",
  step: "選考・締切 / Deadline",
  event: "予定 / Event",
  goal: "目標 / Goal",
  note: "メモ / Note",
};
const KIND_ICON: Partial<Record<AgendaKind, typeof FlagIcon>> = { goal: FlagIcon, note: PenIcon, event: CalendarIcon };
/** Au plus 3 éléments par case ; les suivants deviennent « +N ». */
const PER_CELL = 3;

const longDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return `${m}月${d}日（${WEEKDAYS[date.getDay()]}）`;
};

function Chip({ item }: { item: AgendaItem }) {
  return (
    <span className={`chip ${item.kind}${item.done ? " done" : ""}`} title={`${KIND_LABEL[item.kind]} · ${item.title}${item.detail ? ` ${item.detail}` : ""}`}>
      {item.kind === "goal" && <FlagIcon size={12} />}
      {item.kind === "note" && <PenIcon size={12} />}
      {item.time && <b>{item.time}</b>}
      {item.title}{item.detail ? ` ${item.detail}` : ""}
    </span>
  );
}

/**
 * Accueil : d'abord le calendrier (entretiens et étapes des candidatures, événements,
 * objectifs et notes de l'utilisateur), en grand. Survoler une case montre ce qui y est
 * prévu ; cliquer ouvre une note rapide. Dessous, le détail du jour choisi.
 */
export function HomePage({ name, onOpenApps }: { name: string | null; onOpenApps: () => void }) {
  const auth = useAuth();
  const today = ymd(new Date());
  const [apps, setApps] = useState<Application[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [month, setMonth] = useState(() => ({ y: new Date().getFullYear(), m: new Date().getMonth() }));
  const [selected, setSelected] = useState(today);
  const [form, setForm] = useState<{ kind: PlanKind; title: string; time: string }>({ kind: "event", title: "", time: "" });
  const [issues, setIssues] = useState<Issue[]>([]);
  /** Note rapide : la petite fenêtre qui s'ouvre sur la case cliquée. */
  const [quick, setQuick] = useState<{ date: string; left: number; top: number } | null>(null);
  const [quickText, setQuickText] = useState("");
  const monthRef = useRef<HTMLDivElement>(null);

  const withToken = async <T,>(fn: (t: string) => Promise<T>) => {
    const t = await auth.getToken();
    if (!t) throw new Error("non connecté");
    return fn(t);
  };

  useEffect(() => {
    withToken(async (t) => {
      const [a, p] = await Promise.all([listApplications(t), listPlans(t)]);
      if (a.ok && Array.isArray(a.value)) setApps(a.value);
      if (p.ok && Array.isArray(p.value)) setPlans(p.value);
    }).catch(() => {}).finally(() => setLoaded(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const agenda = useMemo(() => buildAgenda(apps, plans), [apps, plans]);
  const byDate = useMemo(() => {
    const map = new Map<string, AgendaItem[]>();
    for (const item of agenda) map.set(item.date, [...(map.get(item.date) ?? []), item]);
    return map;
  }, [agenda]);
  const weeks = monthGrid(month.y, month.m);
  const dayItems = byDate.get(selected) ?? [];
  const goals = plans.filter((p) => p.kind === "goal" && !p.done && p.date >= today).slice(0, 4);
  const nextInterview = agenda.find((i) => i.kind === "interview" && !i.done && i.date >= today);

  const shift = (delta: number) => setMonth(({ y, m }) => {
    const d = new Date(y, m + delta, 1);
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const goToday = () => {
    setMonth({ y: new Date().getFullYear(), m: new Date().getMonth() });
    setSelected(today);
  };

  async function add(e: FormEvent) {
    e.preventDefault();
    const result = await withToken((t) => createPlan(t, {
      kind: form.kind, title: form.title, date: selected, ...(form.kind === "event" && form.time ? { time: form.time } : {}),
    })).catch(() => null);
    if (!result) return;
    if (!result.ok) { setIssues(result.issues); return; }
    setIssues([]);
    setPlans((p) => [...p, result.value]);
    setForm((f) => ({ ...f, title: "", time: "" }));
  }

  /** Clic sur une case : on la choisit et on ouvre la note rapide juste dessous. */
  function pick(date: string, cell: HTMLElement) {
    setSelected(date);
    const box = monthRef.current?.getBoundingClientRect();
    const r = cell.getBoundingClientRect();
    if (!box) return;
    // La fenêtre (260 px) ne doit pas sortir du calendrier à droite.
    const left = Math.min(r.left - box.left, Math.max(0, box.width - 260));
    setQuick({ date, left, top: r.bottom - box.top + 4 });
    setQuickText("");
  }

  const quickForm = useRef<HTMLFormElement>(null);
  /** Valeurs à jour pour les écouteurs du document (qui gardent sinon celles du premier rendu). */
  const latest = useRef({ quick, quickText });
  latest.current = { quick, quickText };

  /** Enregistre la note (si quelque chose est écrit) et ferme la fenêtre. */
  async function saveQuick() {
    const { quick: target, quickText: text } = latest.current;
    setQuick(null);
    if (!target || !text.trim()) return;
    const result = await withToken((t) => createPlan(t, { kind: "note", title: text.trim(), date: target.date })).catch(() => null);
    if (result?.ok) setPlans((p) => [...p, result.value]);
  }

  function addNote(e: FormEvent) {
    e.preventDefault();
    saveQuick();
  }

  // Échap ferme sans enregistrer ; un clic en dehors enregistre ce qui est écrit, puis ferme.
  useEffect(() => {
    if (!quick) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setQuick(null); };
    const onDown = (e: MouseEvent) => { if (!quickForm.current?.contains(e.target as Node)) saveQuick(); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quick]);

  async function toggle(plan: Plan) {
    const result = await withToken((t) => updatePlan(t, plan.id, { done: !plan.done })).catch(() => null);
    if (result?.ok) setPlans((p) => p.map((x) => (x.id === plan.id ? result.value : x)));
  }

  async function remove(plan: Plan) {
    await withToken((t) => deletePlan(t, plan.id)).catch(() => null);
    setPlans((p) => p.filter((x) => x.id !== plan.id));
  }

  const titleError = issues.find((i) => i.path === "title")?.message;

  return (
    <div className="home">
      <header className="home-head">
        <div>
          <p className="eyebrow">Clean Work</p>
          <h1>{name ? `${name}さん、` : ""}おかえりなさい</h1>
        </div>
        <div className="highlights">
          {nextInterview && (
            <p className="highlight interview"><span>次の面接 / Next interview</span>{longDate(nextInterview.date)} {nextInterview.title}</p>
          )}
          {goals[0] && (
            <p className="highlight goal"><span>目標 / Goal</span><span><FlagIcon size={14} /> {goals[0].title}（{longDate(goals[0].date)}まで）</span></p>
          )}
        </div>
      </header>

      <section className="calendar card" aria-label="カレンダー / Calendar">
        <div className="calendar-bar">
          <h2><CalendarIcon size={22} /> {month.y}年{month.m + 1}月</h2>
          <div className="actions">
            <button className="icon-button" onClick={() => shift(-1)} aria-label="前の月 / Previous month"><ChevronLeftIcon /></button>
            <button onClick={goToday}>今日 / Today</button>
            <button className="icon-button" onClick={() => shift(1)} aria-label="次の月 / Next month"><ChevronRightIcon /></button>
          </div>
          <ul className="legend">
            {(["interview", "step", "event", "goal", "note"] as AgendaKind[]).map((k) => <li key={k}><span className={`dot ${k}`} />{KIND_LABEL[k]}</li>)}
          </ul>
        </div>
        <div className="month" role="grid" aria-label={`${month.y}年${month.m + 1}月`} ref={monthRef}>
          {WEEKDAYS.map((w, i) => <div key={w} className={`weekday${i === 0 ? " sun" : i === 6 ? " sat" : ""}`} role="columnheader">{w}</div>)}
          {weeks.flat().map((date) => {
            const key = ymd(date);
            const items = byDate.get(key) ?? [];
            const classes = ["day", date.getMonth() !== month.m && "other", key === today && "today", key === selected && "selected",
              date.getDay() === 0 && "sun", date.getDay() === 6 && "sat"].filter(Boolean).join(" ");
            return (
              <button key={key} className={classes} role="gridcell" aria-selected={key === selected}
                aria-label={`${longDate(key)}${items.length ? ` · ${items.length}件` : ""}`} onClick={(e) => pick(key, e.currentTarget)}>
                <span className="num">{date.getDate()}</span>
                <span className="chips">
                  {items.slice(0, PER_CELL).map((item) => <Chip key={item.key} item={item} />)}
                  {items.length > PER_CELL && <span className="more">+{items.length - PER_CELL}</span>}
                </span>
                <span className="dots" aria-hidden="true">{items.slice(0, 4).map((item) => <span key={item.key} className={`dot ${item.kind}`} />)}</span>
                {items.length > 0 && (
                  // Au survol : tout ce qui est prévu ce jour-là (même ce qui ne tient pas dans la case).
                  <span className={`peek${date.getDay() >= 5 ? " left" : ""}`} role="tooltip">
                    <strong>{longDate(key)}</strong>
                    {items.map((item) => {
                      const Icon = KIND_ICON[item.kind];
                      return (
                        <span key={item.key} className={`peek-item${item.done ? " done" : ""}`}>
                          <span className={`dot ${item.kind}`} />
                          {Icon && <Icon size={13} />}
                          {item.time && <b>{item.time}</b>}
                          <span>{item.title}{item.detail ? ` · ${item.detail}` : ""}</span>
                        </span>
                      );
                    })}
                  </span>
                )}
              </button>
            );
          })}
          {quick && (
            <form ref={quickForm} className="quick-note" style={{ left: quick.left, top: quick.top }} onSubmit={addNote} aria-label="メモを追加 / Quick note">
              <div className="quick-head">
                <strong><PenIcon size={14} /> {longDate(quick.date)}</strong>
                <button type="button" className="icon-button" onClick={() => setQuick(null)} aria-label="閉じる / Close"><CloseIcon size={14} /></button>
              </div>
              <input autoFocus value={quickText} maxLength={100} onChange={(e) => setQuickText(e.target.value)}
                placeholder="メモ（Enter・外をクリックで保存）/ Note, saved on Enter or click outside" aria-label="メモ / Note" />
            </form>
          )}
        </div>
      </section>

      <div className="home-grid">
        <section className="card day-detail" aria-label={longDate(selected)}>
          <h2>{longDate(selected)}{selected === today && <span>今日 / today</span>}</h2>
          {loaded && dayItems.length === 0 && <p className="muted">予定はありません / Nothing planned</p>}
          <ul className="agenda">
            {dayItems.map((item) => (
              <li key={item.key} className={`${item.kind}${item.done ? " done" : ""}`}>
                <span className={`dot ${item.kind}`} />
                <span className="what">
                  {item.time && <b>{item.time} </b>}
                  {item.title}{item.detail && <small> · {item.detail}</small>}
                  <small className="kind">{KIND_LABEL[item.kind]}</small>
                </span>
                {item.plan && (
                  <span className="row-actions">
                    <button className="icon-button" onClick={() => toggle(item.plan!)} aria-pressed={item.plan.done}
                      aria-label={item.plan.done ? "未完了に戻す / Mark as not done" : "完了 / Mark as done"}><CheckIcon /></button>
                    <button className="icon-button" onClick={() => remove(item.plan!)} aria-label="削除 / Delete"><TrashIcon /></button>
                  </span>
                )}
                {item.applicationId && <button className="link" onClick={onOpenApps}>応募 / Open</button>}
              </li>
            ))}
          </ul>
          <form className="add-plan" onSubmit={add} aria-label="予定・目標を追加 / Add an event or goal">
            <div className="segmented" role="radiogroup" aria-label="種類 / Type">
              {(["event", "goal", "note"] as PlanKind[]).map((k) => {
                const Icon = KIND_ICON[k]!;
                return (
                  <button key={k} type="button" role="radio" aria-checked={form.kind === k} onClick={() => setForm((f) => ({ ...f, kind: k }))}>
                    <Icon size={15} /> {KIND_LABEL[k]}
                  </button>
                );
              })}
            </div>
            <div className="add-row">
              <label className={titleError ? "invalid" : undefined}>
                <span>{form.kind === "event" ? "予定（説明会、OB訪問など）/ Event" : form.kind === "goal" ? "目標（ES 3本提出など）/ Goal" : "メモ / Note"}</span>
                <input value={form.title} maxLength={100} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
                {titleError && <small role="alert">{titleError}</small>}
              </label>
              {form.kind === "event" && (
                <label className="time"><span>時刻 / Time</span>
                  <input type="time" value={form.time} onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))} />
                </label>
              )}
              <button className="primary" type="submit"><PlusIcon size={16} /> 追加 / Add</button>
            </div>
          </form>
        </section>

        <section className="card goals" aria-label="目標 / Goals">
          <h2><FlagIcon size={18} /> 目標 <span>Goals</span></h2>
          {goals.length === 0 && <p className="muted">カレンダーの日付を選んで、目標を追加しましょう / Pick a date to add a goal</p>}
          <ul className="agenda">
            {goals.map((g) => (
              <li key={g.id} className="goal">
                <button className="icon-button check" onClick={() => toggle(g)} aria-label={`完了 / Done: ${g.title}`}><CheckIcon /></button>
                <span className="what">{g.title}<small className="kind">{longDate(g.date)}まで / by {g.date}</small></span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
