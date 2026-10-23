import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type Auth } from "../auth/auth";
import { InterviewPage } from "./InterviewPage";
import { stageFor } from "./stages";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const auth: Auth = { state: { status: "signedIn", email: "s@example.com", name: "Simon" }, signIn: vi.fn(), signOut: vi.fn(), getToken: async () => "jeton" };

const sony = { id: "a1", company: "ソニー", position: "エンジニア", status: "interview2", steps: [], nextDeadline: null, createdAt: "", updatedAt: "", notes: "ゲーム" };
const turns = [
  { question: "自己紹介をお願いします。", intent: "Clarté", kind: "main" },
  { question: "志望動機を教えてください。", intent: "Motivation", kind: "main" },
];
const session = (over: object = {}) => ({
  id: "i1", company: "ソニー", applicationId: "a1", stage: "interview2", language: "fr", status: "active",
  turns, createdAt: "2026-10-23T03:00:00Z", updatedAt: "", ...over,
});
const feedback = { score: 72, comment: "Clair et structuré.", improvements: ["Ajoute un chiffre."], expressions: [{ quote: "バイト", suggestion: "アルバイト" }] };

/** Faux serveur : renvoie une réponse selon l'URL et la méthode, et garde les requêtes. */
function server(routes: Record<string, { status?: number; body: unknown }>) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${url}`;
    const route = routes[key] ?? { body: [] };
    const status = route.status ?? 200;
    return { status, ok: status < 300, json: async () => route.body };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const base = {
  "GET /api/applications": { body: [sony] },
  "GET /api/interviews": { body: [] },
  "GET /api/interview-usage": { body: { today: 3, month: 20 } },
};

const renderPage = (seed?: { applicationId: string; nonce: number }) =>
  render(<AuthContext.Provider value={auth}><InterviewPage seed={seed} /></AuthContext.Provider>);

describe("InterviewPage", () => {
  it("l'étape proposée suit le statut de la candidature", () => {
    expect(stageFor(undefined)).toBe("interview1");
    expect(stageFor({ ...sony, status: "es" } as never)).toBe("interview1");
    expect(stageFor({ ...sony, status: "interview2" } as never)).toBe("interview2");
    expect(stageFor({ ...sony, status: "offer" } as never)).toBe("final");
  });

  it("venu d'une candidature : entreprise et étape présélectionnées, puis la séance démarre", async () => {
    const fetchMock = server({ ...base, "POST /api/interviews": { status: 201, body: session() } });
    renderPage({ applicationId: "a1", nonce: 1 });
    expect(await screen.findByText(/今日 3回/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^企業$/)).toHaveValue("a1");
    await waitFor(() => expect(screen.getByLabelText(/選考段階/)).toHaveValue("interview2"));

    await userEvent.click(screen.getByRole("button", { name: /面接を始める/ }));
    expect(await screen.findByText("自己紹介をお願いします。")).toBeInTheDocument();
    const post = fetchMock.mock.calls.find(([url, init]) => url === "/api/interviews" && init?.method === "POST")!;
    expect(JSON.parse(post[1]!.body as string)).toEqual({ applicationId: "a1", stage: "interview2", language: "ja" });
  });

  it("répondre par écrit : avis affiché, puis question suivante, puis bilan", async () => {
    const answered = session({ turns: [{ ...turns[0], answer: "バイトを頑張りました。", spoken: false, feedback }, turns[1]] });
    const finished = session({
      status: "finished", turns: [answered.turns[0]],
      summary: { score: 70, summary: "Bonne base.", strengths: ["Clair"], improvements: ["Chiffres"] },
    });
    const fetchMock = server({
      ...base,
      "POST /api/interviews": { status: 201, body: session() },
      "POST /api/interviews/i1/answers": { body: answered },
      "POST /api/interviews/i1/finish": { body: finished },
    });
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: /面接を始める/ }));
    await userEvent.type(await screen.findByLabelText(/あなたの回答/), "バイトを頑張りました。");
    await userEvent.click(screen.getByRole("button", { name: /^回答する/ }));

    const card = await screen.findByLabelText(/フィードバック/);
    expect(within(card).getByText("72/100")).toBeInTheDocument();
    expect(within(card).getByText("Ajoute un chiffre.")).toBeInTheDocument();
    expect(within(card).getByText("アルバイト")).toBeInTheDocument();
    const body = JSON.parse(fetchMock.mock.calls.find(([url]) => url === "/api/interviews/i1/answers")![1]!.body as string);
    expect(body).toEqual({ answer: "バイトを頑張りました。", spoken: false });

    await userEvent.click(screen.getByRole("button", { name: /次の質問へ/ }));
    expect(screen.getByText("志望動機を教えてください。")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /ここで終了/ }));
    expect(await screen.findByText("Bonne base.")).toBeInTheDocument();
    expect(screen.getByText("Chiffres")).toBeInTheDocument();
  });

  it("propose d'abord l'entretien prévu dans la candidature, et la séance y est rattachée", async () => {
    const soon = new Date(Date.now() + 3 * 86400_000);
    const date = `${soon.getFullYear()}-${String(soon.getMonth() + 1).padStart(2, "0")}-${String(soon.getDate()).padStart(2, "0")}`;
    const fetchMock = server({
      ...base,
      "GET /api/applications": { body: [{ ...sony, steps: [{ id: "st1", type: "final", dueDate: date, done: false }] }] },
      "POST /api/interviews": { status: 201, body: session() },
    });
    renderPage();
    const which = await screen.findByLabelText(/どの面接の練習/);
    await waitFor(() => expect(which).toHaveValue("step:a1:st1"));
    expect(screen.queryByLabelText(/^企業$/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /面接を始める/ }));
    const post = fetchMock.mock.calls.find(([url, init]) => url === "/api/interviews" && init?.method === "POST")!;
    expect(JSON.parse(post[1]!.body as string)).toEqual({ applicationId: "a1", stepId: "st1", stage: "final", language: "ja" });
  });

  it("limite atteinte : message clair, pas de séance", async () => {
    server({ ...base, "POST /api/interviews": { status: 429, body: { error: "limit", reason: "day", retryAfter: "2026-10-24T00:00:00Z" } } });
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: /面接を始める/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/上限/);
  });

  it("navigateur sans reconnaissance vocale : on propose d'écrire", async () => {
    server({ ...base, "POST /api/interviews": { status: 201, body: session() } });
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: /面接を始める/ }));
    expect(await screen.findByText(/音声入力が使えません/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /話して答える/ })).not.toBeInTheDocument();
  });

  it("réponse dictée : le texte reconnu remplit la réponse, envoyée comme orale avec sa durée", async () => {
    // Fausse reconnaissance vocale du navigateur.
    let instance: { onresult: (e: unknown) => void; onend: () => void } | null = null;
    class FakeRecognition {
      lang = ""; continuous = false; interimResults = false;
      onresult: ((e: unknown) => void) | null = null; onerror = null; onend: (() => void) | null = null;
      start() { instance = this as never; }
      stop() { this.onend?.(); }
    }
    vi.stubGlobal("webkitSpeechRecognition", FakeRecognition);
    const fetchMock = server({
      ...base,
      "POST /api/interviews": { status: 201, body: session() },
      "POST /api/interviews/i1/answers": { body: session({ turns: [{ ...turns[0], answer: "私はシモンです", spoken: true, durationSec: 0, feedback }, turns[1]] }) },
    });
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: /面接を始める/ }));
    await userEvent.click(await screen.findByRole("button", { name: /話して答える/ }));
    act(() => instance!.onresult({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: "私はシモンです" } }] }));
    expect(screen.getByLabelText(/あなたの回答/)).toHaveValue("私はシモンです");
    await userEvent.click(screen.getByRole("button", { name: /話し終わった/ }));
    await userEvent.click(screen.getByRole("button", { name: /^回答する/ }));
    await screen.findByLabelText(/フィードバック/);
    const body = JSON.parse(fetchMock.mock.calls.find(([url]) => url === "/api/interviews/i1/answers")![1]!.body as string);
    expect(body).toMatchObject({ answer: "私はシモンです", spoken: true });
    expect(typeof body.durationSec).toBe("number");
  });
});
