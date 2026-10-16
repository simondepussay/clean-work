import { useEffect, useState } from "react";
import { fetchHealth, type Health } from "./api";

type State = { kind: "loading" } | { kind: "ready"; health: Health } | { kind: "offline" };

export default function App() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    fetchHealth().then((health) => setState(health ? { kind: "ready", health } : { kind: "offline" }));
  }, []);

  return (
    <main className="shell">
      <h1>就活パイロット</h1>
      <p className="tagline">Shukatsu Pilot — 留学生の就職活動をサポート</p>
      <p className="status" role="status">
        {state.kind === "loading" && "API…"}
        {state.kind === "offline" && "API: オフライン / offline"}
        {state.kind === "ready" &&
          `API: ${state.health.status} · DB: ${state.health.database} · v${state.health.version}`}
      </p>
    </main>
  );
}
