import { useEffect, useState, type DragEvent, type FormEvent } from "react";
import {
  createApplication, deleteApplication, listApplications, listDrafts, updateApplication,
  type Application, type ApplicationInput, type AppStatus, type CompanyType, type Draft, type Industry, type Issue, type Step,
} from "../api";
import { useAuth } from "../auth/auth";
import { ListEditor, type Field } from "../profile/ListEditor";
import { stepName, toICalendar, upcomingDeadlines } from "./deadlines";
import { CLOSED, COLUMNS, COMPANY_TYPES, INDUSTRIES, STEP_TYPES, daysUntil, deadlineLabel, neighbour, statusLabel } from "./statuses";
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon, ClockIcon, MicIcon, PenIcon, PlusIcon } from "../icons";

const stepFields: Field<Step>[] = [
  { key: "type", label: "選考 / Step", type: "select", options: STEP_TYPES, placeholder: "選択 / Choose", required: true },
  { key: "dueDate", label: "締切・日程 / Date", type: "date" },
  { key: "done", label: "完了 / Done", type: "checkbox" },
  { key: "note", label: "メモ / Note" },
];

const blank: ApplicationInput = { company: "", status: "interested", steps: [] };

/**
 * Suivi des candidatures (S07) en tableau kanban (S08). `onWriteEs` ouvre l'onglet ES pour une entreprise,
 * `onPractice` l'entraînement aux entretiens (S17–S19).
 */
