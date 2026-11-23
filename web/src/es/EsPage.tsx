import { useEffect, useRef, useState } from "react";
import { Loader } from "../Loader";
import { createDraft, deleteDraft, listApplications, listDrafts, updateDraft, type Application, type Draft, type DraftInput, type Issue } from "../api";
import { useAuth } from "../auth/auth";
import { countChars } from "./count";
import { GuidePanel, Intro } from "./GuidePanel";
import { useGuide, type Guide, type GuideType, type Lang } from "./guide";
import { apiMessage, useTr } from "../i18n";
import { ReviewPanel } from "./ReviewPanel";
import { applyIssue } from "./apply";
import { CheckIcon, CloseIcon, CopyIcon, LightIcon, PlusIcon, SearchIcon } from "../icons";
import { runChecks, starterText, type CheckResult } from "./checks";
import { INDUSTRIES } from "../apps/statuses";

const blank: DraftInput = { question: "", body: "" };

/** Ouverture depuis une candidature : nouvelle ES pour cette entreprise (nonce = nouvelle demande). */
export type EsSeed = { company: string; applicationId: string; nonce: number };

/** ES (S13) : liste à gauche, éditeur à droite, compteur de caractères en direct. */
/** Nombre d'ES à partir duquel la liste propose une recherche, puis se range en dossiers par entreprise. */
const SEARCH_FROM = 5;
const GROUP_FROM = 8;

