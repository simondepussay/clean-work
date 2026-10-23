import { useEffect, useState } from "react";
import { getUsage, listReviews, reviewDraft, type Review, type ReviewOutcome, type Usage } from "../api";
import { useAuth } from "../auth/auth";
import { diff, stats } from "./diff";
import { ArrowRightIcon, CheckIcon } from "../icons";
import { useTr, type T3, type Tr } from "../i18n";

const CATEGORY: Record<string, T3> = {
  keigo: { ja: "敬語", en: "Keigo", fr: "Keigo (politesse)" },
  grammar: { ja: "文法", en: "Grammar", fr: "Grammaire" },
  wording: { ja: "表現", en: "Wording", fr: "Formulation" },
  structure: { ja: "構成", en: "Structure", fr: "Structure" },
  star: { ja: "STAR", en: "STAR", fr: "STAR" },
  length: { ja: "文字数", en: "Length", fr: "Longueur" },
};

const LOCALE = { ja: "ja-JP", en: "en-US", fr: "fr-FR" } as const;

function refusal(outcome: Exclude<ReviewOutcome, { ok: true }>, tr: Tr) {
  const day = (iso: string) => new Date(iso).toLocaleDateString(LOCALE[tr.lang]);
  if (outcome.error === "limit") {
    const d = day(outcome.retryAfter);
    if (outcome.reason === "budget") return tr({ ja: `今月のAI添削は終了しました。${d}から再開します`, en: `AI review is paused until ${d}`, fr: `La relecture par IA reprendra le ${d}` });
    return outcome.reason === "day"
      ? tr({ ja: `今日の添削回数の上限です。${d}から使えます`, en: `Today's limit is reached; available again on ${d}`, fr: `Limite du jour atteinte ; de nouveau disponible le ${d}` })
      : tr({ ja: `今月の添削回数の上限です。${d}から使えます`, en: `This month's limit is reached; available again on ${d}`, fr: `Limite du mois atteinte ; de nouveau disponible le ${d}` });
  }
  if (outcome.error === "empty") return tr({ ja: "本文を入力してください", en: "Write your answer first", fr: "Écrivez d'abord votre réponse" });
  if (outcome.error === "ai_not_configured") return tr({ ja: "AI添削は準備中です", en: "AI review is not available yet", fr: "La relecture par IA n'est pas encore disponible" });
  return tr({ ja: "AI添削に失敗しました。回数は使われていません", en: "The review failed; it was not counted", fr: "La relecture a échoué ; elle n'a pas été comptée" });
}

/**
 * Relecture par IA d'une ES (S14). `prepare` enregistre l'ES si besoin et renvoie son id ;
 * `onApply` remplace un passage du texte par la correction proposée.
 */
