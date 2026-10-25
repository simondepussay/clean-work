import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Loader } from "../Loader";
import { createPlan, deletePlan, getHolidays, getProfile, getWeather, isLink, listApplications, listPlans, updatePlan, type Application, type DayWeather, type Issue, type Plan, type PlanKind } from "../api";
import { WeatherChip } from "./WeatherChip";
import { useAuth } from "../auth/auth";
import { CalendarIcon, CheckIcon, LinkIcon, PinIcon, ChevronLeftIcon, ChevronRightIcon, CloseIcon, FlagIcon, MicIcon, PenIcon, PlusIcon, TrashIcon } from "../icons";
import { apiMessage, formatDay, useTr, type Lang, type T3, type Tr } from "../i18n";
import { CalendarMenu } from "../apps/CalendarMenu";
import { buildAgenda, monthGrid, ymd, type AgendaItem, type AgendaKind } from "./agenda";

const WEEKDAYS: Record<Lang, string[]> = {
  ja: ["日", "月", "火", "水", "木", "金", "土"],
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  fr: ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."],
};
const KIND_LABEL: Record<AgendaKind, T3> = {
  interview: { ja: "面接", en: "Interview", fr: "Entretien" },
  step: { ja: "選考・締切", en: "Deadline", fr: "Échéance" },
  event: { ja: "予定", en: "Event", fr: "Événement" },
  goal: { ja: "目標", en: "Goal", fr: "Objectif" },
  note: { ja: "メモ", en: "Note", fr: "Note" },
};
const KIND_ICON: Partial<Record<AgendaKind, typeof FlagIcon>> = { goal: FlagIcon, note: PenIcon, event: CalendarIcon };
/** Au plus 3 éléments par case ; les suivants deviennent « +N ». */
const PER_CELL = 3;

