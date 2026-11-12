import { useEffect, useState } from "react";
import { getEmailUsage, writeEmail, type EmailDraft, type EmailKind, type EmailOutcome, type Step, type Usage } from "../api";
import { useAuth } from "../auth/auth";
import { CheckIcon, CopyIcon, MailIcon } from "../icons";
import { useTr, type T3, type Tr } from "../i18n";
import { stepTypes } from "./statuses";

/** Les mails que l'on écrit le plus pendant le 就活, dans l'ordre où on les rencontre. */
const KINDS: { value: EmailKind; label: T3; hint: T3; needsStep?: boolean }[] = [
  { value: "thanks", needsStep: true, label: { ja: "面接のお礼", en: "Thank-you after an interview", fr: "Remerciement après un entretien" },
    hint: { ja: "面接で印象に残ったこと（任意）", en: "What stayed with you from the interview (optional)", fr: "Ce qui vous a marqué pendant l'entretien (facultatif)" } },
  { value: "schedule", label: { ja: "日程調整", en: "Arrange a date", fr: "Fixer une date" },
    hint: { ja: "都合のよい日時（例：11/20 午後、11/21 終日）", en: "When you are free (e.g. 11/20 afternoon, 11/21 all day)", fr: "Vos disponibilités (ex. : 20/11 après-midi, 21/11 toute la journée)" } },
  { value: "reschedule", needsStep: true, label: { ja: "日程変更のお願い", en: "Ask to change the date", fr: "Demander un changement de date" },
    hint: { ja: "理由と、代わりに都合のよい日時", en: "The reason, and when you are free instead", fr: "La raison, et vos autres disponibilités" } },
  { value: "inquiry", label: { ja: "問い合わせ", en: "Ask a question", fr: "Poser une question" },
    hint: { ja: "聞きたいこと", en: "What you want to ask", fr: "Ce que vous voulez demander" } },
  { value: "decline", label: { ja: "選考辞退", en: "Withdraw from the selection", fr: "Se retirer de la sélection" },
    hint: { ja: "伝えたいこと（任意）", en: "Anything to mention (optional)", fr: "À mentionner (facultatif)" } },
  { value: "acceptOffer", label: { ja: "内定承諾", en: "Accept the offer", fr: "Accepter l'offre" },
    hint: { ja: "確認したいこと（任意）", en: "Anything to confirm (optional)", fr: "À confirmer (facultatif)" } },
  { value: "declineOffer", label: { ja: "内定辞退", en: "Decline the offer", fr: "Refuser l'offre" },
    hint: { ja: "伝えたいこと（任意）", en: "Anything to mention (optional)", fr: "À mentionner (facultatif)" } },
];

const LOCALE = { ja: "ja-JP", en: "en-US", fr: "fr-FR" } as const;

function refusal(outcome: Exclude<EmailOutcome, { ok: true }>, tr: Tr) {
  if (outcome.error === "limit") {
    const d = new Date(outcome.retryAfter).toLocaleDateString(LOCALE[tr.lang]);
    if (outcome.reason === "budget") return tr({ ja: `今月のAI機能は終了しました。${d}から再開します`, en: `AI features are paused until ${d}`, fr: `Les fonctions IA reprendront le ${d}` });
    return outcome.reason === "day"
      ? tr({ ja: `今日の上限です。${d}から使えます`, en: `Today's limit is reached; available again on ${d}`, fr: `Limite du jour atteinte ; de nouveau disponible le ${d}` })
      : tr({ ja: `今月の上限です。${d}から使えます`, en: `This month's limit is reached; available again on ${d}`, fr: `Limite du mois atteinte ; de nouveau disponible le ${d}` });
  }
  if (outcome.error === "ai_not_configured") return tr({ ja: "メール作成は準備中です", en: "Email writing is not available yet", fr: "La rédaction de mails n'est pas encore disponible" });
  return tr({ ja: "作成に失敗しました。回数は使われていません", en: "Writing failed; it was not counted", fr: "La rédaction a échoué ; elle n'a pas été comptée" });
}

/**
 * Mail de 就活 rédigé par l'IA pour une candidature enregistrée : le type de mail, l'étape concernée
 * et quelques précisions suffisent. Le texte reste modifiable avant d'être copié ou ouvert dans la messagerie.
 */
