import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearApiCache, type Application } from "../api";
import { AuthContext, type Auth } from "../auth/auth";
import { setHelpLanguage } from "../es/guide";
import { DebriefPanel } from "./DebriefPanel";

afterEach(() => { vi.unstubAllGlobals(); clearApiCache(); });

const auth: Auth = { state: { status: "signedIn", email: "s@example.com", name: "Simon" }, signIn: vi.fn(), signOut: vi.fn(), getToken: async () => "jeton" };
const app = (p: Partial<Application> = {}): Application => ({
  id: "a1", company: "ソニー", status: "interview1", nextDeadline: null, createdAt: "t", updatedAt: "t",
  steps: [{ id: "s1", type: "interview1", dueDate: "2020-01-10", done: true }, { id: "s0", type: "es", dueDate: "2020-01-01", done: true }], ...p,
});
const advice = { language: "ja", summary: "落ち着いて話せました。", tips: ["逆質問を3つ用意しましょう。"], practice: ["入社後にしたい仕事は何ですか。"], createdAt: "2026-11-12T10:00:00Z" };

function server(base: Application, adviceReply?: () => Response) {
  let current = base;
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "PUT") {
      current = { ...current, ...JSON.parse(init.body as string) };
      return new Response(JSON.stringify(current));
    }
    if (init?.method === "POST") {
      if (adviceReply) return adviceReply();
      current = { ...current, debriefs: (current.debriefs ?? []).map((d) => ({ ...d, advice })) };
      return new Response(JSON.stringify({ application: current, remaining: { today: 4, month: 29 } }));
    }
    return new Response(JSON.stringify(url.endsWith("/api/debrief-usage") ? { today: 5, month: 30 } : {}));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
function renderPanel(base = app()) {
  setHelpLanguage("ja");
  const onChange = vi.fn();
  render(<AuthContext.Provider value={auth}><DebriefPanel application={base} onChange={onChange} onPractice={vi.fn()} /></AuthContext.Provider>);
  return onChange;
}

describe("DebriefPanel", () => {
  it("un nouveau bilan part du dernier entretien passé, s'enregistre, puis reçoit les conseils", async () => {
    const fetchMock = server(app());
    const user = userEvent.setup();
    const onChange = renderPanel();
    await user.click(screen.getByRole("button", { name: "振り返りを書く" }));
    // Seuls les entretiens sont proposés (pas l'ES), et le dernier passé est choisi.
    expect(screen.getByLabelText("どの面接")).toHaveValue("s1");
    expect(screen.getByLabelText("日付")).toHaveValue("2020-01-10");
    expect(screen.getByRole("button", { name: "AIのアドバイス" })).toBeDisabled();

    await user.type(screen.getByLabelText("聞かれた質問（1行に1つ）"), "志望動機");
    await user.click(screen.getByRole("button", { name: "AIのアドバイス" }));

    expect(await screen.findByText("落ち着いて話せました。")).toBeInTheDocument();
    const calls = fetchMock.mock.calls.filter(([, init]) => init?.method === "PUT" || init?.method === "POST");
    // Les notes d'abord (seul le champ debriefs), puis la demande de conseils.
    expect(calls[0][1]!.method).toBe("PUT");
    expect(Object.keys(JSON.parse(calls[0][1]!.body as string))).toEqual(["debriefs"]);
    expect(calls[1][0]).toMatch(/\/api\/applications\/a1\/debriefs\/[^/]+\/advice$/);
    expect(screen.getByText("入社後にしたい仕事は何ですか。")).toBeInTheDocument();
    expect(screen.getByText("AIアドバイス 残り：今日 4 · 今月 29")).toBeInTheDocument();
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "この内容で面接を練習する" })).toBeInTheDocument();
  });

  it("explique la limite du jour sous le bilan concerné", async () => {
    server(app({ debriefs: [{ id: "d1", date: "2026-11-11", questions: "志望動機" }] }),
      () => new Response(JSON.stringify({ error: "limit", reason: "day", retryAfter: "2026-11-13T00:00:00.000Z" }), { status: 429 }));
    const user = userEvent.setup();
    renderPanel(app({ debriefs: [{ id: "d1", date: "2026-11-11", questions: "志望動機" }] }));
    await user.click(screen.getByRole("button", { name: "AIのアドバイス" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("今日の上限です");
  });
});
