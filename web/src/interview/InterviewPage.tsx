import { useEffect, useRef, useState } from "react";
import {
  answerInterview, deleteInterview, finishInterview, getInterview, getInterviewUsage, listApplications, listInterviews, startInterview,
  type Application, type Interview, type InterviewListItem, type InterviewOutcome, type InterviewStage, type InterviewTurn, type Usage,
} from "../api";
import { useAuth } from "../auth/auth";
import { ymd } from "../home/agenda";
import { formatDay, useTr, type Tr } from "../i18n";
import { ArrowRightIcon, CalendarIcon, ChevronLeftIcon, CloseIcon, LightIcon, MicIcon, SpeakerIcon, StopIcon } from "../icons";
import { canListen, canSpeak, listen, speak, stopSpeaking, type Listener } from "./speech";
import { scheduledInterviews, stageFor, stageName, STAGES } from "./stages";

function failure(outcome: Exclude<InterviewOutcome, { ok: true }>, tr: Tr) {
  if (outcome.error === "limit") {
    const d = formatDay(outcome.retryAfter, tr.lang, false);
    if (outcome.reason === "budget") return tr({ ja: `今月のAI機能は終了しました。${d}から再開します`, en: `AI features are paused until ${d}`, fr: `Les fonctions d'IA reprendront le ${d}` });
    return tr({ ja: `面接練習の回数の上限です。${d}から使えます`, en: `Practice limit reached; available again on ${d}`, fr: `Limite d'entraînements atteinte ; de nouveau disponible le ${d}` });
  }
  if (outcome.error === "invalid") return tr({ ja: "回答を入力してください", en: "Write or say your answer", fr: "Écrivez ou dites votre réponse" });
  if (outcome.error === "ai_not_configured") return tr({ ja: "面接練習は準備中です", en: "Interview practice is not available yet", fr: "L'entraînement aux entretiens n'est pas encore disponible" });
  if (outcome.error === "finished") return tr({ ja: "この面接は終了しています", en: "This interview is over", fr: "Cet entretien est terminé" });
  if (outcome.error === "not_found") return tr({ ja: "この面接が見つかりません", en: "This interview could not be found", fr: "Entretien introuvable" });
  return tr({ ja: "AIが応答しませんでした。もう一度試してください（回数は使われていません）", en: "The AI did not respond; try again (not counted)", fr: "L'IA n'a pas répondu ; réessayez (non décompté)" });
}

/** Venu d'une candidature ou du calendrier : la candidature, et éventuellement l'entretien prévu. */
export type InterviewSeed = { applicationId: string; stepId?: string; nonce: number };

/** Ce que l'on prépare : un entretien prévu (« step:<app>:<étape> »), ou « custom » (entreprise et étape au choix). */
type Target = string;

