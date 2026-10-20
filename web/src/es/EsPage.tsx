import { useEffect, useState } from "react";
import { createDraft, deleteDraft, listDrafts, updateDraft, type Draft, type DraftInput, type Issue } from "../api";
import { useAuth } from "../auth/auth";
import { countChars } from "./count";
import { ReviewPanel } from "./ReviewPanel";

const blank: DraftInput = { question: "", body: "" };

/** ES (S13) : liste à gauche, éditeur à droite, compteur de caractères en direct. */
export function EsPage() {
  const auth = useAuth();
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [selected, setSelected] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<DraftInput>(blank);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function token() {
    const t = await auth.getToken();
    if (!t) throw new Error("pas de jeton");
    return t;
  }

  useEffect(() => {
    token().then(listDrafts).then((r) => setDrafts(r.ok ? r.value : [])).catch(() => setDrafts([]));
    // Chargé une fois.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function open(d: Draft | "new") {
    setSelected(d === "new" ? "new" : d.id);
    setForm(d === "new" ? blank : { company: d.company, question: d.question, charLimit: d.charLimit, body: d.body });
    setIssues([]);
    setStatus("idle");
  }

  /** Enregistre l'ES ; renvoie son id, ou null si l'API l'a refusée. */
  async function save(): Promise<string | null> {
    setStatus("saving");
    try {
      const t = await token();
      const result = selected === "new" ? await createDraft(t, form) : await updateDraft(t, selected!, form);
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

  return (
    <section className="es">
      <aside>
        <button className="primary" onClick={() => open("new")}>＋ 新しいES / New</button>
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

      {selected !== null && (
        <form className="editor" onSubmit={(e) => { e.preventDefault(); save(); }} noValidate>
          <div className="grid">
            <label>
              <span>企業 / Company（空欄＝共通 / blank = general）</span>
              <input value={form.company ?? ""} onChange={(e) => edit({ company: e.target.value })} />
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
            prepare={prepare}
            onApply={(quote, suggestion) => edit({ body: form.body.replace(quote, suggestion) })}
          />
        </form>
      )}
    </section>
  );
}