export function EsPage({ seed }: { seed?: EsSeed } = {}) {
  const auth = useAuth();
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [selected, setSelected] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<DraftInput>(blank);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [choosing, setChoosing] = useState(false);
  /** Recherche dans la liste, et dossiers d'entreprise dépliés à la main. */
  const [query, setQuery] = useState("");
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  // Le dossier de l'ES qu'on ouvre se déplie (on peut le replier ensuite).
  useEffect(() => {
    const current = drafts?.find((d) => d.id === selected);
    if (current) setOpenGroups((o) => new Set(o).add(current.company ?? ""));
    // À l'ouverture d'une ES seulement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);
  const [copied, setCopied] = useState(false);
  const [apps, setApps] = useState<Application[]>([]);
  const pendingSeed = useRef<EsSeed | null>(null);
  const guide = useGuide();
  const tr = useTr();
  const lang = tr.lang;

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
    setForm({ kind: d.kind, applicationId: d.applicationId, company: d.company, industry: d.industry, question: d.question, charLimit: d.charLimit, body: d.body });
    setIssues([]);
    setCopied(false);
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
    setCopied(false);
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
      const payload = { ...form, applicationId: linked?.id ?? null, industry: form.industry ?? null };
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
      setCopied(false);
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

  /** 別パターン : copie de l'ES ouverte, pas encore enregistrée (le cours conseille 2 ou 3 versions). */
  function duplicate() {
    setSelected("new");
    setIssues([]);
    setStatus("idle");
    setCopied(true);
  }

  async function remove() {
    if (selected === null || selected === "new") return;
    if (!window.confirm(tr({ ja: "このESを削除しますか？", en: "Delete this entry sheet?", fr: "Supprimer cette ES ?" }))) return;
    try {
      await deleteDraft(await token(), selected);
      setDrafts((all) => (all ?? []).filter((d) => d.id !== selected));
      setSelected(null);
    } catch {
      setStatus("error");
    }
  }

  const error = (path: string) => { const m = issues.find((i) => i.path === path)?.message; return m && apiMessage(m, lang); };
  const count = countChars(form.body);
  const over = form.charLimit !== undefined && count > form.charLimit;
  const edit = (patch: Partial<DraftInput>) => {
    setForm((f) => ({ ...f, ...patch }));
    if (status === "saved") setStatus("idle");
  };

  if (drafts === null) return <Loader />;

  // Liste : la plus récemment modifiée d'abord ; au-delà de quelques ES, recherche puis dossiers par entreprise.
  const owner = (d: Draft) => d.company || [tr({ ja: "共通", en: "General", fr: "Commune" }), ...INDUSTRIES.filter((i) => i.value === d.industry).map((i) => i[lang])].join(" · ");
  const searching = query.trim() !== "";
  const needle = query.trim().toLowerCase();
  const shown = [...drafts]
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))
    .filter((d) => !searching || [owner(d), d.question, d.body].some((t) => (t ?? "").toLowerCase().includes(needle)));
  const grouped = drafts.length > GROUP_FROM;
  const common = tr({ ja: "共通", en: "General", fr: "Commune" });
  // Clé d'un dossier : le nom de l'entreprise, ou « » pour les ES communes.
  const groups = [...shown.reduce((m, d) => m.set(d.company ?? "", [...(m.get(d.company ?? "") ?? []), d]), new Map<string, Draft[]>())]
    .map(([key, items]) => ({ key, name: key || common, items }))
    // Les ES communes en tête, puis les entreprises par ordre alphabétique : un dossier se retrouve toujours au même endroit.
    .sort((a, b) => (a.key === "" ? -1 : b.key === "" ? 1 : a.name.localeCompare(b.name, lang)));
  const item = (d: Draft, withOwner: boolean) => {
    const length = countChars(d.body ?? "");
    return (
      <button className={d.id === selected ? "current" : undefined} onClick={() => open(d)}>
        {withOwner && <strong>{owner(d)}</strong>}
        <span className={withOwner ? undefined : "es-question"}>{d.question}</span>
        {d.body?.trim() && <span className="excerpt">{d.body.trim().replace(/\s+/g, " ").slice(0, 40)}</span>}
        <span className="es-meta">{length}{d.charLimit ? ` / ${d.charLimit}` : ""}{tr({ ja: "字", en: " chars", fr: " car." })}</span>
      </button>
    );
  };

  const type = guide?.types.find((t) => t.id === form.kind);

  return (
    <>
    {guide && <Intro guide={guide} lang={lang} />}
    <section className="es">
      <aside>
        <button className="primary" onClick={() => setChoosing(true)}><PlusIcon size={16} /> {tr({ ja: "新しいES", en: "New entry sheet", fr: "Nouvelle ES" })}</button>
        {/* À partir de quelques ES, une recherche ; au-delà, un dossier par entreprise. */}
        {drafts.length > SEARCH_FROM && (
          <label className="es-search">
            <SearchIcon size={15} />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder={tr({ ja: "企業名・設問・本文で検索", en: "Search company, question, text", fr: "Chercher entreprise, question, texte" })}
              aria-label={tr({ ja: "ESを検索", en: "Search entry sheets", fr: "Chercher une ES" })} />
          </label>
        )}
        {grouped ? (
          <div className="es-groups" role="list" aria-label="ES">
            {groups.map((g) => (
              // Ouverts : les dossiers dépliés à la main, celui de l'ES qu'on vient d'ouvrir, et tous pendant une recherche.
              <details key={g.key} role="listitem" open={searching || openGroups.has(g.key)}
                onToggle={(e) => { const isOpen = e.currentTarget.open; if (!searching) setOpenGroups((o) => { const n = new Set(o); if (isOpen) n.add(g.key); else n.delete(g.key); return n; }); }}>
                <summary><strong>{g.name}</strong><span>{g.items.length}</span></summary>
                <ul>{g.items.map((d) => <li key={d.id}>{item(d, false)}</li>)}</ul>
              </details>
            ))}
            {groups.length === 0 && <p className="muted">{tr({ ja: "該当するESはありません", en: "No matching entry sheets", fr: "Aucune ES correspondante" })}</p>}
          </div>
        ) : (
          <ul aria-label="ES">
            {shown.map((d) => <li key={d.id}>{item(d, true)}</li>)}
            {drafts.length === 0 && <li className="muted">{tr({ ja: "まだESがありません", en: "No entry sheets yet", fr: "Pas encore d'ES" })}</li>}
            {drafts.length > 0 && shown.length === 0 && <li className="muted">{tr({ ja: "該当するESはありません", en: "No matching entry sheets", fr: "Aucune ES correspondante" })}</li>}
          </ul>
        )}
      </aside>

      {choosing && (
        <div className="kinds" role="group" aria-label={tr({ ja: "設問のタイプ", en: "Question type", fr: "Type de question" })}>
          <h3>{tr({ ja: "設問のタイプを選ぶ", en: "Choose the type of question", fr: "Choisissez le type de question" })}</h3>
          {guide?.types.map((t) => (
            <button key={t.id} onClick={() => start(t)}>
              <strong>{t.label.ja}</strong>
              <span>{t.label[lang]} · {tr({ ja: `${t.charLimit}字`, en: `${t.charLimit} characters`, fr: `${t.charLimit} caractères` })}</span>
              <span className="muted">{t.purpose[lang]}</span>
            </button>
          ))}
          <button onClick={() => start(null)}>
            <strong>{tr({ ja: "自由", en: "Other", fr: "Autre" })}</strong>
            <span className="muted">{tr({ ja: "設問を自分で入力", en: "Type the question yourself", fr: "Saisir la question vous-même" })}</span>
          </button>
        </div>
      )}

      {!choosing && selected !== null && (
        <form className="editor" onSubmit={(e) => { e.preventDefault(); save(); }} noValidate>
          <div className="grid">
            <label>
              <span>{tr({ ja: "企業（空欄＝共通）", en: "Company (blank = general)", fr: "Entreprise (vide = commune)" })}</span>
              <input value={form.company ?? ""} list="es-companies" onChange={(e) => edit({ company: e.target.value })} />
              <datalist id="es-companies">{apps.map((a) => <option key={a.id} value={a.company} />)}</datalist>
              {apps.some((a) => a.company === form.company?.trim()) && <small className="linked"><CheckIcon size={13} /> {tr({ ja: "応募と連携", en: "Linked to your application", fr: "Liée à votre candidature" })}</small>}
            </label>
            {/* Le secteur d'une ES liée vient de la candidature ; une ES commune peut viser un secteur (自己PR). */}
            {!apps.some((a) => a.company === form.company?.trim()) && (
              <label>
                <span>{tr({ ja: "業界（共通のES）", en: "Industry (general ES)", fr: "Secteur (ES commune)" })}</span>
                <select value={form.industry ?? ""} onChange={(e) => edit({ industry: (e.target.value || null) as DraftInput["industry"] })}>
                  <option value="">{tr({ ja: "指定なし", en: "Any", fr: "Tous" })}</option>
                  {INDUSTRIES.map((i) => <option key={i.value} value={i.value}>{i[lang]}</option>)}
                </select>
              </label>
            )}
            <label className={error("charLimit") ? "invalid" : undefined}>
              <span>{tr({ ja: "文字数制限", en: "Character limit", fr: "Limite de caractères" })}</span>
              <input type="number" min={1} max={5000} value={form.charLimit ?? ""}
                onChange={(e) => edit({ charLimit: e.target.value === "" ? undefined : Number(e.target.value) })} />
              {error("charLimit") && <small role="alert">{error("charLimit")}</small>}
            </label>
          </div>
          <label className={error("question") ? "invalid" : undefined}>
            <span>{tr({ ja: "設問", en: "Question", fr: "Question" })} *</span>
            <input value={form.question} onChange={(e) => edit({ question: e.target.value })} />
            {error("question") && <small role="alert">{error("question")}</small>}
          </label>
          {guide && type && <GuidePanel guide={guide} type={type} lang={lang} />}
          <label>
            <span>{tr({ ja: "本文", en: "Answer", fr: "Réponse" })}</span>
            <textarea rows={12} value={form.body} onChange={(e) => edit({ body: e.target.value })} />
          </label>
          {guide && type?.starter && !form.body.trim() && (
            <Starter guide={guide} starter={type.starter} lang={lang} onStart={(text) => edit({ body: text })} />
          )}
          <p className={over ? "count over" : "count"} aria-live="polite">
            {count}{form.charLimit ? ` / ${form.charLimit}` : ""}{tr({ ja: "字", en: " characters", fr: " caractères" })}
            {over && tr({ ja: ` — ${count - form.charLimit!}字オーバー`, en: ` — ${count - form.charLimit!} over`, fr: ` — ${count - form.charLimit!} de trop` })}
          </p>
          {guide && <Checklist results={runChecks(guide, form.kind, form.body)} lang={lang} />}
          {copied && <p className="muted" role="status">{tr({ ja: "コピーを作りました。書き直して保存すると、別のESになります。", en: "Copy made. Rewrite it and save: it becomes a separate entry sheet.", fr: "Copie créée. Réécrivez-la et enregistrez : elle devient une ES à part." })}</p>}
          <div className="actions">
            <button className="primary" type="submit" disabled={status === "saving"}>{tr({ ja: "保存", en: "Save", fr: "Enregistrer" })}</button>
            {selected !== "new" && <button type="button" onClick={duplicate}><CopyIcon size={16} /> {tr({ ja: "別パターンを作る", en: "Make another version", fr: "Créer une autre version" })}</button>}
            {selected !== "new" && <button type="button" className="danger" onClick={remove}>{tr({ ja: "削除", en: "Delete", fr: "Supprimer" })}</button>}
            <span role="status" className="muted">
              {status === "saved" && tr({ ja: "保存しました", en: "Saved", fr: "Enregistré" })}
              {status === "error" && tr({ ja: "エラー", en: "Error", fr: "Erreur" })}
            </span>
          </div>
          <ReviewPanel
            draftId={selected === "new" ? null : selected}
            body={form.body}
            language={lang}
            prepare={prepare}
            onApply={(quote, suggestion) => {
              const next = applyIssue(form.body, quote, suggestion);
              if (next !== null) edit({ body: next });
            }}
          />
        </form>
      )}
    </section>
    </>
  );
}