export function ApplicationsBoard({ onWriteEs, onPractice }: {
  onWriteEs?: (app: { id: string; company: string }) => void;
  onPractice?: (app: { id: string }) => void;
} = {}) {
  const auth = useAuth();
  const [apps, setApps] = useState<Application[] | null>(null);
  const [editing, setEditing] = useState<{ id: string | null; form: ApplicationInput } | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [error, setError] = useState(false);
  const [drafts, setDrafts] = useState<Draft[]>([]);

  async function token() {
    const t = await auth.getToken();
    if (!t) throw new Error("pas de jeton");
    return t;
  }

  useEffect(() => {
    token().then(listApplications)
      .then((r) => setApps(r.ok && Array.isArray(r.value) ? r.value : []))
      .catch(() => setApps([]));
    token().then(listDrafts).then((r) => r.ok && Array.isArray(r.value) && setDrafts(r.value)).catch(() => {});
    // Chargé une fois.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const replace = (a: Application) => setApps((all) => [a, ...(all ?? []).filter((x) => x.id !== a.id)]
    .sort((x, y) => (x.nextDeadline ?? "9999").localeCompare(y.nextDeadline ?? "9999") || x.company.localeCompare(y.company)));

  async function move(app: Application, status: AppStatus) {
    if (app.status === status) return;
    setError(false);
    try {
      const r = await updateApplication(await token(), app.id, { status });
      if (r.ok) replace(r.value);
      else setError(true);
    } catch {
      setError(true);
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    try {
      const t = await token();
      const r = editing.id ? await updateApplication(t, editing.id, editing.form) : await createApplication(t, editing.form);
      if (!r.ok) return setIssues(r.issues);
      replace(r.value);
      setEditing(null);
      setIssues([]);
    } catch {
      setError(true);
    }
  }

  async function remove() {
    if (!editing?.id || !window.confirm(`${editing.form.company} を削除しますか？ / Delete this application?`)) return;
    try {
      await deleteApplication(await token(), editing.id);
      setApps((all) => (all ?? []).filter((x) => x.id !== editing.id));
      setEditing(null);
    } catch {
      setError(true);
    }
  }

  const onDrop = (status: AppStatus) => (e: DragEvent) => {
    e.preventDefault();
    const app = apps?.find((a) => a.id === e.dataTransfer.getData("text/plain"));
    if (app) move(app, status);
  };

  if (apps === null) return <p className="muted">…</p>;

  const soon = upcomingDeadlines(apps, new Date(), 14);
  const allUpcoming = upcomingDeadlines(apps);

  /** Toutes les échéances à venir dans un fichier .ics (Google Agenda, Apple Calendar, Outlook). */
  function exportCalendar() {
    const url = URL.createObjectURL(new Blob([toICalendar(allUpcoming)], { type: "text/calendar;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "shukatsu-deadlines.ics";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  const errors = new Map(issues.map((i) => [i.path, i.message]));
  const esCount = (id: string) => drafts.filter((d) => d.applicationId === id).length;
  const set = (patch: Partial<ApplicationInput>) => setEditing((ed) => (ed ? { ...ed, form: { ...ed.form, ...patch } } : ed));
  const columns = [...COLUMNS.map((c) => ({ ...c, statuses: [c.status] })), { status: "rejected" as AppStatus, ja: "終了", en: "Closed", statuses: CLOSED.map((c) => c.status) }];

  return (
    <section className="apps">
      <div className="apps-bar">
        <button className="primary" onClick={() => { setIssues([]); setEditing({ id: null, form: { ...blank } }); }}><PlusIcon size={16} /> 応募を追加 / Add</button>
        <span className="muted">{apps.length}社 / {apps.length} companies</span>
        {error && <span role="alert" className="notice">保存できませんでした / Could not save</span>}
      </div>

      <section className="upcoming" aria-label="近い締切 / Upcoming deadlines">
        <div className="upcoming-head">
          <h3>近い締切 <span>Upcoming deadlines · 14日 / 14 days</span></h3>
          <button type="button" onClick={exportCalendar} disabled={allUpcoming.length === 0}
            title="Google カレンダー・Apple カレンダー・Outlook に読み込めます / Import into Google, Apple or Outlook calendar">
            <CalendarIcon size={16} /> カレンダーに追加 / Add to calendar (.ics)
          </button>
        </div>
        {soon.length === 0 ? (
          <p className="muted">14日以内の締切はありません / No deadlines in the next 14 days</p>
        ) : (
          <ul>
            {soon.map((d) => (
              <li key={d.stepId} className={d.days <= 3 ? "soon" : undefined}>
                <span className="when">{deadlineLabel(d.days)}</span>
                <strong>{d.company}</strong> {stepName(d.step)}
                <span className="muted"> · {d.date}{d.note ? ` · ${d.note}` : ""}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="board" role="list" aria-label="選考状況 / Selection board">
        {columns.map((col) => {
          const cards = apps.filter((a) => col.statuses.includes(a.status));
          const closed = col.ja === "終了";
          return (
            <div key={col.ja} className="column" role="listitem" aria-label={`${col.ja} / ${col.en}`}
              onDragOver={closed ? undefined : (e) => e.preventDefault()} onDrop={closed ? undefined : onDrop(col.status)}>
              <h3>{col.ja}<span>{col.en} · {cards.length}</span></h3>
              {cards.map((a) => {
                const days = a.nextDeadline ? daysUntil(a.nextDeadline) : null;
                const prev = neighbour(a.status, -1);
                const next = neighbour(a.status, 1);
                return (
                  <article key={a.id} className="app-card" draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", a.id)}>
                    <button className="app-open" onClick={() => { setIssues([]); setEditing({ id: a.id, form: { company: a.company, position: a.position, url: a.url, status: a.status, steps: a.steps, industry: a.industry, companyType: a.companyType, notes: a.notes } }); }}>
                      <strong>{a.company}</strong>
                      {a.position && <span>{a.position}</span>}
                      {closed && <span className="muted">{statusLabel(a.status)}</span>}
                    </button>
                    {days !== null && <p className={days <= 3 ? "due soon" : "due"}><ClockIcon size={13} /> {deadlineLabel(days)}</p>}
                    {esCount(a.id) > 0 && <p className="es-badge">ES {esCount(a.id)}</p>}
                    {!closed && (
                      <div className="moves">
                        <button disabled={!prev} onClick={() => prev && move(a, prev)} aria-label={`${a.company} : 前のステップへ / previous step`}><ChevronLeftIcon size={14} /></button>
                        <button disabled={!next} onClick={() => next && move(a, next)} aria-label={`${a.company} : 次のステップへ / next step`}><ChevronRightIcon size={14} /></button>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          );
        })}
      </div>

      {editing && (
        <form className="app-editor" onSubmit={save} noValidate aria-label="応募 / Application">
          <h3>{editing.id ? editing.form.company : "新しい応募 / New application"}</h3>
          <div className="grid">
            <label className={errors.has("company") ? "invalid" : undefined}>
              <span>企業名 / Company *</span>
              <input value={editing.form.company} onChange={(e) => set({ company: e.target.value })} />
              {errors.has("company") && <small role="alert">{errors.get("company")}</small>}
            </label>
            <label>
              <span>職種 / Position</span>
              <input value={editing.form.position ?? ""} onChange={(e) => set({ position: e.target.value })} />
            </label>
            <label className={errors.has("url") ? "invalid" : undefined}>
              <span>URL（採用ページ）/ Careers page</span>
              <input type="url" value={editing.form.url ?? ""} onChange={(e) => set({ url: e.target.value })} />
              {errors.has("url") && <small role="alert">{errors.get("url")}</small>}
            </label>
            <label>
              <span>業界 / Industry</span>
              <select value={editing.form.industry ?? ""} onChange={(e) => set({ industry: (e.target.value || null) as Industry | null })}>
                <option value="">—</option>
                {INDUSTRIES.map((i) => <option key={i.value} value={i.value}>{i.ja} / {i.en}</option>)}
              </select>
            </label>
            <label>
              <span>企業の種類 / Company type</span>
              <select value={editing.form.companyType ?? ""} onChange={(e) => set({ companyType: (e.target.value || null) as CompanyType | null })}>
                <option value="">—</option>
                {COMPANY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.ja} / {t.en}</option>)}
              </select>
            </label>
            <label>
              <span>状況 / Status</span>
              <select value={editing.form.status} onChange={(e) => set({ status: e.target.value as AppStatus })}>
                {[...COLUMNS, ...CLOSED].map((c) => <option key={c.status} value={c.status}>{c.ja} / {c.en}</option>)}
              </select>
            </label>
          </div>
          <label className={errors.has("notes") ? "invalid" : undefined}>
            <span>企業メモ / Notes on the company</span>
            <textarea rows={4} maxLength={2000} value={editing.form.notes ?? ""} onChange={(e) => set({ notes: e.target.value })}
              placeholder="事業・製品、企業理念、説明会で聞いたこと、惹かれた点など（面接練習に使います）/ Products, values, what attracts you… (used for interview practice)" />
            {errors.has("notes") && <small role="alert">{errors.get("notes")}</small>}
          </label>
          <ListEditor title="選考ステップ・締切 / Steps and deadlines" name="steps" items={editing.form.steps} fields={stepFields}
            empty={{ id: crypto.randomUUID(), type: "es", done: false } as Step} errors={errors}
            onChange={(steps) => set({ steps: steps.map((s) => (s.id ? s : { ...s, id: crypto.randomUUID() })) })} />
          <div className="actions">
            <button className="primary" type="submit">保存 / Save</button>
            <button type="button" onClick={() => setEditing(null)}>閉じる / Close</button>
            {editing.id && onWriteEs && (
              <button type="button" onClick={() => onWriteEs({ id: editing.id!, company: editing.form.company })}>
                <PenIcon size={16} /> このESを書く / Write an ES for this company
              </button>
            )}
            {editing.id && onPractice && (
              <button type="button" onClick={() => onPractice({ id: editing.id! })}><MicIcon size={16} /> 面接を練習する / Practise the interview</button>
            )}
            {editing.id && <button type="button" className="danger" onClick={remove}>削除 / Delete</button>}
          </div>
        </form>
      )}
    </section>
  );
}
