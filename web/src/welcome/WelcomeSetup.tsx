import { lazy, Suspense, useState } from "react";
import { LANGS, useHelpLanguage } from "../es/guide";
import { BriefcaseIcon, CheckIcon, DocIcon, HomeIcon } from "../icons";
import { useTr } from "../i18n";
import { Loader } from "../Loader";
import { postponeWelcome } from "./postponed";

const ProfileEditor = lazy(() => import("../profile/ProfileEditor").then((m) => ({ default: m.ProfileEditor })));

/** Où l'on va en sortant de l'écran de bienvenue. */
export type WelcomeExit = "home" | "apps" | "documents";

/**
 * Écran de bienvenue d'un nouveau compte (tant qu'aucun profil n'est enregistré) : la langue, puis le
 * profil complet — en commençant par l'import d'un CV —, puis une première action. Le profil est la base
 * du 履歴書, de la relecture des ES et de l'entretien simulé : autant le remplir une fois, tout de suite.
 * « あとで » laisse passer : le profil reste accessible depuis l'icône du compte.
 */
export function WelcomeSetup({ name, owner, onProfileSaved, onDone }: {
  name: string | null;
  owner: string | null;
  /** Le profil vient d'être enregistré : l'app relit le compte. */
  onProfileSaved: () => void;
  onDone: (go: WelcomeExit) => void;
}) {
  const tr = useTr();
  const [lang, setLang] = useHelpLanguage();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const steps = [
    tr({ ja: "ことば", en: "Language", fr: "Langue" }),
    tr({ ja: "プロフィール", en: "Profile", fr: "Profil" }),
    tr({ ja: "はじめる", en: "Start", fr: "Démarrer" }),
  ];
  const later = () => { postponeWelcome(owner); onDone("home"); };

  return (
    <main className="shell welcome-setup" aria-label={tr({ ja: "はじめに", en: "Getting started", fr: "Premiers pas" })}>
      <ol className="welcome-steps" aria-label={tr({ ja: "進み具合", en: "Progress", fr: "Progression" })}>
        {steps.map((label, i) => (
          <li key={label} aria-current={step === i + 1 ? "step" : undefined} className={step > i + 1 ? "done" : undefined}>
            <span>{step > i + 1 ? <CheckIcon size={13} /> : i + 1}</span>{label}
          </li>
        ))}
      </ol>

      {step === 1 && (
        <section className="card welcome-card">
          <p className="eyebrow">Clean Work</p>
          <h1>{name
            ? tr({ ja: `${name}さん、ようこそ`, en: `Welcome, ${name}`, fr: `Bienvenue, ${name}` })
            : tr({ ja: "ようこそ", en: "Welcome", fr: "Bienvenue" })}</h1>
          <p>{tr({
            ja: "最初にプロフィールを登録しましょう。履歴書の作成、ESの添削、面接の練習は、すべてこのプロフィールをもとにします。",
            en: "Let's set up your profile first. Your résumé, entry-sheet reviews and interview practice are all built on it.",
            fr: "Commençons par votre profil. Le CV japonais, la relecture des ES et l'entraînement aux entretiens s'appuient tous dessus.",
          })}</p>
          <fieldset className="welcome-langs">
            <legend>{tr({ ja: "説明のことば", en: "Language for explanations", fr: "Langue des explications" })}</legend>
            {LANGS.map((l) => (
              <button key={l.value} type="button" aria-pressed={lang === l.value} onClick={() => setLang(l.value)}>{l.label}</button>
            ))}
          </fieldset>
          <div className="actions">
            <button type="button" className="primary large" onClick={() => setStep(2)}>{tr({ ja: "プロフィールを登録する", en: "Set up my profile", fr: "Remplir mon profil" })}</button>
            <button type="button" className="link" onClick={later}>{tr({ ja: "あとで登録する", en: "Do it later", fr: "Plus tard" })}</button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="welcome-profile">
          <div className="card welcome-card">
            <h1>{tr({ ja: "プロフィール", en: "Your profile", fr: "Votre profil" })}</h1>
            <p>{tr({
              ja: "CVがあれば、読み込むだけで入力できます。内容を確かめて、足りないところを書き足してから保存してください。",
              en: "If you have a CV, importing it fills the form. Check it, add what is missing, then save.",
              fr: "Si vous avez un CV, l'importer remplit le formulaire. Vérifiez, complétez ce qui manque, puis enregistrez.",
            })}</p>
            <button type="button" className="link" onClick={later}>{tr({ ja: "あとで登録する", en: "Do it later", fr: "Plus tard" })}</button>
          </div>
          <Suspense fallback={<Loader />}>
            <ProfileEditor cvFirst onSaved={() => { onProfileSaved(); setStep(3); window.scrollTo({ top: 0 }); }} />
          </Suspense>
        </section>
      )}

      {step === 3 && (
        <section className="card welcome-card">
          <h1>{tr({ ja: "準備ができました", en: "You are all set", fr: "Tout est prêt" })}</h1>
          <p>{tr({ ja: "まず何から始めますか？", en: "Where would you like to start?", fr: "Par quoi voulez-vous commencer ?" })}</p>
          <div className="welcome-next">
            <button type="button" onClick={() => onDone("apps")}>
              <BriefcaseIcon size={22} /><strong>{tr({ ja: "応募を追加する", en: "Add an application", fr: "Ajouter une candidature" })}</strong>
              <span>{tr({ ja: "選考の進み具合と締切をまとめます", en: "Track progress and deadlines", fr: "Suivre l'avancement et les échéances" })}</span>
            </button>
            <button type="button" onClick={() => onDone("documents")}>
              <DocIcon size={22} /><strong>{tr({ ja: "履歴書を作る", en: "Make my résumé", fr: "Créer mon CV japonais" })}</strong>
              <span>{tr({ ja: "登録したプロフィールからPDFを作ります", en: "A PDF built from your profile", fr: "Un PDF tiré de votre profil" })}</span>
            </button>
            <button type="button" onClick={() => onDone("home")}>
              <HomeIcon size={22} /><strong>{tr({ ja: "ホームを見る", en: "Go to the home page", fr: "Voir l'accueil" })}</strong>
              <span>{tr({ ja: "カレンダーと今日の予定", en: "Calendar and today's plans", fr: "Calendrier et programme du jour" })}</span>
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
