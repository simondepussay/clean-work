import { useEffect, useState, type FormEvent } from "react";
import { Loader } from "../Loader";
import {
  createApplication, deleteApplication, listApplications, listDrafts, updateApplication,
  type AppEvent, type Application, type ApplicationInput, type AppStatus, type CompanyType, type Draft, type FollowUp, type Industry, type Issue, type Step,
} from "../api";
import { useAuth } from "../auth/auth";
import { ListEditor, type Field } from "../profile/ListEditor";
import { toICalendar, upcomingDeadlines } from "./deadlines";
import { CLOSED, COLUMNS, COMPANY_TYPES, GROUPS, INDUSTRIES, daysUntil, deadlineLabel, matches, stepTypes, type GroupId } from "./statuses";
import { apiMessage, useTr } from "../i18n";
import { CalendarMenu } from "./CalendarMenu";
import { CompanyFacts } from "./CompanyFacts";
import { ClockIcon, FlagIcon, MailIcon, MicIcon, PenIcon, PlusIcon, SearchIcon } from "../icons";
import { EmailPanel } from "./EmailPanel";
import { ymd } from "../home/agenda";
import type { SavedJob } from "./savedJob";
import { SaveFromBrowser } from "./SaveFromBrowser";
import { useFreshData } from "../useFreshData";
import { ImportPanel } from "./ImportPanel";

const blank: ApplicationInput = { company: "", status: "interested", steps: [] };

/**
 * Suivi des candidatures (S07) en tableau kanban (S08). `onWriteEs` ouvre l'onglet ES pour une entreprise,
 * `onPractice` l'entraînement aux entretiens (S17–S19).
 */