/** Entraînement aux entretiens (S17–S19) : préparation, entretien simulé, bilan. */
export function InterviewPage({ seed }: { seed?: InterviewSeed }) {
  const auth = useAuth();
  const tr = useTr();
  const lang = tr.lang;
  const [apps, setApps] = useState<Application[]>([]);
  const [history, setHistory] = useState<InterviewListItem[]>([]);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [target, setTarget] = useState<Target>("custom");
  const [applicationId, setApplicationId] = useState("");
  const [stage, setStage] = useState<InterviewStage>("interview1");
  const [session, setSession] = useState<Interview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const scheduled = scheduledInterviews(apps, ymd(new Date()));
  const chosen = scheduled.find((s) => `step:${s.applicationId}:${s.stepId}` === target);

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

  // Par défaut : l'entretien prévu le plus proche, s'il y en a un.
  const [defaulted, setDefaulted] = useState(false);
  useEffect(() => {
    if (defaulted || seed || apps.length === 0) return;
    setDefaulted(true);
    if (scheduled[0]) setTarget(`step:${scheduled[0].applicationId}:${scheduled[0].stepId}`);
  }, [apps, defaulted, seed, scheduled]);

  // Venu d'une candidature ou du calendrier : l'entretien prévu s'il est donné, sinon la candidature.
  useEffect(() => {
    if (!seed) return;
    setSession(null);
    setDefaulted(true);
    if (seed.stepId) setTarget(`step:${seed.applicationId}:${seed.stepId}`);
    else {
      setTarget("custom");
      setApplicationId(seed.applicationId);
    }
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
      else setMessage(failure(outcome, tr));
      return outcome.ok;
    } catch {
      setMessage(failure({ ok: false, error: "ai_failed" }, tr));
      return false;
    } finally {
      setBusy(false);
    }
  }

  const start = () => run((t) => startInterview(t, chosen
    ? { applicationId: chosen.applicationId, stepId: chosen.stepId, stage: chosen.stage, language: lang }
    : { ...(applicationId ? { applicationId } : {}), stage, language: lang }));

  async function open(id: string) {
    const r = await withToken((t) => getInterview(t, id)).catch(() => null);
    if (r?.ok) setSession(r.value);
  }

  async function remove(id: string) {
    if (!window.confirm(tr({ ja: "この練習を削除しますか？", en: "Delete this practice session?", fr: "Supprimer cet entraînement ?" }))) return;
    await withToken((t) => deleteInterview(t, id)).catch(() => {});
    refresh();
  }

  if (session) {
    return (
      <Session session={session} busy={busy} message={message} tr={tr}
        onAnswer={(input) => run((t) => answerInterview(t, session.id, input))}
        onFinish={() => run((t) => finishInterview(t, session.id))}
        onClose={() => { stopSpeaking(); setSession(null); setMessage(null); refresh(); }} />
    );
  }

  const selectedApp = apps.find((a) => a.id === (chosen?.applicationId ?? applicationId));
  const scheduledLabel = (s: { date: string; company: string; stage: InterviewStage }) => `${formatDay(s.date, lang)} · ${s.company} · ${stageName(s.stage, lang)}`;

  return (
    <section className="interview">
      <h2>{tr({ ja: "面接練習", en: "Interview practice", fr: "Entraînement aux entretiens" })}</h2>
      <p className="muted">{tr({
        ja: "AIの面接官が、企業・選考段階・あなたのプロフィールとESに合わせて5つ質問します。声でも文字でも答えられます。",
        en: "An AI interviewer asks 5 questions tailored to the company, the stage, your profile and your entry sheets. Answer by voice or by typing.",
        fr: "Un recruteur IA pose 5 questions adaptées à l'entreprise, à l'étape, à votre profil et à vos ES. Répondez à voix haute ou par écrit.",
      })}</p>

      <label>
        <span>{tr({ ja: "どの面接の練習？", en: "Which interview?", fr: "Pour quel entretien ?" })}</span>
        <select value={target} onChange={(e) => setTarget(e.target.value)}>
          {scheduled.length > 0 && (
            <optgroup label={tr({ ja: "予定されている面接", en: "Scheduled interviews", fr: "Entretiens prévus" })}>
              {scheduled.map((s) => <option key={s.stepId} value={`step:${s.applicationId}:${s.stepId}`}>{scheduledLabel(s)}</option>)}
            </optgroup>
          )}
          <option value="custom">{tr({ ja: "企業と選考段階を選ぶ", en: "Choose a company and stage", fr: "Choisir une entreprise et une étape" })}</option>
        </select>
      </label>
      {scheduled.length === 0 && (
        <p className="muted small"><CalendarIcon size={14} /> {tr({
          ja: "応募に面接の日程（一次・二次・最終）を入れると、ここから選べます。",
          en: "Add interview dates (1st, 2nd, final) to your applications to pick them here.",
          fr: "Ajoutez les dates d'entretien (1er, 2e, final) à vos candidatures pour les choisir ici.",
        })}</p>
      )}

      {target === "custom" && (
        <div className="grid">
          <label>
            <span>{tr({ ja: "企業", en: "Company", fr: "Entreprise" })}</span>
            <select value={applicationId} onChange={(e) => setApplicationId(e.target.value)}>
              <option value="">{tr({ ja: "一般的な面接", en: "General interview", fr: "Entretien général" })}</option>
              {apps.map((a) => <option key={a.id} value={a.id}>{a.company}{a.position ? `（${a.position}）` : ""}</option>)}
            </select>
          </label>
          <label>
            <span>{tr({ ja: "選考段階", en: "Stage", fr: "Étape" })}</span>
            <select value={stage} onChange={(e) => setStage(e.target.value as InterviewStage)}>
              {STAGES.map((s) => <option key={s.value} value={s.value}>{s[lang]}</option>)}
            </select>
          </label>
        </div>
      )}

      {selectedApp && !selectedApp.notes && (
        <p className="muted"><LightIcon size={15} /> {tr({
          ja: "応募の「企業メモ」に求人票を貼り付けると、質問がもっと具体的になります",
          en: "Paste the job offer into the application's company notes for more specific questions",
          fr: "Collez l'offre d'emploi dans les notes de la candidature pour des questions plus précises",
        })}</p>
      )}
      <div className="actions">
        <button className="primary" onClick={start} disabled={busy || usage?.today === 0}>
          {busy ? tr({ ja: "面接官が質問を準備しています…", en: "Preparing questions…", fr: "Préparation des questions…" })
            : <><MicIcon size={16} /> {tr({ ja: "面接を始める", en: "Start", fr: "Commencer" })}</>}
        </button>
        {usage && <span className="muted">{tr({
          ja: `残り：今日 ${usage.today}回・今月 ${usage.month}回`,
          en: `Left: ${usage.today} today, ${usage.month} this month`,
          fr: `Reste : ${usage.today} aujourd'hui, ${usage.month} ce mois-ci`,
        })}</span>}
      </div>
      {message && <p role="alert" className="muted">{message}</p>}

      {history.length > 0 && (
        <>
          <h3>{tr({ ja: "これまでの練習", en: "Past sessions", fr: "Entraînements précédents" })}</h3>
          <ul className="interview-history">
            {history.map((h) => (
              <li key={h.id}>
                <button className="link" onClick={() => open(h.id)}>
                  {formatDay(h.createdAt, lang)} · {h.company ?? tr({ ja: "一般", en: "General", fr: "Général" })} · {stageName(h.stage, lang)}
                  {h.stepDate && ` (${tr({ ja: "本番", en: "for", fr: "pour le" })} ${formatDay(h.stepDate, lang, false)})`}
                  {h.score !== null ? ` · ${h.score}/100` : ` · ${tr({ ja: "途中", en: "unfinished", fr: "inachevé" })}`}
                </button>
                <button className="link danger" onClick={() => remove(h.id)} aria-label={tr({ ja: "削除", en: "Delete", fr: "Supprimer" })}><CloseIcon size={16} /></button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function FeedbackCard({ turn, tr }: { turn: InterviewTurn; tr: Tr }) {
  const f = turn.feedback;
  if (!f) return null;
  return (
    <div className="feedback" aria-label={tr({ ja: "フィードバック", en: "Feedback", fr: "Avis" })}>
      <p><strong className="score">{f.score}/100</strong> {f.comment}</p>
      {f.improvements.length > 0 && <ul>{f.improvements.map((i) => <li key={i}>{i}</li>)}</ul>}
      {f.expressions.length > 0 && (
        <ul className="expressions">
          {f.expressions.map((e) => <li key={e.quote}><del>{e.quote}</del> <ArrowRightIcon size={14} /> <ins>{e.suggestion}</ins></li>)}
        </ul>
      )}
      {turn.durationSec !== undefined && <p className="muted">{tr({ ja: `回答時間：${turn.durationSec}秒`, en: `Time: ${turn.durationSec} s`, fr: `Durée : ${turn.durationSec} s` })}</p>}
    </div>
  );
}

function Session({ session, busy, message, tr, onAnswer, onFinish, onClose }: {
  session: Interview; busy: boolean; message: string | null; tr: Tr;
  onAnswer: (input: { answer: string; durationSec?: number; spoken: boolean }) => Promise<boolean>;
  onFinish: () => Promise<boolean>;
  onClose: () => void;
}) {
  const lang = tr.lang;
  const current = session.turns.findIndex((t) => t.answer === undefined);
  /** La dernière réponse reste affichée (avec son avis) jusqu'à « question suivante ». */
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
  const title = `${session.company ?? tr({ ja: "一般的な面接", en: "General interview", fr: "Entretien général" })} · ${stageName(session.stage, lang)}`
    + (session.stepDate ? ` · ${formatDay(session.stepDate, lang)}` : "");
  const finishLabel = busy
    ? tr({ ja: "振り返りを作成中…", en: "Writing the review…", fr: "Rédaction du bilan…" })
    : tr({ ja: "終了して振り返る", en: "Finish and review", fr: "Terminer et voir le bilan" });

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

  const followUpTag = tr({ ja: "深掘り", en: "Follow-up", fr: "Relance" });

  if (session.status === "finished" && session.summary) {
    const s = session.summary;
    return (
      <section className="interview">
        <h2>{tr({ ja: "振り返り", en: "Review", fr: "Bilan" })} — {title}</h2>
        <div className="feedback summary">
          <p><strong className="score">{s.score}/100</strong> {s.summary}</p>
          <h4>{tr({ ja: "良かった点", en: "Strengths", fr: "Points forts" })}</h4>
          <ul>{s.strengths.map((x) => <li key={x}>{x}</li>)}</ul>
          <h4>{tr({ ja: "次に意識すること", en: "Next time", fr: "La prochaine fois" })}</h4>
          <ul>{s.improvements.map((x) => <li key={x}>{x}</li>)}</ul>
        </div>
        <ol className="transcript">
          {session.turns.map((t, i) => (
            <li key={i}>
              <p><strong>{t.kind === "followUp" ? `${followUpTag}：` : ""}{t.question}</strong></p>
              <p className="answer">{t.answer}</p>
              <FeedbackCard turn={t} tr={tr} />
            </li>
          ))}
        </ol>
        <button onClick={onClose}>{tr({ ja: "戻る", en: "Back", fr: "Retour" })}</button>
      </section>
    );
  }

  return (
    <section className="interview">
      <h2>{title}</h2>
      <p className="muted">{tr({
        ja: `回答済み ${answered} / 質問 ${session.turns.length}`,
        en: `Answered ${answered} of ${session.turns.length}`,
        fr: `${answered} réponse(s) sur ${session.turns.length}`,
      })}</p>

      {turn && (
        <div className="question">
          {turn.kind === "followUp" && <span className="tag">{followUpTag}</span>}
          <p className="q" lang="ja">{turn.question}</p>
          <div className="actions">
            {canSpeak() && <button onClick={() => speak(turn.question)}><SpeakerIcon size={16} /> {tr({ ja: "もう一度聞く", en: "Listen again", fr: "Réécouter" })}</button>}
            {canSpeak() && (
              <label className="inline"><input type="checkbox" checked={autoRead} onChange={(e) => setAutoRead(e.target.checked)} />{tr({ ja: "自動で読み上げ", en: "Read aloud", fr: "Lecture automatique" })}</label>
            )}
          </div>
          {turn.intent && <details><summary>{tr({ ja: "面接官が見ているポイント", en: "What they look for", fr: "Ce que le recruteur évalue" })}</summary><p>{turn.intent}</p></details>}
        </div>
      )}

      {reviewing !== null ? (
        <>
          <p className="answer">{session.turns[reviewing].answer}</p>
          <FeedbackCard turn={session.turns[reviewing]} tr={tr} />
          <div className="actions">
            {current >= 0 && <button className="primary" onClick={() => setReviewing(null)}>{tr({ ja: "次の質問へ", en: "Next question", fr: "Question suivante" })}</button>}
            <button className={current >= 0 ? undefined : "primary"} onClick={onFinish} disabled={busy}>{finishLabel}</button>
          </div>
        </>
      ) : turn && (
        <>
          <label>
            <span>{tr({ ja: "あなたの回答", en: "Your answer", fr: "Votre réponse" })}</span>
            <textarea rows={6} value={answer} onChange={(e) => setAnswer(e.target.value)} maxLength={3000} lang="ja"
              placeholder={tr({ ja: "話すか、書いてください", en: "Speak or type your answer (in Japanese)", fr: "Parlez ou écrivez votre réponse (en japonais)" })} />
          </label>
          <div className="actions">
            {canListen() ? (
              <button onClick={toggleMic} className={listening ? "danger" : undefined} aria-pressed={listening}>
                {listening
                  ? <><StopIcon size={16} /> {tr({ ja: "話し終わった", en: "Stop", fr: "Terminer" })}</>
                  : <><MicIcon size={16} /> {tr({ ja: "話して答える", en: "Answer by voice", fr: "Répondre à l'oral" })}</>}
              </button>
            ) : (
              <span className="muted">{tr({
                ja: "このブラウザでは音声入力が使えません。文字で答えてください",
                en: "Voice input isn't available in this browser; please type.",
                fr: "La saisie vocale n'est pas disponible dans ce navigateur ; écrivez votre réponse.",
              })}</span>
            )}
            <button className="primary" onClick={submit} disabled={busy || !answer.trim()}>
              {busy ? tr({ ja: "面接官が考えています…", en: "The interviewer is thinking…", fr: "Le recruteur réfléchit…" }) : tr({ ja: "回答する", en: "Send answer", fr: "Envoyer la réponse" })}
            </button>
            {answered > 0 && <button onClick={onFinish} disabled={busy}>{tr({ ja: "ここで終了", en: "Stop here", fr: "Arrêter ici" })}</button>}
          </div>
          {canListen() && <p className="muted small">{tr({
            ja: "音声はブラウザの音声認識（Chrome は Google、Safari は Apple）で文字になります",
            en: "Your browser's speech service (Google in Chrome, Apple in Safari) turns your voice into text.",
            fr: "Le service vocal du navigateur (Google dans Chrome, Apple dans Safari) transforme votre voix en texte.",
          })}</p>}
        </>
      )}
      {reviewing === null && current === -1 && (
        <div className="actions">
          <button className="primary" onClick={onFinish} disabled={busy}>{finishLabel}</button>
        </div>
      )}
      {message && <p role="alert" className="muted">{message}</p>}
      <button className="link" onClick={onClose}><ChevronLeftIcon size={15} /> {tr({ ja: "一覧に戻る", en: "Back to the list", fr: "Retour à la liste" })}</button>
    </section>
  );
}
