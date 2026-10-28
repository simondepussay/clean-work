import { lazy, Suspense, useEffect, useState } from "react";
import { PageErrorBoundary } from "./PageErrorBoundary";
import { loadedFine } from "./reloadOnNewVersion";
import { Loader } from "./Loader";
import { clearApiCache, deleteAccount, fetchHealth, fetchMe, type Health, type Me } from "./api";
import { useAuth } from "./auth/auth";
import { RETENTION_DAYS, SUPPORT_EMAIL } from "./config";
import type { EsSeed } from "./es/EsPage";
import { HomePage } from "./home/HomePage";
import { KokoroLoading } from "./kokoro/KokoroSky";

// Chaque onglet est chargé la première fois qu'on l'ouvre : l'accueil s'affiche sans attendre le reste.
const ApplicationsBoard = lazy(() => import("./apps/ApplicationsBoard").then((m) => (loadedFine(), { default: m.ApplicationsBoard })));
const EsPage = lazy(() => import("./es/EsPage").then((m) => (loadedFine(), { default: m.EsPage })));
const InterviewPage = lazy(() => import("./interview/InterviewPage").then((m) => (loadedFine(), { default: m.InterviewPage })));
const DocumentsPage = lazy(() => import("./profile/DocumentsPage").then((m) => (loadedFine(), { default: m.DocumentsPage })));
const ResumePanel = lazy(() => import("./profile/ResumePanel").then((m) => (loadedFine(), { default: m.ResumePanel })));
const KokoroPage = lazy(() => import("./kokoro/KokoroPage").then((m) => (loadedFine(), { default: m.KokoroPage })));
const InfoPage = lazy(() => import("./info/InfoPage").then((m) => (loadedFine(), { default: m.InfoPage })));
const BetaPage = lazy(() => import("./beta/BetaPage").then((m) => (loadedFine(), { default: m.BetaPage })));
const ProfileEditor = lazy(() => import("./profile/ProfileEditor").then((m) => (loadedFine(), { default: m.ProfileEditor })));
import { UserIcon } from "./icons";
import { LanguageMenu } from "./LanguageMenu";
import { useTr, type T3 } from "./i18n";
import type { InterviewSeed } from "./interview/InterviewPage";

type HealthState = { kind: "loading" } | { kind: "ready"; health: Health } | { kind: "offline" };
const VIEWS = ["home", "kokoro", "apps", "es", "interview", "documents", "info", "account", "beta"] as const;
type View = (typeof VIEWS)[number];

function viewFromHash(): View {
  const hash = location.hash.slice(1);
  return (VIEWS as readonly string[]).includes(hash) ? (hash as View) : "home";
}

/** Les services de l'app, rassemblés au même endroit (la philosophie de « Clean Work »). */
const SERVICES: { view: Exclude<View, "home" | "account">; ja: string; en: string; name: T3; text: T3 }[] = [
  { view: "kokoro", ja: "こころ", en: "Mind", name: { ja: "こころ", en: "Mind", fr: "Esprit" }, text: { ja: "こころの天気と、面接前の3分", en: "Your inner weather, and 3 minutes before interviews", fr: "Météo intérieure et 3 minutes avant l'entretien" } },
  { view: "apps", ja: "応募", en: "Applications", name: { ja: "応募", en: "Applications", fr: "Candidatures" }, text: { ja: "選考の進み具合と締切", en: "Progress and deadlines", fr: "Avancement et échéances" } },
  { view: "interview", ja: "面接", en: "Interview", name: { ja: "面接", en: "Interview", fr: "Entretiens" }, text: { ja: "企業に合わせた模擬面接", en: "Mock interviews for each company", fr: "Entretiens simulés pour chaque entreprise" } },
  { view: "documents", ja: "書類", en: "Documents", name: { ja: "書類", en: "Documents", fr: "Documents" }, text: { ja: "ES（AI添削）と履歴書・職務経歴書のPDF", en: "Entry sheets (AI review) and résumé PDFs", fr: "ES (relecture par IA) et CV japonais en PDF" } },
  { view: "info", ja: "情報", en: "Info", name: { ja: "情報", en: "Info", fr: "Infos" }, text: { ja: "就活ニュース・求人サイト・役立つリンク", en: "Job news, job sites and useful links", fr: "Actualité, sites d'offres et liens utiles" } },
];