function monthTitle(y: number, m: number, lang: Lang) {
  if (lang === "ja") return `${y}年${m + 1}月`;
  const name = new Date(y, m, 1).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US", { month: "long", year: "numeric" });
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function Chip({ item, tr }: { item: AgendaItem; tr: Tr }) {
  return (
    <span className={`chip ${item.kind}${item.done ? " done" : ""}`} title={`${tr(KIND_LABEL[item.kind])} · ${item.title}${item.detail ? ` ${item.detail}` : ""}`}>
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
export function HomePage({ name, onOpenApps, onPractice }: {
  name: string | null;
  onOpenApps: () => void;
  /** S'entraîner à un entretien prévu (lien direct vers l'onglet « 面接 »). */
  onPractice?: (target: { applicationId: string; stepId: string }) => void;
}) {
  const auth = useAuth();
  const tr = useTr();
  const lang = tr.lang;
  const longDate = (iso: string) => formatDay(iso, lang);
  /** « あと5日 » jusqu'à une date (0 : aujourd'hui). */
  const countdown = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    const now = new Date();
    const days = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 86_400_000);
    return days <= 0 ? tr({ ja: "今日まで", en: "due today", fr: "aujourd'hui" }) : tr({ ja: `あと${days}日`, en: `${days} days left`, fr: `dans ${days} j` });
  };
  const today = ymd(new Date());
  const [apps, setApps] = useState<Application[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  /** Jours fériés japonais (holidays-jp) et météo du prochain entretien (Open-Meteo). */
  const [holidays, setHolidays] = useState<Record<string, string>>({});
  /** Météo au lieu de l'entretien, et chez l'utilisateur (c'est de là qu'il part : le parapluie, c'est maintenant). */
  const [weather, setWeather] = useState<{ venue: DayWeather | null; home: DayWeather | null }>({ venue: null, home: null });
  const [homeAddress, setHomeAddress] = useState<string | null>(null);
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
      // Jours fériés : à part, pour ne pas retarder le calendrier si le service est lent.
      getHolidays(t).then((h) => h && setHolidays(h));
      getProfile(t).then((p) => setHomeAddress(p?.address?.trim() || null)).catch(() => {});
      const [a, p] = await Promise.all([listApplications(t), listPlans(t)]);
      if (a.ok && Array.isArray(a.value)) setApps(a.value);
      if (p.ok && Array.isArray(p.value)) setPlans(p.value);
    }).catch(() => {}).finally(() => setLoaded(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const agenda = useMemo(() => buildAgenda(apps, plans, lang), [apps, plans, lang]);
  const byDate = useMemo(() => {
    const map = new Map<string, AgendaItem[]>();
    for (const item of agenda) map.set(item.date, [...(map.get(item.date) ?? []), item]);
    return map;
  }, [agenda]);
  const weeks = monthGrid(month.y, month.m);
  const dayItems = byDate.get(selected) ?? [];
  const goals = plans.filter((p) => p.kind === "goal" && !p.done && p.date >= today).slice(0, 4);
  const nextInterview = agenda.find((i) => i.kind === "interview" && !i.done && i.date >= today);
  const online = isLink(nextInterview?.place);
  // Lieu de la météo : le lieu saisi pour l'entretien, sinon le siège (gBizINFO), sinon l'adresse de l'utilisateur.
  const venue = online ? null : nextInterview?.place || apps.find((a) => a.id === nextInterview?.applicationId)?.location || homeAddress;

  useEffect(() => {
    setWeather({ venue: null, home: null });
    if (!nextInterview) return;
    withToken(async (t) => {
      const [v, h] = await Promise.all([
        online ? null : getWeather(t, nextInterview.date, venue),
        homeAddress && homeAddress !== venue ? getWeather(t, nextInterview.date, homeAddress) : null,
      ]);
      // Même ville : une seule pastille suffit.
      setWeather({ venue: v, home: h && h.place !== v?.place ? h : null });
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextInterview?.date, venue, homeAddress, online]);

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

  const titleMessage = issues.find((i) => i.path === "title")?.message;
  const titleError = titleMessage && apiMessage(titleMessage, lang);

  return (
    <div className="home">
      <header className="home-head">
        <div>
          <p className="eyebrow">Clean Work</p>
          <h1>{tr({ ja: `${name ? `${name}さん、` : ""}おかえりなさい`, en: `Welcome back${name ? `, ${name}` : ""}`, fr: `Bon retour${name ? `, ${name}` : ""}` })}</h1>
        </div>
        <div className="highlights">
          {!loaded && <Loader size={32} />}
          {nextInterview && (
            <div className="highlight interview">
              <DateStub iso={nextInterview.date} lang={lang} />
              <div className="hl-body">
              <span className="hl-label">{tr({ ja: "次の面接", en: "Next interview", fr: "Prochain entretien" })}{nextInterview.time && <b>{nextInterview.time}</b>}</span>
              <strong className="hl-title">{nextInterview.title}{nextInterview.detail && <small> · {nextInterview.detail}</small>}</strong>
              {online ? (
                <a className="join" href={nextInterview.place!.trim()} target="_blank" rel="noreferrer">
                  <LinkIcon size={14} /> {tr({ ja: "オンライン面接に参加", en: "Join the online interview", fr: "Rejoindre l'entretien en ligne" })}
                </a>
              ) : nextInterview.place && <small className="venue"><PinIcon size={13} /> {nextInterview.place}</small>}
              {weather.venue && <WeatherChip weather={weather.venue} label={tr({ ja: "会場", en: "Venue", fr: "Lieu" })} />}
              {weather.home && <WeatherChip weather={weather.home} label={tr({ ja: "自宅", en: "Home", fr: "Domicile" })} />}
              </div>
            </div>
          )}
          {goals[0] && (
            <div className="highlight goal">
              <DateStub iso={goals[0].date} lang={lang} />
              <div className="hl-body">
                <span className="hl-label">{tr(KIND_LABEL.goal)}<b>{countdown(goals[0].date)}</b></span>
                <strong className="hl-title"><FlagIcon size={15} /> {goals[0].title}</strong>
              </div>
            </div>
          )}
        </div>
      </header>

      <section className="calendar card" aria-label={tr({ ja: "カレンダー", en: "Calendar", fr: "Calendrier" })}>
        <div className="calendar-bar">
          <h2><CalendarIcon size={22} /> {monthTitle(month.y, month.m, lang)}</h2>
          <div className="actions">
            <button className="icon-button" onClick={() => shift(-1)} aria-label={tr({ ja: "前の月", en: "Previous month", fr: "Mois précédent" })}><ChevronLeftIcon /></button>
            <button onClick={goToday}>{tr({ ja: "今日", en: "Today", fr: "Aujourd'hui" })}</button>
            <button className="icon-button" onClick={() => shift(1)} aria-label={tr({ ja: "次の月", en: "Next month", fr: "Mois suivant" })}><ChevronRightIcon /></button>
          </div>
          <CalendarMenu />
          <ul className="legend">
            {(["interview", "step", "event", "goal", "note"] as AgendaKind[]).map((k) => <li key={k}><span className={`dot ${k}`} />{tr(KIND_LABEL[k])}</li>)}
          </ul>
        </div>
        <div className="month" role="grid" aria-label={monthTitle(month.y, month.m, lang)} ref={monthRef}>
          {WEEKDAYS[lang].map((w, i) => <div key={w} className={`weekday${i === 0 ? " sun" : i === 6 ? " sat" : ""}`} role="columnheader">{w}</div>)}
          {weeks.flat().map((date) => {
            const key = ymd(date);
            const items = byDate.get(key) ?? [];
            const classes = ["day", date.getMonth() !== month.m && "other", key === today && "today", key === selected && "selected",
              date.getDay() === 0 && "sun", date.getDay() === 6 && "sat", holidays[key] && "holiday"].filter(Boolean).join(" ");
            return (
              <button key={key} className={classes} role="gridcell" aria-selected={key === selected}
                aria-label={`${longDate(key)}${holidays[key] ? ` · ${holidays[key]}` : ""}${items.length ? ` · ${tr({ ja: `${items.length}件`, en: `${items.length} item(s)`, fr: `${items.length} élément(s)` })}` : ""}`} onClick={(e) => pick(key, e.currentTarget)}>
                <span className="num">{date.getDate()}</span>
                {holidays[key] && <span className="holiday-name">{holidays[key]}</span>}
                <span className="chips">
                  {items.slice(0, PER_CELL).map((item) => <Chip key={item.key} item={item} tr={tr} />)}
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
            <form ref={quickForm} className="quick-note" style={{ left: quick.left, top: quick.top }} onSubmit={addNote} aria-label={tr({ ja: "メモを追加", en: "Quick note", fr: "Note rapide" })}>
              <div className="quick-head">
                <strong><PenIcon size={14} /> {longDate(quick.date)}</strong>
                <button type="button" className="icon-button" onClick={() => setQuick(null)} aria-label={tr({ ja: "閉じる", en: "Close", fr: "Fermer" })}><CloseIcon size={14} /></button>
              </div>
              <input autoFocus value={quickText} maxLength={100} onChange={(e) => setQuickText(e.target.value)}
                placeholder={tr({ ja: "メモ（Enter・外をクリックで保存）", en: "Note (saved on Enter or click outside)", fr: "Note (enregistrée avec Entrée ou en cliquant ailleurs)" })} aria-label={tr(KIND_LABEL.note)} />
            </form>
          )}
        </div>
      </section>

      <div className="home-grid">
        <section className="card day-detail" aria-label={longDate(selected)}>
          <h2>
            {longDate(selected)}{selected === today && <span>{tr({ ja: "今日", en: "today", fr: "aujourd'hui" })}</span>}
            {holidays[selected] && <span className="holiday-tag">{tr({ ja: "祝日", en: "Public holiday", fr: "Jour férié" })} · {holidays[selected]}</span>}
          </h2>
          {loaded && dayItems.length === 0 && <p className="muted">{tr({ ja: "予定はありません", en: "Nothing planned", fr: "Rien de prévu" })}</p>}
          <ul className="agenda">
            {dayItems.map((item) => (
              <li key={item.key} className={`${item.kind}${item.done ? " done" : ""}`}>
                <span className={`dot ${item.kind}`} />
                <span className="what">
                  {item.time && <b>{item.time} </b>}
                  {item.title}{item.detail && <small> · {item.detail}</small>}
                  <small className="kind">{tr(KIND_LABEL[item.kind])}</small>
                </span>
                {item.plan && (
                  <span className="row-actions">
                    <button className="icon-button" onClick={() => toggle(item.plan!)} aria-pressed={item.plan.done}
                      aria-label={item.plan.done ? tr({ ja: "未完了に戻す", en: "Mark as not done", fr: "Marquer comme non fait" }) : tr({ ja: "完了", en: "Mark as done", fr: "Marquer comme fait" })}><CheckIcon /></button>
                    <button className="icon-button" onClick={() => remove(item.plan!)} aria-label={tr({ ja: "削除", en: "Delete", fr: "Supprimer" })}><TrashIcon /></button>
                  </span>
                )}
                {item.kind === "interview" && item.applicationId && item.stepId && onPractice && !item.done && (
                  <button className="practice" onClick={() => onPractice({ applicationId: item.applicationId!, stepId: item.stepId! })}>
                    <MicIcon size={15} /> {tr({ ja: "練習する", en: "Practise", fr: "S'entraîner" })}
                  </button>
                )}
                {item.applicationId && <button className="link" onClick={onOpenApps}>{tr({ ja: "応募を開く", en: "Open", fr: "Ouvrir" })}</button>}
              </li>
            ))}
          </ul>
          <form className="add-plan" onSubmit={add} aria-label={tr({ ja: "予定・目標を追加", en: "Add an event or goal", fr: "Ajouter un événement ou un objectif" })}>
            <div className="segmented" role="radiogroup" aria-label={tr({ ja: "種類", en: "Type", fr: "Type" })}>
              {(["event", "goal", "note"] as PlanKind[]).map((k) => {
                const Icon = KIND_ICON[k]!;
                return (
                  <button key={k} type="button" role="radio" aria-checked={form.kind === k} onClick={() => setForm((f) => ({ ...f, kind: k }))}>
                    <Icon size={15} /> {tr(KIND_LABEL[k])}
                  </button>
                );
              })}
            </div>
            <div className="add-row">
              <label className={titleError ? "invalid" : undefined}>
                <span>{form.kind === "event" ? tr({ ja: "予定（説明会、OB訪問など）", en: "Event (info session, alumni visit…)", fr: "Événement (présentation, rencontre d'ancien…)" })
                  : form.kind === "goal" ? tr({ ja: "目標（ES 3本提出など）", en: "Goal (submit 3 ES…)", fr: "Objectif (envoyer 3 ES…)" }) : tr(KIND_LABEL.note)}</span>
                <input value={form.title} maxLength={100} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
                {titleError && <small role="alert">{titleError}</small>}
              </label>
              {form.kind === "event" && (
                <label className="time"><span>{tr({ ja: "時刻", en: "Time", fr: "Heure" })}</span>
                  <input type="time" value={form.time} onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))} />
                </label>
              )}
              <button className="primary" type="submit"><PlusIcon size={16} /> {tr({ ja: "追加", en: "Add", fr: "Ajouter" })}</button>
            </div>
          </form>
        </section>

        <section className="card goals" aria-label={tr({ ja: "目標", en: "Goals", fr: "Objectifs" })}>
          <h2><FlagIcon size={18} /> {tr({ ja: "目標", en: "Goals", fr: "Objectifs" })}</h2>
          {goals.length === 0 && <p className="muted">{tr({ ja: "カレンダーの日付を選んで、目標を追加しましょう", en: "Pick a date in the calendar to add a goal", fr: "Choisissez une date dans le calendrier pour ajouter un objectif" })}</p>}
          <ul className="agenda">
            {goals.map((g) => (
              <li key={g.id} className="goal">
                <button className="icon-button check" onClick={() => toggle(g)} aria-label={`${tr({ ja: "完了", en: "Done", fr: "Fait" })}: ${g.title}`}><CheckIcon /></button>
                <span className="what">{g.title}<small className="kind">{tr({ ja: `${longDate(g.date)}まで`, en: `by ${longDate(g.date)}`, fr: `avant le ${longDate(g.date)}` })}</small></span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

/** Talon de date du ticket : grand numéro du jour, mois et jour de la semaine dans la langue choisie. */
function DateStub({ iso, lang }: { iso: string; lang: Lang }) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const locale = { ja: "ja-JP", en: "en-US", fr: "fr-FR" }[lang];
  const month = new Intl.DateTimeFormat(locale, { month: "short" }).format(date);
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "short" }).format(date);
  return (
    <div className="hl-date" aria-hidden="true">
      <span>{month}</span>
      <b>{d}</b>
      <span>{weekday}</span>
    </div>
  );
}

