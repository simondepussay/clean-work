import { useEffect, useState } from "react";
import { deleteAccount, fetchHealth, fetchMe, type Health, type Me } from "./api";
import { useAuth } from "./auth/auth";
import { RETENTION_DAYS, SUPPORT_EMAIL } from "./config";
import { ApplicationsBoard } from "./apps/ApplicationsBoard";
import { EsPage, type EsSeed } from "./es/EsPage";
import { HomePage } from "./home/HomePage";
import { UserIcon } from "./icons";
import { InterviewPage, type InterviewSeed } from "./interview/InterviewPage";
import { ProfileEditor } from "./profile/ProfileEditor";
import { ResumePanel } from "./profile/ResumePanel";

type HealthState = { kind: "loading" } | { kind: "ready"; health: Health } | { kind: "offline" };
const VIEWS = ["home", "apps", "es", "interview", "documents", "account"] as const;
type View = (typeof VIEWS)[number];

function viewFromHash(): View {
  const hash = location.hash.slice(1);
  return (VIEWS as readonly string[]).includes(hash) ? (hash as View) : "home";
}

/** Les services de l'app, rassemblés au même endroit (la philosophie de « Clean Work »). */
const SERVICES: { view: Exclude<View, "home" | "account">; ja: string; en: string; text: string }[] = [
  { view: "apps", ja: "応募", en: "Applications", text: "選考の進み具合と締切 / Progress and deadlines" },
  { view: "es", ja: "ES", en: "Entry sheets", text: "書き方のガイドとAI添削 / Guide and AI review" },
  { view: "interview", ja: "面接", en: "Interview", text: "企業に合わせた模擬面接 / Mock interviews for each company" },
  { view: "documents", ja: "書類", en: "Documents", text: "履歴書・職務経歴書のPDF / Résumé PDFs" },
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
  const [deleting, setDeleting] = useState<"idle" | "busy" | "error">("idle");
  const signedIn = auth.state.status === "signedIn" ? auth.state : null;

  async function removeAccount() {
    const ok = window.confirm(
      `アカウントを削除しますか？データはすぐに見えなくなり、${RETENTION_DAYS}日後に完全に削除されます。` +
        `${RETENTION_DAYS}日以内なら ${SUPPORT_EMAIL} に連絡すると復元できます。\n\n` +
        `Delete your account? Your data disappears immediately and is permanently deleted after ${RETENTION_DAYS} days. ` +
        `Within ${RETENTION_DAYS} days, you can ask ${SUPPORT_EMAIL} to restore it.`,
    );
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
          <h2>アカウント <span>Account</span></h2>
          <p><strong>{signedIn?.name ?? signedIn?.email}</strong>{signedIn?.name && signedIn.email && <span className="muted"> · {signedIn.email}</span>}</p>
          <p className="muted">
            {me && me !== "error" && (me.hasProfile ? "プロフィール登録済み / Profile saved" : "プロフィール未登録 / no profile yet")}
            {me === "error" && "API エラー / API error"}
          </p>
        </div>
        <div className="actions">
          <button onClick={() => auth.signOut()}>サインアウト / Sign out</button>
          <button className="danger" disabled={deleting === "busy"} onClick={removeAccount}>アカウント削除 / Delete account</button>
        </div>
        {deleting === "error" && <p className="muted">削除できませんでした / Could not delete the account</p>}
      </section>
      <ProfileEditor onSaved={onSaved} />
    </>
  );
}

function SignedOut() {
  const auth = useAuth();
  return (
    <section className="hero welcome">
      <p className="eyebrow">留学生のための就活アプリ · For international students in Japan</p>
      <h1>Clean Work</h1>
      <p className="lead">就活に必要なものを、ひとつの場所に。<span>Everything for your job hunt, in one place.</span></p>
      <ul className="features">
        {SERVICES.map((s) => <li key={s.view}><strong>{s.ja} / {s.en}</strong><small>{s.text}</small></li>)}
      </ul>
      {auth.state.status === "signedOut" && (
        <button className="primary large" onClick={() => auth.signIn()}>サインイン / Sign in</button>
      )}
      {auth.state.status === "disabled" && <p className="muted">サインインは準備中です / Sign-in coming soon</p>}
      {auth.state.status === "loading" && <p className="muted">…</p>}
    </section>
  );
}

export default function App() {
  const auth = useAuth();
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
        <button className="brand" onClick={() => open("home")} aria-label="Clean Work — ホーム / Home">
          <Logo />
          <span>Clean Work</span>
        </button>
        {signedIn ? (
          <button className={`avatar${view === "account" ? " current" : ""}`} onClick={() => open("account")}
            aria-label="アカウント / Account" title={signedIn.name ?? signedIn.email ?? ""}>
            <UserIcon size={22} />
          </button>
        ) : (
          auth.state.status === "signedOut" && <button className="primary" onClick={() => auth.signIn()}>サインイン / Sign in</button>
        )}
      </header>

      {/* Le menu en intercalaires de classeur : chaque page est une feuille, l'onglet actif tient à la feuille. */}
      <div className="binder">
        {signedIn && (
          <nav className="tabs" role="tablist" aria-label="メニュー / Menu">
            {[{ view: "home" as View, ja: "ホーム", en: "Home" }, ...SERVICES].map((s) => (
              <button key={s.view} role="tab" aria-selected={view === s.view} onClick={() => open(s.view)}>
                {s.ja}<span>{s.en}</span>
              </button>
            ))}
          </nav>
        )}
        <main className={signedIn ? "shell sheet" : "shell"}>
          {!signedIn && <SignedOut />}
          {signedIn && view === "home" && <HomePage name={signedIn.name} onOpenApps={() => open("apps")} />}
          {signedIn && view === "account" && <Account me={me} onSaved={refreshMe} />}
          {signedIn && view === "apps" && (
            <ApplicationsBoard
              onWriteEs={(a) => { setEsSeed({ company: a.company, applicationId: a.id, nonce: Date.now() }); open("es"); }}
              onPractice={(a) => { setInterviewSeed({ applicationId: a.id, nonce: Date.now() }); open("interview"); }} />
          )}
          {signedIn && view === "es" && <EsPage seed={esSeed} />}
          {signedIn && view === "interview" && <InterviewPage seed={interviewSeed} />}
          {signedIn && view === "documents" && <ResumePanel />}
        </main>
      </div>

      <footer className="footer">
        <span>© Clean Work</span>
        <a href="/privacy.html">プライバシーポリシー / Privacy</a>
        <a href="/terms.html">利用規約 / Terms</a>
        <span className="status" role="status">
          {health.kind === "loading" && "API…"}
          {health.kind === "offline" && "API: オフライン / offline"}
          {health.kind === "ready" && `API: ${health.health.status} · DB: ${health.health.database} · v${health.health.version}`}
        </span>
      </footer>
    </div>
  );
}