/** Marque « Clean Work » : un trait de vague, rappel des lignes du fond. */
function Logo() {
  return (
    <svg className="logo-mark" viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="15" fill="var(--blue-700)" />
      <path d="M6 18c3.3-4 6.7-4 10 0s6.7 4 10 0" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="23" cy="10" r="2.6" fill="var(--bordeaux)" />
    </svg>
  );
}

/** Page « compte » (icône en haut à droite) : le compte, puis le profil du 履歴書. */
function Account({ me, onSaved }: { me: Me | null | "error"; onSaved: () => void }) {
  const auth = useAuth();
  const tr = useTr();
  const [deleting, setDeleting] = useState<"idle" | "busy" | "error">("idle");
  const signedIn = auth.state.status === "signedIn" ? auth.state : null;

  async function removeAccount() {
    const ok = window.confirm(tr({
      ja: `アカウントを削除しますか？データはすぐに見えなくなり、${RETENTION_DAYS}日後に完全に削除されます。${RETENTION_DAYS}日以内なら ${SUPPORT_EMAIL} に連絡すると復元できます。`,
      en: `Delete your account? Your data disappears immediately and is permanently deleted after ${RETENTION_DAYS} days. Within ${RETENTION_DAYS} days, you can ask ${SUPPORT_EMAIL} to restore it.`,
      fr: `Supprimer votre compte ? Vos données disparaissent tout de suite et sont effacées définitivement après ${RETENTION_DAYS} jours. Pendant ${RETENTION_DAYS} jours, vous pouvez demander leur restauration à ${SUPPORT_EMAIL}.`,
    }));
    if (!ok) return;
    setDeleting("busy");
    const token = await auth.getToken();
    if (token && (await deleteAccount(token).catch(() => false))) {
      await auth.signOut();
    } else {
      setDeleting("error");
    }
  }

  return (
    <>
      <section className="card account">
        <div>
          <h2>{tr({ ja: "アカウント", en: "Account", fr: "Compte" })}</h2>
          <p><strong>{signedIn?.name ?? signedIn?.email}</strong>{signedIn?.name && signedIn.email && <span className="muted"> · {signedIn.email}</span>}</p>
          <p className="muted">
            {me && me !== "error" && (me.hasProfile ? tr({ ja: "プロフィール登録済み", en: "Profile saved", fr: "Profil enregistré" }) : tr({ ja: "プロフィール未登録", en: "No profile yet", fr: "Pas encore de profil" }))}
            {me === "error" && tr({ ja: "API エラー", en: "API error", fr: "Erreur de l'API" })}
          </p>
        </div>
        <div className="actions">
          <button onClick={() => { clearApiCache(); auth.signOut(); }}>{tr({ ja: "サインアウト", en: "Sign out", fr: "Se déconnecter" })}</button>
          <button className="danger" disabled={deleting === "busy"} onClick={removeAccount}>{tr({ ja: "アカウント削除", en: "Delete account", fr: "Supprimer le compte" })}</button>
        </div>
        {deleting === "error" && <p className="muted">{tr({ ja: "削除できませんでした", en: "Could not delete the account", fr: "Impossible de supprimer le compte" })}</p>}
      </section>
      <ProfileEditor onSaved={onSaved} />
    </>
  );
}

