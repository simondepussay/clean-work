import { useEffect, useState, type DragEvent, type FormEvent } from "react";
import { Loader } from "../Loader";
import {
  createApplication, deleteApplication, listApplications, listDrafts, updateApplication,
  type Application, type ApplicationInput, type AppStatus, type CompanyType, type Draft, type Industry, type Issue, type Step,
} from "../api";
import { useAuth } from "../auth/auth";
import { ListEditor, type Field } from "../profile/ListEditor";
import { stepName, toICalendar, upcomingDeadlines } from "./deadlines";
import { CLOSED, COLUMNS, COMPANY_TYPES, INDUSTRIES, daysUntil, deadlineLabel, neighbour, statusLabel, stepTypes } from "./statuses";
import { apiMessage, useTr } from "../i18n";
import { CalendarMenu } from "./CalendarMenu";
import { ChevronLeftIcon, ChevronRightIcon, ClockIcon, MicIcon, PenIcon, PlusIcon } from "../icons";

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
  const tr = useTr();
  const lang = tr.lang;
  const stepFields: Field<Step>[] = [
    { key: "type", label: tr({ ja: "選考", en: "Step", fr: "Étape" }), type: "select", options: stepTypes(lang), placeholder: tr({ ja: "選択", en: "Choose", fr: "Choisir" }), required: true },
    { key: "dueDate", label: tr({ ja: "締切・日程", en: "Date", fr: "Date" }), type: "date" },
    { key: "done", label: tr({ ja: "完了", en: "Done", fr: "Terminé" }), type: "checkbox" },
    { key: "note", label: tr({ ja: "メモ", en: "Note", fr: "Note" }) },
  ];
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
    if (!editing?.id || !window.confirm(tr({ ja: `${editing.form.company} を削除しますか？`, en: `Delete ${editing.form.company}?`, fr: `Supprimer ${editing.form.company} ?` }))) return;
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

  if (apps === null) return <Loader />;

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

  const errors = new Map(issues.map((i) => [i.path, apiMessage(i.message, lang)]));
  const esCount = (id: string) => drafts.filter((d) => d.applicationId === id).length;
  const set = (patch: Partial<ApplicationInput>) => setEditing((ed) => (ed ? { ...ed, form: { ...ed.form, ...patch } } : ed));
  const columns = [...COLUMNS.map((c) => ({ ...c, statuses: [c.status] })), { status: "rejected" as AppStatus, ja: "終了", en: "Closed", fr: "Terminé", statuses: CLOSED.map((c) => c.status) }];

  return (
    <section className="apps">
      <div className="apps-bar">
        <button className="primary" onClick={() => { setIssues([]); setEditing({ id: null, form: { ...blank } }); }}><PlusIcon size={16} /> {tr({ ja: "応募を追加", en: "Add an application", fr: "Ajouter une candidature" })}</button>
        <span className="muted">{tr({ ja: `${apps.length}社`, en: `${apps.length} companies`, fr: `${apps.length} entreprises` })}</span>
        {error && <span role="alert" className="notice">{tr({ ja: "保存できませんでした", en: "Could not save", fr: "Enregistrement impossible" })}</span>}
      </div>

      <section className="upcoming" aria-label={tr({ ja: "近い締切", en: "Upcoming deadlines", fr: "Échéances proches" })}>
        <div className="upcoming-head">
          <h3>{tr({ ja: "近い締切", en: "Upcoming deadlines", fr: "Échéances proches" })} <span>{tr({ ja: "14日以内", en: "next 14 days", fr: "14 prochains jours" })}</span></h3>
          <CalendarMenu onDownload={exportCalendar} canDownload={allUpcoming.length > 0} />
        </div>
        {soon.length === 0 ? (
          <p className="muted">{tr({ ja: "14日以内の締切はありません", en: "No deadlines in the next 14 days", fr: "Aucune échéance dans les 14 prochains jours" })}</p>
        ) : (
          <ul>
            {soon.map((d) => (
              <li key={d.stepId} className={d.days <= 3 ? "soon" : undefined}>
                <span className="when">{deadlineLabel(d.days, lang)}</span>
                <span><strong>{d.company}</strong> {stepName(d.step, lang)}<span className="muted"> · {d.date}{d.note ? ` · ${d.note}` : ""}</span></span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="board" role="list" aria-label={tr({ ja: "選考状況", en: "Selection board", fr: "Suivi des candidatures" })}>
        {columns.map((col) => {
          const cards = apps.filter((a) => col.statuses.includes(a.status));
          const closed = col.ja === "終了";
          return (
            <div key={col.ja} className="column" role="listitem" aria-label={col[lang]}
              onDragOver={closed ? undefined : (e) => e.preventDefault()} onDrop={closed ? undefined : onDrop(col.status)}>
              <h3>{col[lang]}<span>{cards.length}</span></h3>
              {cards.map((a) => {
                const days = a.nextDeadline ? daysUntil(a.nextDeadline) : null;
                const prev = neighbour(a.status, -1);
                const next = neighbour(a.status, 1);
                return (
                  <article key={a.id} className="app-card" draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", a.id)}>
                    <button className="app-open" onClick={() => { setIssues([]); setEditing({ id: a.id, form: { company: a.company, position: a.position, url: a.url, status: a.status, steps: a.steps, industry: a.industry, companyType: a.companyType, notes: a.notes } }); }}>
                      <strong>{a.company}</strong>
                      {a.position && <span>{a.position}</span>}
                      {closed && <span className="muted">{statusLabel(a.status, lang)}</span>}
                    </button>
                    {days !== null && <p className={days <= 3 ? "due soon" : "due"}><ClockIcon size={13} /> {deadlineLabel(days, lang)}</p>}
                    {esCount(a.id) > 0 && <p className="es-badge">ES {esCount(a.id)}</p>}
                    {!closed && (
                      <div className="moves">
                        <button disabled={!prev} onClick={() => prev && move(a, prev)} aria-label={tr({ ja: `${a.company}：前のステップへ`, en: `${a.company}: previous step`, fr: `${a.company} : étape précédente` })}><ChevronLeftIcon size={14} /></button>
                        <button disabled={!next} onClick={() => next && move(a, next)} aria-label={tr({ ja: `${a.company}：次のステップへ`, en: `${a.company}: next step`, fr: `${a.company} : étape suivante` })}><ChevronRightIcon size={14} /></button>
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
        <form className="app-editor" onSubmit={save} noValidate aria-label={tr({ ja: "応募", en: "Application", fr: "Candidature" })}>
          <h3>{editing.id ? editing.form.company : tr({ ja: "新しい応募", en: "New application", fr: "Nouvelle candidature" })}</h3>
          <div className="grid">
            <label className={errors.has("company") ? "invalid" : undefined}>
              <span>{tr({ ja: "企業名", en: "Company", fr: "Entreprise" })} *</span>
              <input value={editing.form.company} onChange={(e) => set({ company: e.target.value })} />
              {errors.has("company") && <small role="alert">{errors.get("company")}</small>}
            </label>
            <label>
              <span>{tr({ ja: "職種", en: "Position", fr: "Poste" })}</span>
              <input value={editing.form.position ?? ""} onChange={(e) => set({ position: e.target.value })} />
            </label>
            <label className={errors.has("url") ? "invalid" : undefined}>
              <span>{tr({ ja: "採用ページのURL", en: "Careers page URL", fr: "Page recrutement (URL)" })}</span>
              <input type="url" value={editing.form.url ?? ""} onChange={(e) => set({ url: e.target.value })} />
              {errors.has("url") && <small role="alert">{errors.get("url")}</small>}
            </label>
            <label>
              <span>{tr({ ja: "業界", en: "Industry", fr: "Secteur" })}</span>
              <select value={editing.form.industry ?? ""} onChange={(e) => set({ industry: (e.target.value || null) as Industry | null })}>
                <option value="">—</option>
                {INDUSTRIES.map((i) => <option key={i.value} value={i.value}>{i[lang]}</option>)}
              </select>
            </label>
            <label>
              <span>{tr({ ja: "企業の種類", en: "Company type", fr: "Type d'entreprise" })}</span>
              <select value={editing.form.companyType ?? ""} onChange={(e) => set({ companyType: (e.target.value || null) as CompanyType | null })}>
                <option value="">—</option>
                {COMPANY_TYPES.map((t) => <option key={t.value} value={t.value}>{t[lang]}</option>)}
              </select>
            </label>
            <label>
              <span>{tr({ ja: "状況", en: "Status", fr: "Statut" })}</span>
              <select value={editing.form.status} onChange={(e) => set({ status: e.target.value as AppStatus })}>
                {[...COLUMNS, ...CLOSED].map((c) => <option key={c.status} value={c.status}>{c[lang]}</option>)}
              </select>
            </label>
          </div>
          <label className={errors.has("notes") ? "invalid" : undefined}>
            <span>{tr({ ja: "企業メモ・求人票", en: "Notes and job offer", fr: "Notes et offre d'emploi" })}</span>
            <textarea rows={6} maxLength={5000} value={editing.form.notes ?? ""} onChange={(e) => set({ notes: e.target.value })}
              placeholder={tr({
                ja: "求人票・募集要項をそのまま貼り付けられます。事業・製品、企業理念、説明会で聞いたこと、惹かれた点なども。面接練習の質問に使います。",
                en: "You can paste the job offer as it is. Add products, values, what you heard at events, what attracts you… Used to tailor interview practice.",
                fr: "Vous pouvez coller l'offre d'emploi telle quelle. Ajoutez produits, valeurs, ce que vous avez appris aux présentations, ce qui vous attire… Utilisé pour l'entraînement aux entretiens.",
              })} />
            {errors.has("notes") && <small role="alert">{errors.get("notes")}</small>}
          </label>
          <ListEditor title={tr({ ja: "選考ステップ・締切", en: "Steps and deadlines", fr: "Étapes et échéances" })} name="steps" items={editing.form.steps} fields={stepFields}
            empty={{ id: crypto.randomUUID(), type: "es", done: false } as Step} errors={errors}
            onChange={(steps) => set({ steps: steps.map((s) => (s.id ? s : { ...s, id: crypto.randomUUID() })) })} />
          <div className="actions">
            <button className="primary" type="submit">{tr({ ja: "保存", en: "Save", fr: "Enregistrer" })}</button>
            <button type="button" onClick={() => setEditing(null)}>{tr({ ja: "閉じる", en: "Close", fr: "Fermer" })}</button>
            {editing.id && onWriteEs && (
              <button type="button" onClick={() => onWriteEs({ id: editing.id!, company: editing.form.company })}>
                <PenIcon size={16} /> {tr({ ja: "この企業のESを書く", en: "Write an ES for this company", fr: "Écrire une ES pour cette entreprise" })}
              </button>
            )}
            {editing.id && onPractice && (
              <button type="button" onClick={() => onPractice({ id: editing.id! })}><MicIcon size={16} /> {tr({ ja: "面接を練習する", en: "Practise the interview", fr: "S'entraîner à l'entretien" })}</button>
            )}
            {editing.id && <button type="button" className="danger" onClick={remove}>{tr({ ja: "削除", en: "Delete", fr: "Supprimer" })}</button>}
          </div>
        </form>
      )}
    </section>
  );
}