export function EmailPanel({ applicationId, steps }: { applicationId: string; steps: Step[] }) {
  const auth = useAuth();
  const tr = useTr();
  const [kind, setKind] = useState<EmailKind>("thanks");
  const [stepId, setStepId] = useState("");
  const [details, setDetails] = useState("");
  const [usage, setUsage] = useState<Usage | null>(null);
  const [email, setEmail] = useState<EmailDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState<"subject" | "body" | null>(null);

  useEffect(() => {
    auth.getToken().then(async (t) => {
      const u = t ? await getEmailUsage(t) : null;
      if (u?.ok) setUsage(u.value);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const current = KINDS.find((k) => k.value === kind)!;
  const names = new Map(stepTypes(tr.lang).map((o) => [o.value, o.label]));
  const stepLabel = (s: Step) => [names.get(s.type) ?? s.type, s.dueDate?.slice(5).replace("-", "/"), s.time].filter(Boolean).join(" ");

  async function run() {
    setBusy(true);
    setMessage(null);
    try {
      const token = await auth.getToken();
      if (!token) throw new Error("pas de jeton");
      const outcome = await writeEmail(token, applicationId, {
        kind, language: tr.lang,
        ...(current.needsStep && stepId ? { stepId } : {}),
        ...(details.trim() ? { details: details.trim() } : {}),
      });
      if (outcome.ok) {
        setEmail(outcome.email);
        if (outcome.email.remaining) setUsage(outcome.email.remaining);
      } else {
        setMessage(refusal(outcome, tr));
      }
    } catch {
      setMessage(refusal({ ok: false, error: "ai_failed" }, tr));
    } finally {
      setBusy(false);
    }
  }

  async function copy(what: "subject" | "body") {
    if (!email) return;
    try {
      await navigator.clipboard.writeText(email[what]);
      setCopied(what);
      setTimeout(() => setCopied((c) => (c === what ? null : c)), 2000);
    } catch { /* presse-papiers refusé : le texte reste sélectionnable */ }
  }

  const copyLabel = (what: "subject" | "body") => (copied === what
    ? <><CheckIcon size={14} /> {tr({ ja: "コピーしました", en: "Copied", fr: "Copié" })}</>
    : <><CopyIcon size={14} /> {tr({ ja: "コピー", en: "Copy", fr: "Copier" })}</>);

  return (
    <section className="email-panel" aria-label={tr({ ja: "メールを書く", en: "Write an email", fr: "Écrire un mail" })}>
      <div className="grid">
        <label>
          <span>{tr({ ja: "メールの種類", en: "Type of email", fr: "Type de mail" })}</span>
          <select value={kind} onChange={(e) => setKind(e.target.value as EmailKind)}>
            {KINDS.map((k) => <option key={k.value} value={k.value}>{tr(k.label)}</option>)}
          </select>
        </label>
        {current.needsStep && steps.length > 0 && (
          <label>
            <span>{tr({ ja: "対象の選考", en: "Which step", fr: "Étape concernée" })}</span>
            <select value={stepId} onChange={(e) => setStepId(e.target.value)}>
              <option value="">—</option>
              {steps.map((s) => <option key={s.id} value={s.id}>{stepLabel(s)}</option>)}
            </select>
          </label>
        )}
      </div>
      <label>
        <span>{tr(current.hint)}</span>
        <textarea rows={2} maxLength={600} value={details} onChange={(e) => setDetails(e.target.value)} />
      </label>
      <div className="review-bar">
        <button type="button" className="primary" onClick={run} disabled={busy || usage?.today === 0}>
          <MailIcon size={16} /> {busy ? tr({ ja: "作成中…", en: "Writing…", fr: "Rédaction…" }) : email ? tr({ ja: "もう一度作成", en: "Write again", fr: "Réécrire" }) : tr({ ja: "AIで作成", en: "Write with AI", fr: "Rédiger avec l'IA" })}
        </button>
        {usage && <span className="muted">{tr({ ja: `残り：今日 ${usage.today} · 今月 ${usage.month}`, en: `Left: ${usage.today} today · ${usage.month} this month`, fr: `Reste : ${usage.today} aujourd'hui · ${usage.month} ce mois-ci` })}</span>}
      </div>
      {message && <p role="alert" className="notice">{message}</p>}

      {email && (
        <div className="email-result">
          <label>
            <span>{tr({ ja: "件名", en: "Subject", fr: "Objet" })}</span>
            <input value={email.subject} onChange={(e) => setEmail({ ...email, subject: e.target.value })} />
          </label>
          <label>
            <span>{tr({ ja: "本文", en: "Message", fr: "Message" })}</span>
            <textarea rows={Math.min(22, Math.max(10, email.body.split("\n").length + 1))} value={email.body} onChange={(e) => setEmail({ ...email, body: e.target.value })} />
          </label>
          {email.body.includes("〇〇") && (
            <p className="notice">{tr({ ja: "「〇〇」は送る前に書きかえてください（担当者名・日時など）。", en: "Replace every 「〇〇」 before sending (recruiter's name, dates…).", fr: "Remplacez chaque « 〇〇 » avant l'envoi (nom du recruteur, dates…)." })}</p>
          )}
          <div className="actions">
            <button type="button" onClick={() => copy("subject")}>{tr({ ja: "件名", en: "Subject", fr: "Objet" })} · {copyLabel("subject")}</button>
            <button type="button" onClick={() => copy("body")}>{tr({ ja: "本文", en: "Message", fr: "Message" })} · {copyLabel("body")}</button>
            <a className="button" href={`mailto:?subject=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(email.body)}`}>
              <MailIcon size={14} /> {tr({ ja: "メールアプリで開く", en: "Open in mail app", fr: "Ouvrir dans la messagerie" })}
            </a>
          </div>
          {email.points.length > 0 && (
            <>
              <h4>{tr({ ja: "覚えておきたい表現", en: "Expressions worth remembering", fr: "Expressions à retenir" })}</h4>
              <dl className="email-points">
                {email.points.map((p) => (
                  <div key={p.expression}><dt>{p.expression}</dt><dd>{p.meaning}</dd></div>
                ))}
              </dl>
            </>
          )}
        </div>
      )}
    </section>
  );
}