export function ApplicationsBoard({ onWriteEs, onPractice, seed }: {
  onWriteEs?: (app: { id: string; company: string }) => void;
  onPractice?: (app: { id: string }) => void;
  /** Offre envoyée par l'extension « Clean Work に追加 » : le formulaire s'ouvre rempli. */
  seed?: SavedJob & { nonce: number };
} = {}) {
  const auth = useAuth();
  const tr = useTr();
  const lang = tr.lang;
  const stepFields: Field<Step>[] = [
    { key: "type", label: tr({ ja: "選考", en: "Step", fr: "Étape" }), type: "select", options: stepTypes(lang), placeholder: tr({ ja: "選択", en: "Choose", fr: "Choisir" }), required: true },
    { key: "dueDate", label: tr({ ja: "締切・日程", en: "Date", fr: "Date" }), type: "date" },
    { key: "time", label: tr({ ja: "時間", en: "Time", fr: "Heure" }), type: "time" },
    { key: "place", label: tr({ ja: "場所・オンラインのURL", en: "Place or online link", fr: "Lieu ou lien en ligne" }), placeholder: "東京都港区… / https://…" },
    { key: "done", label: tr({ ja: "完了", en: "Done", fr: "Terminé" }), type: "checkbox" },
    { key: "note", label: tr({ ja: "メモ", en: "Note", fr: "Note" }) },
  ];
  // フォローアップ : relances datées (rappelées comme des échéances). やりとり : journal des échanges avec l'entreprise.
  const followUpFields: Field<FollowUp>[] = [
    { key: "date", label: tr({ ja: "日付", en: "Date", fr: "Date" }), type: "date", required: true },
    { key: "note", label: tr({ ja: "やること", en: "To do", fr: "À faire" }), required: true,
      suggestions: () => [tr({ ja: "人事にお礼メール", en: "Thank-you email to HR", fr: "Mail de remerciement aux RH" }), tr({ ja: "選考結果の確認", en: "Ask about the result", fr: "Demander le résultat" }), tr({ ja: "書類を送る", en: "Send documents", fr: "Envoyer les documents" })] },
    { key: "done", label: tr({ ja: "完了", en: "Done", fr: "Fait" }), type: "checkbox" },
  ];
  const eventFields: Field<AppEvent>[] = [
    { key: "date", label: tr({ ja: "日付", en: "Date", fr: "Date" }), type: "date", required: true },
    { key: "kind", label: tr({ ja: "種類", en: "Type", fr: "Type" }), type: "select", options: [
      { value: "email", label: tr({ ja: "メール", en: "Email", fr: "E-mail" }) },
      { value: "call", label: tr({ ja: "電話", en: "Call", fr: "Appel" }) },
      { value: "seminar", label: tr({ ja: "説明会", en: "Info session", fr: "Session d'information" }) },
      { value: "ob", label: tr({ ja: "OB・OG訪問", en: "Alumni visit", fr: "Rencontre avec un ancien" }) },
      { value: "meeting", label: tr({ ja: "面談", en: "Meeting", fr: "Rendez-vous" }) },
      { value: "other", label: tr({ ja: "その他", en: "Other", fr: "Autre" }) },
    ] },
    { key: "note", label: tr({ ja: "内容", en: "What happened", fr: "Ce qui s'est passé" }), type: "textarea" },
  ];
  const [apps, setApps] = useState<Application[] | null>(null);
  const [editing, setEditing] = useState<{ id: string | null; form: ApplicationInput } | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [error, setError] = useState(false);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [query, setQuery] = useState("");
  /** Liste compacte de toutes les candidatures envoyées (à la place du tableau). */
  /** Filtre d'étape (« 進行中 » par défaut) et tri de la liste. */
  const [stage, setStage] = useState<GroupId>("active");
  const [sort, setSort] = useState<"deadline" | "company" | "updated">("deadline");
  /** Rédaction d'un mail (お礼, 日程調整…) pour la candidature ouverte. */
  const [mailing, setMailing] = useState(false);
  useEffect(() => { setMailing(false); }, [editing?.id]);

  async function token() {
    const t = await auth.getToken();
    if (!t) throw new Error("pas de jeton");
    return t;
  }

  const load = () => {
    token().then(listApplications)
      .then((r) => setApps(r.ok && Array.isArray(r.value) ? r.value : []))
      .catch(() => setApps((a) => a ?? []));
    token().then(listDrafts).then((r) => r.ok && Array.isArray(r.value) && setDrafts(r.value)).catch(() => {});
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);
  // Données fraîches arrivées en arrière-plan (data.ts) : le tableau se relit depuis le cache.
  useFreshData(load);

  // Offre reçue de l'extension : nouveau formulaire rempli, à vérifier puis enregistrer.
  const [fromBrowser, setFromBrowser] = useState<string | null>(null);
  /** L'explication « ブラウザから追加 » (bookmarklet et extension). */
  const [browserHelp, setBrowserHelp] = useState(false);
  /** Import d'un CSV (Notion, Huntr, Excel). */
  const [importing, setImporting] = useState(false);
  useEffect(() => {
    if (!seed) return;
    setIssues([]);
    setFromBrowser(seed.source ?? "");
    setEditing({ id: null, form: {
      ...blank,
      company: seed.company ?? "",
      position: seed.position,
      url: seed.url,
      notes: [seed.location && `勤務地：${seed.location}`, seed.notes].filter(Boolean).join("\n\n") || undefined,
      steps: seed.deadline ? [{ id: crypto.randomUUID(), type: "es", dueDate: seed.deadline, done: false, note: tr({ ja: "募集締切", en: "Application deadline", fr: "Date limite de candidature" }) }] : [],
    } });
    // Seulement à l'arrivée d'une nouvelle offre.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed?.nonce]);

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
    setError(false);
    try {
      const t = await token();
      const r = editing.id ? await updateApplication(t, editing.id, editing.form) : await createApplication(t, editing.form);
      if (!r.ok) return setIssues(r.issues);
      replace(r.value);
      setEditing(null);
      setFromBrowser(null);
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


  if (apps === null) return <Loader />;

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
  const visible = apps.filter((a) => matches(a, query));
  // Un second clic sur la même candidature referme sa fiche.
  const open = (a: Application) => { if (editing?.id === a.id) { setEditing(null); return; } setIssues([]); setEditing({ id: a.id, form: { company: a.company, position: a.position, url: a.url, status: a.status, steps: a.steps, industry: a.industry, companyType: a.companyType, notes: a.notes, corporateNumber: a.corporateNumber, location: a.location, events: a.events ?? [], followUps: a.followUps ?? [] } }); };
  const counts = new Map(GROUPS.map((g) => [g.id, visible.filter((a) => g.statuses.includes(a.status)).length]));
  const group = GROUPS.find((g) => g.id === stage) ?? GROUPS[0];
  const nextFollowUp = (a: Application) => (a.followUps ?? []).filter((x) => !x.done).sort((x, y) => x.date.localeCompare(y.date))[0];
  // Tri : l'échéance la plus proche d'abord (les candidatures sans échéance à la fin), l'entreprise, ou la dernière mise à jour.
  const rows = visible.filter((a) => group.statuses.includes(a.status)).sort((x, y) =>
    sort === "company" ? x.company.localeCompare(y.company, lang)
      : sort === "updated" ? y.updatedAt.localeCompare(x.updatedAt)
      : (x.nextDeadline ?? "9999").localeCompare(y.nextDeadline ?? "9999") || x.company.localeCompare(y.company, lang));
  const sortButton = (key: typeof sort, label: string) => (
    <button type="button" className={`sort${sort === key ? " active" : ""}`} aria-pressed={sort === key} onClick={() => setSort(key)}>{label}</button>
  );

  return (
    <section className="apps">
      <div className="apps-bar">
        <button className="primary" onClick={() => { setIssues([]); setEditing({ id: null, form: { ...blank } }); }}><PlusIcon size={16} /> {tr({ ja: "応募を追加", en: "Add an application", fr: "Ajouter une candidature" })}</button>
        <label className="apps-search">
          <SearchIcon size={15} />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder={tr({ ja: "企業名・職種・メモで検索", en: "Search company, position, notes", fr: "Chercher entreprise, poste, notes" })}
            aria-label={tr({ ja: "応募を検索", en: "Search applications", fr: "Chercher une candidature" })} />
        </label>
        <CalendarMenu onDownload={exportCalendar} canDownload={allUpcoming.length > 0} />
        <details className="more-menu">
          <summary aria-label={tr({ ja: "その他", en: "More", fr: "Plus" })}>…</summary>
          <div className="menu">
            <button type="button" onClick={(e) => { setImporting(true); (e.currentTarget.closest("details") as HTMLDetailsElement).open = false; }}>{tr({ ja: "インポート（Notion・Huntr・Excel）", en: "Import (Notion, Huntr, Excel)", fr: "Importer (Notion, Huntr, Excel)" })}</button>
            <button type="button" onClick={(e) => { setBrowserHelp(true); (e.currentTarget.closest("details") as HTMLDetailsElement).open = false; }}>{tr({ ja: "ブラウザから追加", en: "Save from the browser", fr: "Ajouter depuis le navigateur" })}</button>
          </div>
        </details>
        {error && !editing && <span role="alert" className="notice">{tr({ ja: "保存できませんでした", en: "Could not save", fr: "Enregistrement impossible" })}</span>}
      </div>

      {browserHelp && <SaveFromBrowser onClose={() => setBrowserHelp(false)} />}
      {importing && <ImportPanel existing={apps} onClose={() => setImporting(false)} onImported={(created) => created.forEach(replace)} />}

      {/* Une liste dense plutôt que des colonnes : lisible avec plus de cent candidatures. */}
      <nav className="stage-tabs" aria-label={tr({ ja: "選考状況", en: "Selection stage", fr: "Étape" })}>
        {GROUPS.map((g) => (
          <button key={g.id} type="button" aria-pressed={stage === g.id} onClick={() => setStage(g.id)}>
            {tr(g)}<span>{counts.get(g.id)}</span>
          </button>
        ))}
      </nav>

      {rows.length === 0 ? (
        <p className="muted apps-empty">{apps.length === 0
          ? tr({ ja: "まだ応募がありません。「応募を追加」から始めましょう。", en: "No applications yet. Start with “Add an application”.", fr: "Aucune candidature. Commencez par « Ajouter une candidature »." })
          : tr({ ja: "該当する応募はありません", en: "No matching applications", fr: "Aucune candidature correspondante" })}</p>
      ) : (
        <table className="apps-table" aria-label={tr({ ja: "応募一覧", en: "Applications", fr: "Candidatures" })}>
          <thead>
            <tr>
              <th>{sortButton("company", tr({ ja: "企業", en: "Company", fr: "Entreprise" }))}</th>
              <th>{tr({ ja: "状況", en: "Stage", fr: "Étape" })}</th>
              <th>{sortButton("deadline", tr({ ja: "次の締切", en: "Next deadline", fr: "Prochaine échéance" }))}</th>
              <th className="col-extra">{tr({ ja: "フォロー・ES", en: "Follow-up · ES", fr: "Relance · ES" })}</th>
              <th className="col-updated">{sortButton("updated", tr({ ja: "更新", en: "Updated", fr: "Modifiée" }))}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => {
              const days = a.nextDeadline ? daysUntil(a.nextDeadline) : null;
              const f = nextFollowUp(a);
              return (
                <tr key={a.id}>
                  <td className="col-company">
                    <button type="button" className="row-open" onClick={() => open(a)} aria-expanded={editing?.id === a.id}>
                      <strong>{a.company}</strong>
                      {a.position && <span>{a.position}</span>}
                    </button>
                  </td>
                  <td>
                    <select value={a.status} onChange={(e) => move(a, e.target.value as AppStatus)}
                      aria-label={tr({ ja: `${a.company}の状況`, en: `${a.company}: stage`, fr: `${a.company} : étape` })}>
                      {[...COLUMNS, ...CLOSED].map((c) => <option key={c.status} value={c.status}>{c[lang]}</option>)}
                    </select>
                  </td>
                  <td className={days !== null && days >= 0 && days <= 3 ? "due soon" : "due"}>
                    {days !== null && days >= 0 ? <><ClockIcon size={13} /> {deadlineLabel(days, lang)}</> : <span className="muted">—</span>}
                  </td>
                  <td className="col-extra">
                    {f && <span className="followup-badge" title={f.note}><FlagIcon size={12} /> {f.date.slice(5).replace("-", "/")}</span>}
                    {esCount(a.id) > 0 && <span className="es-badge">ES {esCount(a.id)}</span>}
                  </td>
                  <td className="col-updated muted">{a.updatedAt ? a.updatedAt.slice(5, 10).replace("-", "/") : ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {editing && (
        <form className="app-editor" onSubmit={save} noValidate aria-label={tr({ ja: "応募", en: "Application", fr: "Candidature" })}>
          <h3>{editing.id ? editing.form.company : tr({ ja: "新しい応募", en: "New application", fr: "Nouvelle candidature" })}</h3>
          <div className="actions editor-top">
            <button className="primary" type="submit">{tr({ ja: "保存", en: "Save", fr: "Enregistrer" })}</button>
            {/* L'erreur s'affiche là où l'on vient de cliquer, pas en haut de la page. */}
            {error && <span role="alert" className="notice save-error">{tr({ ja: "保存できませんでした。もう一度お試しください。", en: "Could not save. Please try again.", fr: "Enregistrement impossible. Réessayez." })}</span>}
            <button type="button" onClick={() => setEditing(null)}>{tr({ ja: "閉じる", en: "Close", fr: "Fermer" })}</button>
            {editing.id && onWriteEs && (
              <button type="button" onClick={() => onWriteEs({ id: editing.id!, company: editing.form.company })}>
                <PenIcon size={16} /> {tr({ ja: "この企業のESを書く", en: "Write an ES for this company", fr: "Écrire une ES pour cette entreprise" })}
              </button>
            )}
            {editing.id && onPractice && (
              <button type="button" onClick={() => onPractice({ id: editing.id! })}><MicIcon size={16} /> {tr({ ja: "面接を練習する", en: "Practise the interview", fr: "S'entraîner à l'entretien" })}</button>
            )}
            {editing.id && (
              <button type="button" aria-expanded={mailing} onClick={() => setMailing((m) => !m)}><MailIcon size={16} /> {tr({ ja: "メールを書く", en: "Write an email", fr: "Écrire un mail" })}</button>
            )}
            {editing.id && <button type="button" className="danger" onClick={remove}>{tr({ ja: "削除", en: "Delete", fr: "Supprimer" })}</button>}
          </div>
          {editing.id && mailing && <EmailPanel applicationId={editing.id} steps={editing.form.steps} />}
          {!editing.id && fromBrowser !== null && (
            <p className="from-browser" role="status">{tr({
              ja: `${fromBrowser ? `${fromBrowser}から` : "ブラウザから"}追加された求人です。内容を確かめて、保存してください。`,
              en: `Job added from ${fromBrowser || "your browser"}. Check the details, then save.`,
              fr: `Offre ajoutée depuis ${fromBrowser || "le navigateur"}. Vérifiez puis enregistrez.`,
            })}</p>
          )}
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
          <CompanyFacts company={editing.form.company} corporateNumber={editing.form.corporateNumber}
            onLink={(m) => set({ corporateNumber: m?.corporateNumber ?? null, location: m?.location ?? null })} />
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
          <ListEditor title={tr({ ja: "フォローアップ", en: "Follow-ups", fr: "Relances" })} name="followUps" items={editing.form.followUps ?? []} fields={followUpFields}
            empty={{ id: crypto.randomUUID(), date: ymd(new Date()), note: "", done: false }} errors={errors}
            onChange={(followUps) => set({ followUps: followUps.map((f) => (f.id ? f : { ...f, id: crypto.randomUUID() })) })} />
          <ListEditor title={tr({ ja: "やりとりの記録", en: "Contact history", fr: "Historique des échanges" })} name="events" items={editing.form.events ?? []} fields={eventFields}
            empty={{ id: crypto.randomUUID(), date: ymd(new Date()), kind: "email", note: "" }} errors={errors}
            onChange={(events) => set({ events: events.map((ev) => (ev.id ? ev : { ...ev, id: crypto.randomUUID() })) })} />
        </form>
      )}
    </section>
  );
}
