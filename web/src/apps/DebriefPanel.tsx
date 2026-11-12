import { useEffect, useState } from "react";
import { adviseDebrief, getDebriefUsage, updateApplication, type AdviceOutcome, type Application, type Debrief, type Usage } from "../api";
import { useAuth } from "../auth/auth";
import { ymd } from "../home/agenda";
import { CheckIcon, LightIcon, MicIcon, PlusIcon, TrashIcon } from "../icons";
import { useTr, type Tr } from "../i18n";
import { stepTypes } from "./statuses";

const LOCALE = { ja: "ja-JP", en: "en-US", fr: "fr-FR" } as const;
const INTERVIEWS = new Set(["interview1", "interview2", "final"]);

function refusal(outcome: Exclude<AdviceOutcome, { ok: true }>, tr: Tr) {
  if (outcome.error === "limit") {
    const d = new Date(outcome.retryAfter).toLocaleDateString(LOCALE[tr.lang]);
    if (outcome.reason === "budget") return tr({ ja: `今月のAI機能は終了しました。${d}から再開します`, en: `AI features are paused until ${d}`, fr: `Les fonctions IA reprendront le ${d}` });
    return outcome.reason === "day"
      ? tr({ ja: `今日の上限です。${d}から使えます`, en: `Today's limit is reached; available again on ${d}`, fr: `Limite du jour atteinte ; de nouveau disponible le ${d}` })
      : tr({ ja: `今月の上限です。${d}から使えます`, en: `This month's limit is reached; available again on ${d}`, fr: `Limite du mois atteinte ; de nouveau disponible le ${d}` });
  }
  if (outcome.error === "empty") return tr({ ja: "先に振り返りを書いてください", en: "Write your notes first", fr: "Écrivez d'abord vos notes" });
  if (outcome.error === "ai_not_configured") return tr({ ja: "AIのアドバイスは準備中です", en: "AI advice is not available yet", fr: "Les conseils de l'IA ne sont pas encore disponibles" });
  return tr({ ja: "アドバイスの作成に失敗しました。回数は使われていません", en: "The advice failed; it was not counted", fr: "Les conseils ont échoué ; rien n'a été compté" });
}

/**
 * 面接の振り返り : après un vrai entretien, noter les questions posées, ce qui a marché et ce qui a coincé.
 * L'IA en tire des conseils et les questions à préparer pour le tour suivant ; l'entretien simulé s'en sert aussi.
 * Chaque bilan s'enregistre à part du reste de la fiche (seul le champ debriefs est envoyé).
 */
