import { useEffect, useState } from "react";
import { deleteAccount, fetchHealth, fetchMe, type Health, type Me } from "./api";
import { useAuth } from "./auth/auth";
import { RETENTION_DAYS, SUPPORT_EMAIL } from "./config";
import { ApplicationsBoard } from "./apps/ApplicationsBoard";
import { EsPage, type EsSeed } from "./es/EsPage";
import { InterviewPage, type InterviewSeed } from "./interview/InterviewPage";
import { ProfileEditor } from "./profile/ProfileEditor";
import { ResumePanel } from "./profile/ResumePanel";

type HealthState = { kind: "loading" } | { kind: "ready"; health: Health } | { kind: "offline" };

function Account() {
  const auth = useAuth();
  const [me, setMe] = useState<Me | null | "error">(null);
  const [deleting, setDeleting] = useState<"idle" | "busy" | "error">("idle");
  const [tab, setTab] = useState<"profile" | "apps" | "es" | "interview">("profile");
  const [esSeed, setEsSeed] = useState<EsSeed | undefined>();
  const [interviewSeed, setInterviewSeed] = useState<InterviewSeed | undefined>();

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

  switch (auth.state.status) {
    case "disabled":
      return <p className="muted">サインインは準備中です / Sign-in coming soon</p>;
    case "loading":
      return <p className="muted">…</p>;
    case "signedOut":
      return (
        <button className="primary" onClick={() => auth.signIn()}>
          サインイン / Sign in
        </button>
      );
    case "signedIn":
      return (
        <div>
          <div className="account">
          <p>
            ようこそ、<strong>{auth.state.name ?? auth.state.email}</strong>
            {me && me !== "error" && (
              <span className="muted"> · {me.hasProfile ? "プロフィール登録済み" : "プロフィール未登録 / no profile yet"}</span>
            )}
            {me === "error" && <span className="muted"> · API エラー / API error</span>}
          </p>
          <div className="actions">
            <button onClick={() => auth.signOut()}>サインアウト / Sign out</button>
            <button className="danger" disabled={deleting === "busy"} onClick={removeAccount}>
              アカウント削除 / Delete account
            </button>
          </div>
          </div>
          {deleting === "error" && <p className="muted">削除できませんでした / Could not delete the account</p>}
          <nav className="tabs" role="tablist">
            <button role="tab" aria-selected={tab === "profile"} onClick={() => setTab("profile")}>プロフィール / Profile</button>
            <button role="tab" aria-selected={tab === "apps"} onClick={() => setTab("apps")}>応募 / Applications</button>
            <button role="tab" aria-selected={tab === "es"} onClick={() => setTab("es")}>ES</button>
            <button role="tab" aria-selected={tab === "interview"} onClick={() => setTab("interview")}>面接 / Interview</button>
          </nav>
          {tab === "profile" && <><ProfileEditor onSaved={refreshMe} /><ResumePanel /></>}
          {tab === "apps" && (
            <ApplicationsBoard
              onWriteEs={(a) => { setEsSeed({ company: a.company, applicationId: a.id, nonce: Date.now() }); setTab("es"); }}
              onPractice={(a) => { setInterviewSeed({ applicationId: a.id, nonce: Date.now() }); setTab("interview"); }} />
          )}
          {tab === "es" && <EsPage seed={esSeed} />}
          {tab === "interview" && <InterviewPage seed={interviewSeed} />}
        </div>
      );
  }
}

export default function App() {
  const [health, setHealth] = useState<HealthState>({ kind: "loading" });

  useEffect(() => {
    fetchHealth().then((h) => setHealth(h ? { kind: "ready", health: h } : { kind: "offline" }));
  }, []);

  return (
    <main className="shell">
      <h1>就活パイロット</h1>
      <p className="tagline">Shukatsu Pilot — 留学生の就職活動をサポート</p>
      <Account />
      <footer className="legal">
        <a href="/privacy.html">プライバシーポリシー / Privacy</a> · <a href="/terms.html">利用規約 / Terms</a>
      </footer>
      <p className="status" role="status">
        {health.kind === "loading" && "API…"}
        {health.kind === "offline" && "API: オフライン / offline"}
        {health.kind === "ready" &&
          `API: ${health.health.status} · DB: ${health.health.database} · v${health.health.version}`}
      </p>
    </main>
  );
}
