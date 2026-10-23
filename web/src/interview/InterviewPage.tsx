import { useEffect, useRef, useState } from "react";
import {
  answerInterview, deleteInterview, finishInterview, getInterview, getInterviewUsage, listApplications, listInterviews, startInterview,
  type Application, type Interview, type InterviewListItem, type InterviewOutcome, type InterviewStage, type InterviewTurn, type Usage,
} from "../api";
import { useAuth } from "../auth/auth";
import { LANGS, useHelpLanguage } from "../es/guide";
import { stageFor, stageName, STAGES } from "./stages";
import { canListen, canSpeak, listen, speak, stopSpeaking, type Listener } from "./speech";

const day = (iso: string) => new Date(iso).toLocaleDateString("ja-JP");

function failure(outcome: Exclude<InterviewOutcome, { ok: true }>) {
  if (outcome.error === "limit") {
    if (outcome.reason === "budget") return `今月のAI機能は終了しました。${day(outcome.retryAfter)}から再開します / AI features are paused until ${day(outcome.retryAfter)}`;
    return `面接練習の回数の上限です。${day(outcome.retryAfter)}から使えます / Practice limit reached, available again on ${day(outcome.retryAfter)}`;
  }
  if (outcome.error === "invalid") return "回答を入力してください / Write or say your answer";
  if (outcome.error === "ai_not_configured") return "面接練習は準備中です / Interview practice is not available yet";
  if (outcome.error === "finished") return "この面接は終了しています / This interview is over";
  return "AIが応答しませんでした。もう一度試してください（回数は使われていません）/ The AI did not respond; try again (not counted)";
}

export type InterviewSeed = { applicationId: string; nonce: number };