export function ReviewPanel({ draftId, body, language, prepare, onApply }: {
  draftId: string | null;
  /** Texte actuel, pour montrer ce qui a changé depuis une relecture (S15). */
  body: string;
  /** Langue des explications : celle de l'aide, choisie en haut de la page. */
  language: string;
  prepare: () => Promise<string | null>;
  onApply: (quote: string, suggestion: string) => void;
}) {
  const auth = useAuth();
  const tr = useTr();
  const [usage, setUsage] = useState<Usage | null>(null);
  /** Toutes les relectures de l'ES, la plus récente d'abord (S15). */
  const [history, setHistory] = useState<Review[]>([]);
  const [shown, setShown] = useState(0);
  const review = history[shown] ?? null;
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [applied, setApplied] = useState<Set<number>>(new Set());

  useEffect(() => {
    setHistory([]);
    setShown(0);
    setApplied(new Set());
    setMessage(null);
    auth.getToken().then(async (t) => {
      if (!t) return;
      const u = await getUsage(t);
      if (u.ok) setUsage(u.value);
      if (draftId) {
        const r = await listReviews(t, draftId);
        if (r.ok) setHistory(r.value);
      }
    }).catch(() => {});
    // On recharge quand on change d'ES.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId]);

  async function run() {
    setBusy(true);
    setMessage(null);
    try {
      const id = await prepare();
      const token = await auth.getToken();
      if (!id || !token) throw new Error("ES non enregistrée");
      const outcome = await reviewDraft(token, id, language);
      if (outcome.ok) {
        setHistory((h) => [outcome.review, ...h]);
        setShown(0);
        setApplied(new Set());
      } else {
        setMessage(refusal(outcome, tr));
      }
      const u = await getUsage(token);
      if (u.ok) setUsage(u.value);
    } catch {
      setMessage(refusal({ ok: false, error: "ai_failed" }, tr));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="review" aria-label={tr({ ja: "AI添削", en: "AI review", fr: "Relecture par IA" })}>
      <div className="review-bar">
        <button type="button" className="primary" onClick={run} disabled={busy || usage?.today === 0}>
          {busy ? tr({ ja: "添削中…", en: "Reviewing…", fr: "Relecture…" }) : tr({ ja: "AI添削", en: "AI review", fr: "Relecture par IA" })}
        </button>
        {usage && <span className="muted">{tr({ ja: `残り：今日 ${usage.today} · 今月 ${usage.month}`, en: `Left: ${usage.today} today · ${usage.month} this month`, fr: `Reste : ${usage.today} aujourd'hui · ${usage.month} ce mois-ci` })}</span>}
      </div>
      {message && <p role="alert" className="notice">{message}</p>}

      {history.length > 0 && (
        <div className="history" role="group" aria-label={tr({ ja: "履歴", en: "History", fr: "Historique" })}>
          <span className="muted">{tr({ ja: "履歴", en: "History", fr: "Historique" })}</span>
          {[...history].reverse().map((r, k) => {
            const index = history.length - 1 - k;
            return (
              <button key={r.id} type="button" aria-pressed={index === shown} onClick={() => { setShown(index); setApplied(new Set()); }}
                title={new Date(r.createdAt).toLocaleString(LOCALE[tr.lang])}>
                {r.score}
              </button>
            );
          })}
        </div>
      )}

      {review && <Changes since={review} body={body} tr={tr} />}

      {review && (
        <div className="result">
          <p className="score"><strong>{review.score}</strong> / 100 <span className="muted">{new Date(review.createdAt).toLocaleString(LOCALE[tr.lang])}</span></p>
          <p>{review.summary}</p>
          {review.strengths.length > 0 && (
            <ul className="strengths">{review.strengths.map((s) => <li key={s}><CheckIcon size={15} /> {s}</li>)}</ul>
          )}
          <ol className="issues">
            {review.issues.map((issue, i) => (
              <li key={i}>
                <span className="tag">{CATEGORY[issue.category] ? tr(CATEGORY[issue.category]) : issue.category}</span>
                <p><mark>{issue.quote}</mark> <ArrowRightIcon size={14} /> <ins>{issue.suggestion}</ins></p>
                <p className="muted">{issue.problem}</p>
                <button type="button" disabled={applied.has(i)}
                  onClick={() => { onApply(issue.quote, issue.suggestion); setApplied((a) => new Set(a).add(i)); }}>
                  {applied.has(i) ? tr({ ja: "適用済み", en: "Applied", fr: "Appliqué" }) : tr({ ja: "適用", en: "Apply", fr: "Appliquer" })}
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}

/** Ce qui a changé dans le texte depuis une relecture (S15). */
function Changes({ since, body, tr }: { since: Review; body: string; tr: Tr }) {
  if (since.bodySnapshot === body) {
    return <p className="muted changes-none">{tr({ ja: "この添削のあと、本文は変わっていません", en: "No changes since this review", fr: "Aucune modification depuis cette relecture" })}</p>;
  }
  const parts = diff(since.bodySnapshot, body);
  const { added, removed } = stats(parts);
  return (
    <details className="changes" open>
      <summary>{tr({ ja: "この添削からの変更", en: "Changes since this review", fr: "Modifications depuis cette relecture" })} <span className="muted">+{added} / −{removed}</span></summary>
      <p className="diff" lang="ja">
        {parts.map((p, i) =>
          p.type === "same" ? <span key={i}>{p.text}</span>
            : p.type === "add" ? <ins key={i}>{p.text}</ins>
            : <del key={i}>{p.text}</del>)}
      </p>
    </details>
  );
}
