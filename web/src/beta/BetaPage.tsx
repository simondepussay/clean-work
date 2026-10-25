import { useState, type FormEvent } from "react";
import { requestBeta, type Issue } from "../api";
import { apiMessage, useTr } from "../i18n";
import { CheckIcon } from "../icons";

/**
 * « βテストに参加 » : comment tester l'app iPhone avant sa sortie (TestFlight, test externe),
 * et formulaire pour envoyer l'e-mail de son compte Apple. Accessible à tous, connecté ou non.
 */
export function BetaPage() {
  const tr = useTr();
  const [email, setEmail] = useState("");
  const [device, setDevice] = useState<"iphone" | "ipad" | "both">("iphone");
  const [message, setMessage] = useState("");
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "already" | "limit" | "failed">("idle");
  const [issues, setIssues] = useState<Issue[]>([]);
  const errors = new Map(issues.map((i) => [i.path, apiMessage(i.message, tr.lang)]));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setState("sending");
    setIssues([]);
    const r = await requestBeta({ email, device, message: message.trim() || undefined, lang: tr.lang, consent, website });
    if (r.ok) setState(r.status === "already" ? "already" : "done");
    else if ("issues" in r) { setIssues(r.issues); setState("idle"); }
    else setState(r.error);
  }

  const steps = [
    {
      title: tr({ ja: "メールアドレスを送る", en: "Send your email", fr: "Envoyez votre e-mail" }),
      text: tr({
        ja: "iPhone・iPadで使っている Apple アカウント（Apple ID）のメールアドレスを、このページのフォームから送ってください。",
        en: "Use the form on this page to send the email address of the Apple Account (Apple ID) on your iPhone or iPad.",
        fr: "Envoyez avec le formulaire de cette page l'adresse e-mail du compte Apple (identifiant Apple) de votre iPhone ou iPad.",
      }),
    },
    {
      title: tr({ ja: "TestFlight をインストール", en: "Install TestFlight", fr: "Installez TestFlight" }),
      text: tr({
        ja: "TestFlight は、公開前のアプリを試すための Apple 公式の無料アプリです。App Store から入れておいてください。",
        en: "TestFlight is Apple's free official app for trying apps before release. Get it from the App Store.",
        fr: "TestFlight est l'app officielle et gratuite d'Apple pour essayer une app avant sa sortie. Installez-la depuis l'App Store.",
      }),
      link: { href: "https://apps.apple.com/app/testflight/id899247664", label: tr({ ja: "App Store で TestFlight を開く", en: "Open TestFlight in the App Store", fr: "Ouvrir TestFlight dans l'App Store" }) },
    },
    {
      title: tr({ ja: "招待メールを開く", en: "Open the invitation email", fr: "Ouvrez l'e-mail d'invitation" }),
      text: tr({
        ja: "数日以内に Apple（TestFlight）から「Clean Work」への招待メールが届きます。iPhone・iPad でメールを開き、「View in TestFlight（TestFlight で表示）」をタップしてください。迷惑メールフォルダも確認してください。",
        en: "Within a few days, Apple (TestFlight) emails you an invitation to “Clean Work”. Open it on your iPhone or iPad and tap “View in TestFlight”. Check your spam folder too.",
        fr: "Sous quelques jours, Apple (TestFlight) vous envoie une invitation à « Clean Work ». Ouvrez l'e-mail sur votre iPhone ou iPad et touchez « View in TestFlight » (Afficher dans TestFlight). Pensez à vérifier les indésirables.",
      }),
    },
    {
      title: tr({ ja: "受け入れてインストール", en: "Accept and install", fr: "Acceptez et installez" }),
      text: tr({
        ja: "TestFlight で「受け入れる」→「インストール」をタップすると、ホーム画面に Clean Work が入ります。あとは普通のアプリと同じように使えます。",
        en: "In TestFlight, tap “Accept”, then “Install”: Clean Work appears on your home screen and works like any other app.",
        fr: "Dans TestFlight, touchez « Accepter » puis « Installer » : Clean Work apparaît sur l'écran d'accueil et s'utilise comme une app normale.",
      }),
    },
    {
      title: tr({ ja: "感想を送る", en: "Send feedback", fr: "Donnez votre avis" }),
      text: tr({
        ja: "気づいたことは、アプリの画面でスクリーンショットを撮り、「ベータフィードバックを送信」から送れます。どんな小さなことでも助かります。",
        en: "Take a screenshot in the app and choose “Share Beta Feedback” to send what you noticed. Every small detail helps.",
        fr: "Faites une capture d'écran dans l'app et choisissez « Envoyer un retour bêta » pour signaler ce que vous remarquez. Chaque détail compte.",
      }),
    },
  ];

  return (
    <section className="beta-page">
      <header className="beta-head">
        <p className="eyebrow">TestFlight</p>
        <h1>{tr({ ja: "βテストに参加する", en: "Join the beta", fr: "Rejoindre la bêta" })}</h1>
        <p className="lead">{tr({
          ja: "公開前の Clean Work の iPhone・iPad アプリを、いち早く試してみませんか。参加は無料です。",
          en: "Try the Clean Work app for iPhone and iPad before its release. Taking part is free.",
          fr: "Essayez l'app Clean Work pour iPhone et iPad avant sa sortie. La participation est gratuite.",
        })}</p>
      </header>

      <div className="beta-grid">
        <div className="card beta-steps">
          <h2>{tr({ ja: "参加のしかた", en: "How it works", fr: "Comment participer" })}</h2>
          <p className="beta-need">{tr({
            ja: "必要なもの：iOS 18 以降の iPhone または iPad と、Apple アカウント。",
            en: "You need: an iPhone or iPad with iOS 18 or later, and an Apple Account.",
            fr: "Il vous faut : un iPhone ou un iPad sous iOS 18 ou plus récent, et un compte Apple.",
          })}</p>
          <ol>
            {steps.map((s, i) => (
              <li key={s.title}>
                <span className="step-num">{i + 1}</span>
                <div>
                  <strong>{s.title}</strong>
                  <p>{s.text}</p>
                  {s.link && <a href={s.link.href} target="_blank" rel="noreferrer">{s.link.label}</a>}
                </div>
              </li>
            ))}
          </ol>
          <p className="muted small">{tr({
            ja: "ベータ版は約90日ごとに新しいバージョンに更新されます。TestFlight が自動でお知らせします。",
            en: "Beta builds are replaced by a new version about every 90 days; TestFlight lets you know.",
            fr: "Les versions bêta sont remplacées par une nouvelle environ tous les 90 jours ; TestFlight vous prévient.",
          })}</p>
        </div>

        <div className="card beta-form-card">
          {state === "done" || state === "already" ? (
            <div className="beta-done" role="status">
              <span className="done-icon"><CheckIcon size={26} /></span>
              <h2>{state === "done"
                ? tr({ ja: "受け付けました", en: "Request received", fr: "Demande reçue" })
                : tr({ ja: "このメールはすでに受け付けています", en: "This email is already on the list", fr: "Cette adresse est déjà inscrite" })}</h2>
              <p>{tr({
                ja: "数日以内に Apple（TestFlight）から招待メールが届きます。届いたら、手順3から進めてください。",
                en: "Apple (TestFlight) will email your invitation within a few days. When it arrives, continue from step 3.",
                fr: "Apple (TestFlight) vous enverra l'invitation sous quelques jours. À sa réception, reprenez à l'étape 3.",
              })}</p>
            </div>
          ) : (
            <form onSubmit={submit} noValidate aria-label={tr({ ja: "βテストの申し込み", en: "Beta request", fr: "Demande de bêta" })}>
              <h2>{tr({ ja: "申し込む", en: "Request an invitation", fr: "Demander une invitation" })}</h2>
              <label className={errors.has("email") ? "invalid" : undefined}>
                <span>{tr({ ja: "Apple アカウントのメールアドレス", en: "Your Apple Account email", fr: "E-mail de votre compte Apple" })} *</span>
                <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                {errors.has("email") && <small role="alert">{errors.get("email")}</small>}
              </label>
              <label>
                <span>{tr({ ja: "使う端末", en: "Device", fr: "Appareil" })} *</span>
                <select value={device} onChange={(e) => setDevice(e.target.value as typeof device)}>
                  <option value="iphone">iPhone</option>
                  <option value="ipad">iPad</option>
                  <option value="both">iPhone + iPad</option>
                </select>
              </label>
              <label>
                <span>{tr({ ja: "ひとこと（任意）", en: "A word for us (optional)", fr: "Un mot (facultatif)" })}</span>
                <textarea rows={3} maxLength={500} value={message} onChange={(e) => setMessage(e.target.value)}
                  placeholder={tr({ ja: "例：HALの2年生です。就活中です。", en: "e.g. Second-year student, job hunting now.", fr: "Ex. : étudiant·e en 2e année, en pleine recherche." })} />
              </label>
              {/* Champ piège invisible : seuls les robots le remplissent. */}
              <label className="trap" aria-hidden="true">
                <span>Website</span>
                <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
              </label>
              <label className={`consent${errors.has("consent") ? " invalid" : ""}`}>
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                <span>{tr({
                  ja: "このメールアドレスを TestFlight の招待のためだけに使うことに同意します（ベータ終了後に削除されます）。",
                  en: "I agree that this email is used only to send the TestFlight invitation (deleted after the beta).",
                  fr: "J'accepte que cette adresse serve uniquement à l'invitation TestFlight (effacée après la bêta).",
                })} <a href="/privacy.html" target="_blank" rel="noreferrer">{tr({ ja: "プライバシーポリシー", en: "Privacy policy", fr: "Confidentialité" })}</a></span>
              </label>
              {state === "limit" && <p role="alert" className="notice">{tr({ ja: "送信が多すぎます。明日もう一度お試しください。", en: "Too many requests. Please try again tomorrow.", fr: "Trop de demandes. Réessayez demain." })}</p>}
              {state === "failed" && <p role="alert" className="notice">{tr({ ja: "送信できませんでした。少し時間をおいてお試しください。", en: "Could not send. Please try again in a moment.", fr: "Envoi impossible. Réessayez dans un instant." })}</p>}
              <button className="primary large" type="submit" disabled={state === "sending" || !consent || !email.trim()}>
                {state === "sending" ? tr({ ja: "送信中…", en: "Sending…", fr: "Envoi…" }) : tr({ ja: "参加を申し込む", en: "Request to join", fr: "Demander à participer" })}
              </button>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
