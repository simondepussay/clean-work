import { useEffect, useState } from "react";
import { getUsage, listReviews, reviewDraft, type Review, type ReviewOutcome, type Usage } from "../api";
import { useAuth } from "../auth/auth";
import { diff, stats } from "./diff";
import { ArrowRightIcon, CheckIcon } from "../icons";

const CATEGORY: Record<string, string> = {
  keigo: "敬語 / Keigo",
  grammar: "文法 / Grammar",
  wording: "表現 / Wording",
  structure: "構成 / Structure",
  star: "STAR",
  length: "文字数 / Length",
};

const day = (iso: string) => new Date(iso).toLocaleDateString("ja-JP");

function refusal(outcome: Exclude<ReviewOutcome, { ok: true }>) {
  if (outcome.error === "limit") {
    if (outcome.reason === "budget") return `今月のAI添削は終了しました。${day(outcome.retryAfter)}から再開します / AI review is paused until ${day(outcome.retryAfter)}`;
    const limit = outcome.reason === "day" ? "今日 / today" : "今月 / this month";
    return `${limit}の添削回数の上限です。${day(outcome.retryAfter)}から使えます / Limit reached, available again on ${day(outcome.retryAfter)}`;
  }
  if (outcome.error === "empty") return "本文を入力してください / Write your answer first";
  if (outcome.error === "ai_not_configured") return "AI添削は準備中です / AI review is not available yet";
  return "AI添削に失敗しました。回数は使われていません / The review failed; it was not counted";
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
        setMessage(refusal(outcome));
      }
      const u = await getUsage(token);
      if (u.ok) setUsage(u.value);
    } catch {
      setMessage(refusal({ ok: false, error: "ai_failed" }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="review" aria-label="AI添削 / AI review">
      <div className="review-bar">
        <button type="button" className="primary" onClick={run} disabled={busy || usage?.today === 0}>
          {busy ? "添削中… / Reviewing…" : "AI添削 / AI review"}
        </button>
        {usage && <span className="muted">残り / Left: 今日 {usage.today} · 今月 {usage.month}</span>}
      </div>
      {message && <p role="alert" className="notice">{message}</p>}

      {history.length > 0 && (
        <div className="history" role="group" aria-label="履歴 / History">
          <span className="muted">履歴 / History</span>
          {[...history].reverse().map((r, k) => {
            const index = history.length - 1 - k;
            return (
              <button key={r.id} type="button" aria-pressed={index === shown} onClick={() => { setShown(index); setApplied(new Set()); }}
                title={new Date(r.createdAt).toLocaleString("ja-JP")}>
                {r.score}
              </button>
            );
          })}
        </div>
      )}

      {review && <Changes since={review} body={body} />}

      {review && (
        <div className="result">
          <p className="score"><strong>{review.score}</strong> / 100 <span className="muted">{new Date(review.createdAt).toLocaleString("ja-JP")}</span></p>
          <p>{review.summary}</p>
          {review.strengths.length > 0 && (
            <ul className="strengths">{review.strengths.map((s) => <li key={s}><CheckIcon size={15} /> {s}</li>)}</ul>
          )}
          <ol className="issues">
            {review.issues.map((issue, i) => (
              <li key={i}>
                <span className="tag">{CATEGORY[issue.category] ?? issue.category}</span>
                <p><mark>{issue.quote}</mark> <ArrowRightIcon size={14} /> <ins>{issue.suggestion}</ins></p>
                <p className="muted">{issue.problem}</p>
                <button type="button" disabled={applied.has(i)}
                  onClick={() => { onApply(issue.quote, issue.suggestion); setApplied((a) => new Set(a).add(i)); }}>
                  {applied.has(i) ? "適用済み / Applied" : "適用 / Apply"}
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
function Changes({ since, body }: { since: Review; body: string }) {
  if (since.bodySnapshot === body) {
    return <p className="muted changes-none">この添削のあと、本文は変わっていません / No changes since this review</p>;
  }
  const parts = diff(since.bodySnapshot, body);
  const { added, removed } = stats(parts);
  return (
    <details className="changes" open>
      <summary>この添削からの変更 / Changes since this review <span className="muted">+{added} / −{removed}字</span></summary>
      <p className="diff" lang="ja">
        {parts.map((p, i) =>
          p.type === "same" ? <span key={i}>{p.text}</span>
            : p.type === "add" ? <ins key={i}>{p.text}</ins>
            : <del key={i}>{p.text}</del>)}
      </p>
    </details>
  );
}