function SignedOut() {
  const auth = useAuth();
  const tr = useTr();
  return (
    <section className="hero welcome">
      <p className="eyebrow">{tr({ ja: "日本人も外国人も使える就活アプリ", en: "Job hunting in Japan, for Japanese and international students", fr: "La recherche d'emploi au Japon, pour Japonais et étrangers" })}</p>
      <h1>Clean Work</h1>
      <p className="lead">{tr({ ja: "迷わない毎日へ。", en: "Toward days without feeling lost.", fr: "Vers des journées où l'on ne se perd plus." })}</p>
      {auth.state.status === "signedOut" && auth.state.error && (
        <p role="alert" className="notice signin-error">{auth.state.error === "user_cancelled"
          ? tr({ ja: "サインインがキャンセルされました。", en: "Sign-in was cancelled.", fr: "La connexion a été annulée." })
          : auth.state.error === "session_expired"
          ? tr({ ja: "サインインの有効期限が切れました。もう一度サインインしてください。", en: "Your session has expired. Please sign in again.", fr: "Votre session a expiré. Reconnectez-vous." })
          : tr({ ja: "サインインできませんでした。削除したアカウントは使えません。別のアカウントでお試しください。", en: "Could not sign in. A deleted account can no longer be used; try another account.", fr: "Connexion impossible. Un compte supprimé ne peut plus être utilisé : essayez avec un autre compte." })}</p>
      )}
      {auth.state.status === "signedOut" && (
        <div className="welcome-actions">
          <button className="primary large" onClick={() => auth.signIn()}>{tr({ ja: "サインイン", en: "Sign in", fr: "Se connecter" })}</button>
          {auth.signUp && (
            <button className="large" onClick={() => auth.signUp?.()}>{tr({ ja: "アカウントを作成", en: "Create an account", fr: "Créer un compte" })}</button>
          )}
        </div>
      )}
      {auth.state.status === "disabled" && <p className="muted">{tr({ ja: "サインインは準備中です", en: "Sign-in coming soon", fr: "Connexion bientôt disponible" })}</p>}
      {auth.state.status === "loading" && <Loader />}
    </section>
  );
}

