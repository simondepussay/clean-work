import { useEffect, useState } from "react";
import { fetchHealth, fetchMe, type Health, type Me } from "./api";
import { useAuth } from "./auth/auth";

type HealthState = { kind: "loading" } | { kind: "ready"; health: Health } | { kind: "offline" };

function Account() {
  const auth = useAuth();
  const [me, setMe] = useState<Me | null | "error">(null);

  useEffect(() => {
    if (auth.state.status !== "signedIn") return;
    auth.getToken()
      .then((token) => (token ? fetchMe(token) : null))
      .then((m) => setMe(m ?? "error"))
      .catch(() => setMe("error"));
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
        <div className="account">
          <p>
            ようこそ、<strong>{auth.state.name ?? auth.state.email}</strong>
            {me && me !== "error" && (
              <span className="muted"> · {me.hasProfile ? "プロフィール登録済み" : "プロフィール未登録 / no profile yet"}</span>
            )}
            {me === "error" && <span className="muted"> · API エラー / API error</span>}
          </p>
          <button onClick={() => auth.signOut()}>サインアウト / Sign out</button>
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
      <p className="status" role="status">
        {health.kind === "loading" && "API…"}
        {health.kind === "offline" && "API: オフライン / offline"}
        {health.kind === "ready" &&
          `API: ${health.health.status} · DB: ${health.health.database} · v${health.health.version}`}
      </p>
    </main>
  );
}