/** Entraînement aux entretiens (S17–S19) : préparation, entretien simulé, bilan. */
export function InterviewPage({ seed }: { seed?: InterviewSeed }) {
  const auth = useAuth();
  const [lang, setLang] = useHelpLanguage();
  const [apps, setApps] = useState<Application[]>([]);
  const [history, setHistory] = useState<InterviewListItem[]>([]);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [applicationId, setApplicationId] = useState("");
  const [stage, setStage] = useState<InterviewStage>("interview1");
  const [session, setSession] = useState<Interview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const withToken = async <T,>(fn: (token: string) => Promise<T>) => {
    const token = await auth.getToken();
    if (!token) throw new Error("non connecté");
    return fn(token);
  };

  const refresh = () => withToken(async (t) => {
    const [a, h, u] = await Promise.all([listApplications(t), listInterviews(t), getInterviewUsage(t)]);
    if (a.ok && Array.isArray(a.value)) setApps(a.value);
    if (h.ok && Array.isArray(h.value)) setHistory(h.value);
    if (u.ok) setUsage(u.value);
  }).catch(() => {});

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { refresh(); }, []);

  // Venu d'une candidature (bouton « 面接を練習する ») : on la présélectionne.
  useEffect(() => {
    if (!seed) return;
    setApplicationId(seed.applicationId);
    setSession(null);
  }, [seed]);
  useEffect(() => {
    if (applicationId) setStage(stageFor(apps.find((a) => a.id === applicationId)));
  }, [applicationId, apps]);

  async function run(call: (token: string) => Promise<InterviewOutcome>) {
    setBusy(true);
    setMessage(null);
    try {
      const outcome = await withToken(call);
      if (outcome.ok) setSession(outcome.interview);
      else setMessage(failure(outcome));
      return outcome.ok;
    } catch {
      setMessage(failure({ ok: false, error: "ai_failed" }));
      return false;
    } finally {
      setBusy(false);
    }
  }

  const start = () => run((t) => startInterview(t, { ...(applicationId ? { applicationId } : {}), stage, language: lang }));

  async function open(id: string) {
    const r = await withToken((t) => getInterview(t, id)).catch(() => null);
    if (r?.ok) setSession(r.value);
  }

  async function remove(id: string) {
    if (!window.confirm("この練習を削除しますか？ / Delete this practice session?")) return;
    await withToken((t) => deleteInterview(t, id)).catch(() => {});
    refresh();
  }

  if (session) {
    return (
      <Session session={session} busy={busy} message={message}
        onAnswer={(input) => run((t) => answerInterview(t, session.id, input))}
        onFinish={() => run((t) => finishInterview(t, session.id))}
        onClose={() => { stopSpeaking(); setSession(null); setMessage(null); refresh(); }} />
    );
  }

  return (
    <section className="interview">
      <h2>面接練習 / Interview practice</h2>
      <p className="muted">
        AIの面接官が、企業・選考段階・あなたのプロフィールとESに合わせて5つ質問します。声でも文字でも答えられます。
        <br />An AI interviewer asks 5 questions tailored to the company, the stage, your profile and your entry sheets. Answer by voice or by typing.
      </p>
      <div className="grid">
        <label>
          <span>企業 / Company</span>
          <select value={applicationId} onChange={(e) => setApplicationId(e.target.value)}>
            <option value="">一般的な面接 / General interview</option>
            {apps.map((a) => <option key={a.id} value={a.id}>{a.company}{a.position ? `（${a.position}）` : ""}</option>)}
          </select>
        </label>
        <label>
          <span>選考段階 / Stage</span>
          <select value={stage} onChange={(e) => setStage(e.target.value as InterviewStage)}>
            {STAGES.map((s) => <option key={s.value} value={s.value}>{s.ja} / {s.en}</option>)}
          </select>
        </label>
        <label>
          <span>解説の言語 / Help language</span>
          <select value={lang} onChange={(e) => setLang(e.target.value as typeof lang)}>
            {LANGS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>
        </label>
      </div>
      {applicationId && !apps.find((a) => a.id === applicationId)?.notes && (
        <p className="muted">💡 応募の「企業メモ」を書くと、質問がもっと具体的になります / Add notes on the company for more specific questions</p>
      )}
      <div className="actions">
        <button className="primary" onClick={start} disabled={busy || usage?.today === 0}>
          {busy ? "面接官が質問を準備しています… / Preparing questions…" : "🎤 面接を始める / Start"}
        </button>
        {usage && <span className="muted">残り：今日 {usage.today}回・今月 {usage.month}回 / Left: {usage.today} today, {usage.month} this month</span>}
      </div>
      {message && <p role="alert" className="muted">{message}</p>}

      {history.length > 0 && (
        <>
          <h3>これまでの練習 / Past sessions</h3>
          <ul className="interview-history">
            {history.map((h) => (
              <li key={h.id}>
                <button className="link" onClick={() => open(h.id)}>
                  {day(h.createdAt)} · {h.company ?? "一般 / General"} · {stageName(h.stage)}
                  {h.score !== null ? ` · ${h.score}点` : " · 途中 / unfinished"}
                </button>
                <button className="link danger" onClick={() => remove(h.id)} aria-label="削除 / Delete">✕</button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function FeedbackCard({ turn }: { turn: InterviewTurn }) {
  const f = turn.feedback;
  if (!f) return null;
  return (
    <div className="feedback" aria-label="フィードバック / Feedback">
      <p><strong className="score">{f.score}点</strong> {f.comment}</p>
      {f.improvements.length > 0 && <ul>{f.improvements.map((i) => <li key={i}>{i}</li>)}</ul>}
      {f.expressions.length > 0 && (
        <ul className="expressions">
          {f.expressions.map((e) => <li key={e.quote}><del>{e.quote}</del> → <ins>{e.suggestion}</ins></li>)}
        </ul>
      )}
      {turn.durationSec !== undefined && <p className="muted">回答時間 / Time: {turn.durationSec}秒</p>}
    </div>
  );
}

function Session({ session, busy, message, onAnswer, onFinish, onClose }: {
  session: Interview; busy: boolean; message: string | null;
  onAnswer: (input: { answer: string; durationSec?: number; spoken: boolean }) => Promise<boolean>;
  onFinish: () => Promise<boolean>;
  onClose: () => void;
}) {
  const current = session.turns.findIndex((t) => t.answer === undefined);
  /** La dernière réponse reste affichée (avec son avis) jusqu'à « 次の質問へ ». */
  const [reviewing, setReviewing] = useState<number | null>(null);
  const [answer, setAnswer] = useState("");
  const [listening, setListening] = useState(false);
  const [spoken, setSpoken] = useState(false);
  const [autoRead, setAutoRead] = useState(true);
  const listener = useRef<Listener | null>(null);
  const startedAt = useRef<number | null>(null);
  const [duration, setDuration] = useState<number | undefined>();
  const answered = session.turns.filter((t) => t.answer !== undefined).length;
  const shownIndex = reviewing ?? current;
  const turn = shownIndex >= 0 ? session.turns[shownIndex] : null;

  // Nouvelle question : lue à voix haute, comme en vrai.
  useEffect(() => {
    if (reviewing === null && turn && autoRead && session.status === "active") speak(turn.question);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownIndex, reviewing]);

  useEffect(() => () => { listener.current?.stop(); stopSpeaking(); }, []);

  function toggleMic() {
    if (listening) {
      listener.current?.stop();
      return;
    }
    stopSpeaking();
    const base = answer ? `${answer} ` : "";
    startedAt.current ??= Date.now();
    listener.current = listen(
      (text) => setAnswer(base + text),
      () => {
        setListening(false);
        if (startedAt.current) setDuration(Math.round((Date.now() - startedAt.current) / 1000));
      },
    );
    if (listener.current) {
      setListening(true);
      setSpoken(true);
    }
  }

  async function submit() {
    listener.current?.stop();
    const index = current;
    const ok = await onAnswer({ answer, spoken, ...(spoken && duration !== undefined ? { durationSec: duration } : {}) });
    if (ok) {
      setReviewing(index);
      setAnswer("");
      setSpoken(false);
      setDuration(undefined);
      startedAt.current = null;
    }
  }

  if (session.status === "finished" && session.summary) {
    const s = session.summary;
    return (
      <section className="interview">
        <h2>振り返り / Review — {session.company ?? "一般 / General"} · {stageName(session.stage)}</h2>
        <div className="feedback summary">
          <p><strong className="score">{s.score}点</strong> {s.summary}</p>
          <h4>良かった点 / Strengths</h4>
          <ul>{s.strengths.map((x) => <li key={x}>{x}</li>)}</ul>
          <h4>次に意識すること / Next time</h4>
          <ul>{s.improvements.map((x) => <li key={x}>{x}</li>)}</ul>
        </div>
        <ol className="transcript">
          {session.turns.map((t, i) => (
            <li key={i}>
              <p><strong>{t.kind === "followUp" ? "深掘り / Follow-up：" : ""}{t.question}</strong></p>
              <p className="answer">{t.answer}</p>
              <FeedbackCard turn={t} />
            </li>
          ))}
        </ol>
        <button onClick={onClose}>戻る / Back</button>
      </section>
    );
  }

  return (
    <section className="interview">
      <h2>{session.company ?? "一般的な面接 / General"} · {stageName(session.stage)}</h2>
      <p className="muted">回答済み {answered} / 質問 {session.turns.length} · Answered {answered} of {session.turns.length}</p>

      {turn && (
        <div className="question">
          {turn.kind === "followUp" && <span className="tag">深掘り / Follow-up</span>}
          <p className="q">{turn.question}</p>
          <div className="actions">
            {canSpeak() && <button onClick={() => speak(turn.question)}>🔊 もう一度聞く / Listen again</button>}
            {canSpeak() && (
              <label className="inline"><input type="checkbox" checked={autoRead} onChange={(e) => setAutoRead(e.target.checked)} />自動で読み上げ / Read aloud</label>
            )}
          </div>
          {turn.intent && <details><summary>面接官が見ているポイント / What they look for</summary><p>{turn.intent}</p></details>}
        </div>
      )}

      {reviewing !== null ? (
        <>
          <p className="answer">{session.turns[reviewing].answer}</p>
          <FeedbackCard turn={session.turns[reviewing]} />
          <div className="actions">
            {current >= 0 && <button className="primary" onClick={() => setReviewing(null)}>次の質問へ / Next question</button>}
            <button className={current >= 0 ? undefined : "primary"} onClick={onFinish} disabled={busy}>
              {busy ? "振り返りを作成中… / Writing the review…" : "終了して振り返る / Finish and review"}
            </button>
          </div>
        </>
      ) : turn && (
        <>
          <label>
            <span>あなたの回答 / Your answer</span>
            <textarea rows={6} value={answer} onChange={(e) => setAnswer(e.target.value)} maxLength={3000}
              placeholder="話すか、書いてください / Speak or type your answer" />
          </label>
          <div className="actions">
            {canListen() ? (
              <button onClick={toggleMic} className={listening ? "danger" : undefined} aria-pressed={listening}>
                {listening ? "⏹ 話し終わった / Stop" : "🎙 話して答える / Answer by voice"}
              </button>
            ) : (
              <span className="muted">このブラウザでは音声入力が使えません。文字で答えてください / Voice input isn't available in this browser; please type.</span>
            )}
            <button className="primary" onClick={submit} disabled={busy || !answer.trim()}>
              {busy ? "面接官が考えています… / The interviewer is thinking…" : "回答する / Answer"}
            </button>
            {answered > 0 && <button onClick={onFinish} disabled={busy}>ここで終了 / Stop here</button>}
          </div>
          {canListen() && <p className="muted small">音声はブラウザの音声認識（Chrome は Google、Safari は Apple）で文字になります / Your browser's speech service (Google in Chrome, Apple in Safari) turns your voice into text.</p>}
        </>
      )}
      {reviewing === null && current === -1 && (
        <div className="actions">
          <button className="primary" onClick={onFinish} disabled={busy}>
            {busy ? "振り返りを作成中… / Writing the review…" : "終了して振り返る / Finish and review"}
          </button>
        </div>
      )}
      {message && <p role="alert" className="muted">{message}</p>}
      <button className="link" onClick={onClose}>← 一覧に戻る / Back to the list</button>
    </section>
  );
}