const MARK: Record<CheckResult["state"], { label: Record<Lang, string> }> = {
  bad: { label: { ja: "直す", en: "Fix", fr: "À corriger" } },
  warn: { label: { ja: "確認", en: "Check", fr: "À vérifier" } },
  tip: { label: { ja: "ヒント", en: "Tip", fr: "Conseil" } },
  good: { label: { ja: "OK", en: "Good", fr: "Bien" } },
};

/**
 * Checklist instantanée, sans IA : les règles du cours appliquées pendant la frappe.
 * Elle repère des mots, pas le sens ; la relecture IA, plus bas, reste le vrai avis.
 */
function Checklist({ results, lang }: { results: CheckResult[]; lang: Lang }) {
  if (results.length === 0) return null;
  const title = { ja: "チェックリスト", en: "Checklist", fr: "Checklist" }[lang];
  return (
    <section className="checklist" aria-label={title}>
      <ul aria-live="polite">
        {results.map((r) => (
          <li key={r.id} className={r.state}>
            <span className="mark" aria-label={MARK[r.state].label[lang]}>
              {r.state === "bad" ? <CloseIcon size={14} /> : r.state === "good" ? <CheckIcon size={14} /> : r.state === "tip" ? <LightIcon size={14} /> : "!"}
            </span>
            {r.text[lang]}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Début 3部構成 : choisir 1 ou 2 mots-clés (le cours : 2 au plus), puis insérer le squelette. */
function Starter({ guide, starter, lang, onStart }: { guide: Guide; starter: { one: string; two: string }; lang: Lang; onStart: (text: string) => void }) {
  const [picked, setPicked] = useState<string[]>([]);
  const toggle = (k: string) =>
    setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : p.length < 2 ? [...p, k] : p));
  const t = (x: Record<Lang, string>) => x[lang];
  return (
    <div className="starter">
      <p><strong>{t({ ja: "3部構成で書き始める", en: "Start with the 3-part structure", fr: "Commencer avec la structure en 3 parties" })}</strong>
        {" "}<span className="muted">{t({ ja: "キーワード → エピソード → 自分の想い。強みは1〜2つまで。", en: "Keyword → episode → what you feel. 1 or 2 strengths at most.", fr: "Mot-clé → épisode → ce que vous en pensez. 1 ou 2 qualités au plus." })}</span></p>
      <div className="chips" role="group" aria-label={t({ ja: "強み", en: "Strengths", fr: "Qualités" })}>
        {(guide.keywords ?? []).map((k) => (
          <button type="button" key={k.ja} aria-pressed={picked.includes(k.ja)} title={lang === "ja" ? undefined : k[lang]}
            disabled={!picked.includes(k.ja) && picked.length >= 2} onClick={() => toggle(k.ja)}>{k.ja}</button>
        ))}
      </div>
      <button type="button" onClick={() => onStart(starterText(starter, picked))}>
        {t({ ja: "この構成で書き始める", en: "Start writing", fr: "Commencer à écrire" })}
      </button>
    </div>
  );
}