export function DebriefPanel({ application, onChange, onPractice }: {
  application: Application;
  onChange: (app: Application) => void;
  onPractice?: () => void;
}) {
  const auth = useAuth();
  const tr = useTr();
  const [debriefs, setDebriefs] = useState<Debrief[]>(application.debriefs ?? []);
  /** Bilans modifiés depuis le dernier enregistrement. */
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ id: string; text: string } | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);

  useEffect(() => {
    auth.getToken().then(async (t) => {
      const u = t ? await getDebriefUsage(t) : null;
      if (u?.ok) setUsage(u.value);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const names = new Map(stepTypes(tr.lang).map((o) => [o.value, o.label]));
  const interviews = application.steps.filter((s) => INTERVIEWS.has(s.type));
  const patch = (id: string, change: Partial<Debrief>) => {
    setDebriefs((all) => all.map((d) => (d.id === id ? { ...d, ...change } : d)));
    setDirty((s) => new Set(s).add(id));
  };

  function add() {
    // Par défaut : le dernier entretien déjà passé.
    const today = ymd(new Date());
    const last = [...interviews].filter((s) => s.dueDate && s.dueDate <= today).sort((a, b) => b.dueDate!.localeCompare(a.dueDate!))[0];
    const fresh: Debrief = { id: crypto.randomUUID(), date: last?.dueDate ?? today, questions: "", ...(last ? { stepId: last.id } : {}) };
    setDebriefs((all) => [fresh, ...all]);
    setDirty((s) => new Set(s).add(fresh.id));
  }

  async function persist(list: Debrief[]): Promise<Application | null> {
    const token = await auth.getToken();
    if (!token) return null;
    const r = await updateApplication(token, application.id, { debriefs: list.map((d) => ({ ...d, good: d.good?.trim() || undefined, improve: d.improve?.trim() || undefined })) });
    if (!r.ok) return null;
    setDebriefs(r.value.debriefs ?? list);
    setDirty(new Set());
    onChange(r.value);
    return r.value;
  }

  const failed = (id: string) => setMessage({ id, text: tr({ ja: "保存できませんでした", en: "Could not save", fr: "Enregistrement impossible" }) });

  async function save(id: string) {
    setBusy(id);
    setMessage(null);
    try { if (!(await persist(debriefs))) failed(id); } catch { failed(id); } finally { setBusy(null); }
  }

  async function remove(id: string) {
    if (!window.confirm(tr({ ja: "この振り返りを削除しますか？", en: "Delete this debrief?", fr: "Supprimer ce bilan ?" }))) return;
    const rest = debriefs.filter((d) => d.id !== id);
    setBusy(id);
    try { if (!(await persist(rest))) failed(id); } catch { failed(id); } finally { setBusy(null); }
  }

  async function advise(id: string) {
    setBusy(id);
    setMessage(null);
    try {
      // Les notes sont enregistrées d'abord : l'IA lit ce qui est sur le serveur.
      if (dirty.size > 0 && !(await persist(debriefs))) return failed(id);
      const token = await auth.getToken();
      if (!token) throw new Error("pas de jeton");
      const outcome = await adviseDebrief(token, application.id, id, tr.lang);
      if (outcome.ok) {
        setDebriefs(outcome.application.debriefs ?? []);
        onChange(outcome.application);
        if (outcome.remaining) setUsage(outcome.remaining);
      } else {
        setMessage({ id, text: refusal(outcome, tr) });
      }
    } catch {
      setMessage({ id, text: refusal({ ok: false, error: "ai_failed" }, tr) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="debrief-panel" aria-label={tr({ ja: "面接の振り返り", en: "Interview debrief", fr: "Bilan d'entretien" })}>
      <div className="review-bar">
        <button type="button" onClick={add}><PlusIcon size={15} /> {tr({ ja: "振り返りを書く", en: "Write a debrief", fr: "Écrire un bilan" })}</button>
        {usage && <span className="muted">{tr({ ja: `AIアドバイス 残り：今日 ${usage.today} · 今月 ${usage.month}`, en: `AI advice left: ${usage.today} today · ${usage.month} this month`, fr: `Conseils IA restants : ${usage.today} aujourd'hui · ${usage.month} ce mois-ci` })}</span>}
      </div>
      {debriefs.length === 0 && (
        <p className="muted">{tr({ ja: "面接が終わったら、聞かれた質問をすぐメモしましょう。次の選考の準備に使えます。", en: "Right after an interview, note the questions you were asked. They prepare you for the next round.", fr: "Juste après un entretien, notez les questions posées : elles préparent le tour suivant." })}</p>
      )}
      {debriefs.map((d) => {
        const empty = !d.questions.trim() && !d.good?.trim() && !d.improve?.trim();
        return (
          <article key={d.id} className="debrief">
            <div className="grid">
              <label>
                <span>{tr({ ja: "日付", en: "Date", fr: "Date" })}</span>
                <input type="date" value={d.date} onChange={(e) => e.target.value && patch(d.id, { date: e.target.value })} />
              </label>
              {interviews.length > 0 && (
                <label>
                  <span>{tr({ ja: "どの面接", en: "Which interview", fr: "Quel entretien" })}</span>
                  <select value={d.stepId ?? ""} onChange={(e) => patch(d.id, { stepId: e.target.value || undefined })}>
                    <option value="">—</option>
                    {interviews.map((s) => <option key={s.id} value={s.id}>{[names.get(s.type) ?? s.type, s.dueDate?.slice(5).replace("-", "/")].filter(Boolean).join(" ")}</option>)}
                  </select>
                </label>
              )}
            </div>
            <label>
              <span>{tr({ ja: "聞かれた質問（1行に1つ）", en: "Questions you were asked (one per line)", fr: "Questions posées (une par ligne)" })}</span>
              <textarea rows={4} maxLength={1500} value={d.questions} onChange={(e) => patch(d.id, { questions: e.target.value })} />
            </label>
            <div className="grid">
              <label>
                <span>{tr({ ja: "うまくいったこと", en: "What went well", fr: "Ce qui a bien marché" })}</span>
                <textarea rows={2} maxLength={800} value={d.good ?? ""} onChange={(e) => patch(d.id, { good: e.target.value })} />
              </label>
              <label>
                <span>{tr({ ja: "うまく答えられなかったこと", en: "What was hard to answer", fr: "Ce qui a été difficile" })}</span>
                <textarea rows={2} maxLength={800} value={d.improve ?? ""} onChange={(e) => patch(d.id, { improve: e.target.value })} />
              </label>
            </div>
            <div className="actions">
              <button type="button" onClick={() => save(d.id)} disabled={busy !== null || !dirty.has(d.id)}>
                {dirty.has(d.id) ? tr({ ja: "振り返りを保存", en: "Save the debrief", fr: "Enregistrer le bilan" }) : <><CheckIcon size={14} /> {tr({ ja: "保存済み", en: "Saved", fr: "Enregistré" })}</>}
              </button>
              <button type="button" className="primary" onClick={() => advise(d.id)} disabled={busy !== null || empty || usage?.today === 0}>
                <LightIcon size={15} /> {busy === d.id ? tr({ ja: "作成中…", en: "Working…", fr: "En cours…" }) : d.advice ? tr({ ja: "アドバイスを更新", en: "Refresh the advice", fr: "Actualiser les conseils" }) : tr({ ja: "AIのアドバイス", en: "AI advice", fr: "Conseils de l'IA" })}
              </button>
              <button type="button" className="icon-button" onClick={() => remove(d.id)} disabled={busy !== null} aria-label={tr({ ja: "振り返りを削除", en: "Delete the debrief", fr: "Supprimer le bilan" })}><TrashIcon size={15} /></button>
            </div>
            {message?.id === d.id && <p role="alert" className="notice">{message.text}</p>}
            {d.advice && (
              <div className="debrief-advice">
                <p>{d.advice.summary}</p>
                {d.advice.tips.length > 0 && (
                  <>
                    <h4>{tr({ ja: "次に向けて", en: "For next time", fr: "Pour la prochaine fois" })}</h4>
                    <ul>{d.advice.tips.map((t) => <li key={t}>{t}</li>)}</ul>
                  </>
                )}
                {d.advice.practice.length > 0 && (
                  <>
                    <h4>{tr({ ja: "準備しておきたい質問", en: "Questions to prepare", fr: "Questions à préparer" })}</h4>
                    <ol lang="ja">{d.advice.practice.map((q) => <li key={q}>{q}</li>)}</ol>
                  </>
                )}
                {onPractice && (
                  <button type="button" onClick={onPractice}><MicIcon size={15} /> {tr({ ja: "この内容で面接を練習する", en: "Practise with this", fr: "S'entraîner avec ce bilan" })}</button>
                )}
              </div>
            )}
          </article>
        );
      })}
    </section>
  );
}