export default function App() {
  const auth = useAuth();
  const tr = useTr();
  const [health, setHealth] = useState<HealthState>({ kind: "loading" });
  const [view, setView] = useState<View>(viewFromHash);
  const [me, setMe] = useState<Me | null | "error">(null);
  const [esSeed, setEsSeed] = useState<EsSeed | undefined>();
  const [interviewSeed, setInterviewSeed] = useState<InterviewSeed | undefined>();
  const signedIn = auth.state.status === "signedIn" ? auth.state : null;

  useEffect(() => {
    fetchHealth().then((h) => setHealth(h ? { kind: "ready", health: h } : { kind: "offline" }));
  }, []);

  const refreshMe = () =>
    auth.getToken()
      .then((token) => (token ? fetchMe(token) : null))
      .then((m) => setMe(m ?? "error"))
      .catch(() => setMe("error"));

  useEffect(() => {
    if (auth.state.status === "signedIn") refreshMe();
    // On ne relance que quand l'état de connexion change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.state.status]);

  // Chaque page a son adresse (#apps, #es…) : le bouton « retour » du navigateur fonctionne,
  // et on peut garder une page en favori.
  useEffect(() => {
    const onHash = () => setView(viewFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const open = (v: View) => {
    setView(v);
    if (viewFromHash() !== v) history.pushState(null, "", v === "home" ? `${location.pathname}${location.search}` : `#${v}`);
    window.scrollTo?.({ top: 0 });
  };

  return (
    <div className="page">
      <div className="waves" aria-hidden="true" />
      <header className="topbar">
        <button className="brand" onClick={() => open("home")} aria-label={`Clean Work — ${tr({ ja: "ホーム", en: "Home", fr: "Accueil" })}`}>
          <Logo />
          <span>Clean Work</span>
        </button>
        <div className="topbar-tools">
        <LanguageMenu />
        {signedIn ? (
          <button className={`avatar round-button${view === "account" ? " current" : ""}`} onClick={() => open("account")}
            aria-label={tr({ ja: "アカウント", en: "Account", fr: "Compte" })} title={signedIn.name ?? signedIn.email ?? ""}>
            <UserIcon size={22} />
          </button>
        ) : (
          auth.state.status === "signedOut" && <button className="primary" onClick={() => auth.signIn()}>{tr({ ja: "サインイン", en: "Sign in", fr: "Se connecter" })}</button>
        )}
        </div>
      </header>

      {/* Le menu en intercalaires de classeur : chaque page est une feuille, l'onglet actif tient à la feuille. */}
      <div className="binder">
        {signedIn && (
          <nav className="tabs" role="tablist" aria-label={tr({ ja: "メニュー", en: "Menu", fr: "Menu" })}>
            {[{ view: "home" as View, ja: "ホーム", en: "Home" }, ...SERVICES].map((s) => (
              <button key={s.view} data-view={s.view} role="tab" aria-selected={view === s.view || (s.view === "documents" && view === "es")} onClick={() => open(s.view)}>
                {s.ja}<span>{s.en}</span>
              </button>
            ))}
          </nav>
        )}
        <main className={signedIn ? "shell sheet" : "shell"}>
          <PageErrorBoundary key={view}
            message={tr({ ja: "このページを表示できませんでした。新しいバージョンが公開された可能性があります。", en: "This page could not be displayed. A new version may have been published.", fr: "Cette page n'a pas pu s'afficher. Une nouvelle version a peut-être été mise en ligne." })}
            action={tr({ ja: "再読み込み", en: "Reload", fr: "Recharger" })}>
            <Suspense fallback={view === "kokoro" ? <KokoroLoading label={tr({ ja: "読み込み中", en: "Loading", fr: "Chargement" })} /> : <Loader />}>
              {/* La page de la bêta est ouverte à tous, connecté ou non. */}
              {view === "beta" && <BetaPage />}
              {!signedIn && view !== "beta" && <SignedOut />}
              {signedIn && view === "home" && (
                <HomePage name={signedIn.name} onOpenApps={() => open("apps")}
                  onPractice={(t) => { setInterviewSeed({ ...t, nonce: Date.now() }); open("interview"); }} />
              )}
              {signedIn && view === "account" && <Account me={me} onSaved={refreshMe} />}
              {signedIn && view === "apps" && (
                <ApplicationsBoard
                  onWriteEs={(a) => { setEsSeed({ company: a.company, applicationId: a.id, nonce: Date.now() }); open("es"); }}
                  onPractice={(a) => { setInterviewSeed({ applicationId: a.id, nonce: Date.now() }); open("interview"); }} />
              )}
              {signedIn && (view === "es" || view === "documents") && (
                <DocumentsPage current={view === "es" ? "es" : "pdf"} onChoose={(d) => open(d === "es" ? "es" : "documents")}>
                  {view === "es" ? <EsPage seed={esSeed} /> : <ResumePanel />}
                </DocumentsPage>
              )}
              {signedIn && view === "interview" && <InterviewPage seed={interviewSeed} />}
              {signedIn && view === "kokoro" && (
                <KokoroPage onOpen={(t) => {
                  if (t.tab === "interview" && t.applicationId) { setInterviewSeed({ applicationId: t.applicationId, nonce: Date.now() }); open("interview"); }
                  else if (t.tab === "documents" && t.applicationId && t.company) { setEsSeed({ company: t.company, applicationId: t.applicationId, nonce: Date.now() }); open("es"); }
                  else open(t.tab === "documents" ? "es" : t.tab === "interview" ? "interview" : t.tab);
                }} />
              )}
              {signedIn && view === "info" && <InfoPage />}
            </Suspense>
          </PageErrorBoundary>
        </main>
      </div>

      <footer className="footer">
        <span>© Clean Work</span>
        <a href="/privacy.html">{tr({ ja: "プライバシーポリシー", en: "Privacy policy", fr: "Confidentialité" })}</a>
        <a href="/terms.html">{tr({ ja: "利用規約", en: "Terms of use", fr: "Conditions d'utilisation" })}</a>
        <a href="#beta" className="footer-beta" onClick={(e) => { e.preventDefault(); open("beta"); }}>
          {tr({ ja: "βテストに参加", en: "Join the beta", fr: "Rejoindre la bêta" })}
        </a>
        <span className="status" role="status">
          {health.kind === "loading" && "API…"}
          {health.kind === "offline" && `API: ${tr({ ja: "オフライン", en: "offline", fr: "hors ligne" })}`}
          {health.kind === "ready" && `API: ${health.health.status} · DB: ${health.health.database} · v${health.health.version}`}
        </span>
      </footer>
    </div>
  );
}
