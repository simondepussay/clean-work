import { useEffect, useRef, useState } from "react";
import { createDraft, deleteDraft, listApplications, listDrafts, updateDraft, type Application, type Draft, type DraftInput, type Issue } from "../api";
import { useAuth } from "../auth/auth";
import { countChars } from "./count";
import { GuidePanel, Intro } from "./GuidePanel";
import { LANGS, useGuide, useHelpLanguage, type GuideType } from "./guide";
import { ReviewPanel } from "./ReviewPanel";
import { CheckIcon, PlusIcon } from "../icons";

const blank: DraftInput = { question: "", body: "" };

/** Ouverture depuis une candidature : nouvelle ES pour cette entreprise (nonce = nouvelle demande). */
export type EsSeed = { company: string; applicationId: string; nonce: number };

/** ES (S13) : liste à gauche, éditeur à droite, compteur de caractères en direct. */
export function EsPage({ seed }: { seed?: EsSeed } = {}) {
  const auth = useAuth();
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [selected, setSelected] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<DraftInput>(blank);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [choosing, setChoosing] = useState(false);
  const [apps, setApps] = useState<Application[]>([]);
  const pendingSeed = useRef<EsSeed | null>(null);
  const guide = useGuide();
  const [lang, setLang] = useHelpLanguage();

  async function token() {
    const t = await auth.getToken();
    if (!t) throw new Error("pas de jeton");
    return t;
  }

  useEffect(() => {
    token().then(listDrafts).then((r) => setDrafts(r.ok ? r.value : [])).catch(() => setDrafts([]));
    token().then(listApplications).then((r) => r.ok && Array.isArray(r.value) && setApps(r.value)).catch(() => {});
    // Chargé une fois.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Venu d'une candidature : on propose directement le choix du type de question.
  useEffect(() => {
    if (!seed) return;
    pendingSeed.current = seed;
    setChoosing(true);
  }, [seed]);

  function open(d: Draft) {
    setSelected(d.id);
    setForm({ kind: d.kind, applicationId: d.applicationId, company: d.company, question: d.question, charLimit: d.charLimit, body: d.body });
    setIssues([]);
    setStatus("idle");
    setChoosing(false);
  }

  /** Nouvelle ES à partir d'un type de question (ou libre) : question et limite préremplies. */
  function start(type: GuideType | null) {
    const from = pendingSeed.current;
    pendingSeed.current = null;
    const company = from ? { company: from.company, applicationId: from.applicationId } : {};
    setSelected("new");
    setForm(type ? { kind: type.id, question: type.question, charLimit: type.charLimit, body: "", ...company } : { ...blank, kind: "free", ...company });
    setIssues([]);
    setStatus("idle");
    setChoosing(false);
  }

  /** Enregistre l'ES ; renvoie son id, ou null si l'API l'a refusée. */
  async function save(): Promise<string | null> {
    setStatus("saving");
    try {
      const t = await token();
      // Reliée à la candidature dont le nom correspond ; sinon ES commune (null délie).
      const linked = apps.find((a) => a.company === form.company?.trim());
      const payload = { ...form, applicationId: linked?.id ?? null };
      const result = selected === "new" ? await createDraft(t, payload) : await updateDraft(t, selected!, payload);
      if (!result.ok) {
        setIssues(result.issues);
        setStatus("idle");
        return null;
      }
      const saved = result.value;
      setDrafts((all) => [saved, ...(all ?? []).filter((d) => d.id !== saved.id)]);
      setSelected(saved.id);
      setIssues([]);
      setStatus("saved");
      return saved.id;
    } catch {
      setStatus("error");
      return null;
    }
  }

  /** Avant une relecture : enregistre si le texte a changé depuis le dernier enregistrement. */
  async function prepare() {
    if (selected !== "new" && selected !== null && status === "saved") return selected;
    return save();
  }

  async function remove() {
    if (selected === null || selected === "new") return;
    if (!window.confirm("このESを削除しますか？ / Delete this entry sheet?")) return;
    try {
      await deleteDraft(await token(), selected);
      setDrafts((all) => (all ?? []).filter((d) => d.id !== selected));
      setSelected(null);
    } catch {
      setStatus("error");
    }
  }

  const error = (path: string) => issues.find((i) => i.path === path)?.message;
  const count = countChars(form.body);
  const over = form.charLimit !== undefined && count > form.charLimit;
  const edit = (patch: Partial<DraftInput>) => {
    setForm((f) => ({ ...f, ...patch }));
    if (status === "saved") setStatus("idle");
  };

  if (drafts === null) return <p className="muted">…</p>;

  const type = guide?.types.find((t) => t.id === form.kind);

  return (
    <>
    <div className="help-bar">
      <label className="inline">
        <span>解説の言語 / Help language</span>
        <select value={lang} onChange={(e) => setLang(e.target.value as typeof lang)}>
          {LANGS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
        </select>
      </label>
    </div>
    {guide && <Intro guide={guide} lang={lang} />}
    <section className="es">
      <aside>
        <button className="primary" onClick={() => setChoosing(true)}><PlusIcon size={16} /> 新しいES / New</button>
        <ul aria-label="ES">
          {drafts.map((d) => (
            <li key={d.id}>
              <button className={d.id === selected ? "current" : undefined} onClick={() => open(d)}>
                <strong>{d.company || "共通 / General"}</strong>
                <span>{d.question}</span>
              </button>
            </li>
          ))}
          {drafts.length === 0 && <li className="muted">まだESがありません / No entry sheets yet</li>}
        </ul>
      </aside>

      {choosing && (
        <div className="kinds" role="group" aria-label="設問のタイプ / Question type">
          <h3>設問のタイプを選ぶ / Choose the type of question</h3>
          {guide?.types.map((t) => (
            <button key={t.id} onClick={() => start(t)}>
              <strong>{t.label.ja}</strong>
              <span>{t.label[lang]} · {t.charLimit}字</span>
              <span className="muted">{t.purpose[lang]}</span>
            </button>
          ))}
          <button onClick={() => start(null)}>
            <strong>自由 / Other</strong>
            <span className="muted">設問を自分で入力 / Type the question yourself</span>
          </button>
        </div>
      )}

      {!choosing && selected !== null && (
        <form className="editor" onSubmit={(e) => { e.preventDefault(); save(); }} noValidate>
          <div className="grid">
            <label>
              <span>企業 / Company（空欄＝共通 / blank = general）</span>
              <input value={form.company ?? ""} list="es-companies" onChange={(e) => edit({ company: e.target.value })} />
              <datalist id="es-companies">{apps.map((a) => <option key={a.id} value={a.company} />)}</datalist>
              {apps.some((a) => a.company === form.company?.trim()) && <small className="linked"><CheckIcon size={13} /> 応募と連携 / Linked to your application</small>}
            </label>
            <label className={error("charLimit") ? "invalid" : undefined}>
              <span>文字数制限 / Character limit</span>
              <input type="number" min={1} max={5000} value={form.charLimit ?? ""}
                onChange={(e) => edit({ charLimit: e.target.value === "" ? undefined : Number(e.target.value) })} />
              {error("charLimit") && <small role="alert">{error("charLimit")}</small>}
            </label>
          </div>
          <label className={error("question") ? "invalid" : undefined}>
            <span>設問 / Question *</span>
            <input value={form.question} onChange={(e) => edit({ question: e.target.value })} />
            {error("question") && <small role="alert">{error("question")}</small>}
          </label>
          {guide && type && <GuidePanel guide={guide} type={type} lang={lang} />}
          <label>
            <span>本文 / Answer</span>
            <textarea rows={12} value={form.body} onChange={(e) => edit({ body: e.target.value })} />
          </label>
          <p className={over ? "count over" : "count"} aria-live="polite">
            {count}{form.charLimit ? ` / ${form.charLimit}` : ""}字
            {over && ` — ${count - form.charLimit!}字オーバー / ${count - form.charLimit!} over`}
          </p>
          <div className="actions">
            <button className="primary" type="submit" disabled={status === "saving"}>保存 / Save</button>
            {selected !== "new" && <button type="button" className="danger" onClick={remove}>削除 / Delete</button>}
            <span role="status" className="muted">
              {status === "saved" && "保存しました / Saved"}
              {status === "error" && "エラー / Error"}
            </span>
          </div>
          <ReviewPanel
            draftId={selected === "new" ? null : selected}
            body={form.body}
            language={lang}
            prepare={prepare}
            onApply={(quote, suggestion) => edit({ body: form.body.replace(quote, suggestion) })}
          />
        </form>
      )}
    </section>
    </>
  );
}
