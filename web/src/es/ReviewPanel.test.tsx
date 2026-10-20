import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type Auth } from "../auth/auth";
import { ReviewPanel } from "./ReviewPanel";

afterEach(() => vi.unstubAllGlobals());

const auth: Auth = { state: { status: "signedIn", email: "s@example.com", name: "Simon" }, signIn: vi.fn(), signOut: vi.fn(), getToken: async () => "jeton" };
const review = {
  id: "r1", draftId: "d1", createdAt: "2026-10-20T10:00:00Z", language: "fr", bodySnapshot: "御社で働きたい", score: 65,
  summary: "Bon début.", strengths: ["Clair"],
  issues: [{ category: "keigo", quote: "御社", problem: "« 御社 » s'emploie à l'oral.", suggestion: "貴社" }],
};

function api(post: { status: number; body: unknown }, usage = { today: 9, month: 29 }) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") return { status: post.status, ok: post.status < 300, json: async () => post.body };
    if (url.endsWith("/reviews")) return { status: 200, ok: true, json: async () => [] };
    return { status: 200, ok: true, json: async () => usage };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderPanel(onApply = vi.fn(), prepare = vi.fn(async () => "d1")) {
  render(<AuthContext.Provider value={auth}><ReviewPanel draftId="d1" prepare={prepare} onApply={onApply} /></AuthContext.Provider>);
  return { onApply, prepare };
}

describe("ReviewPanel", () => {
  it("affiche les relectures restantes", async () => {
    api({ status: 201, body: review });
    renderPanel();
    expect(await screen.findByText(/今日 9 · 今月 29/)).toBeInTheDocument();
  });

  it("enregistre, relit dans la langue choisie et affiche le résultat", async () => {
    const fetchMock = api({ status: 201, body: review });
    const { prepare } = renderPanel();
    await userEvent.selectOptions(screen.getByLabelText(/Explanations/), "fr");
    await userEvent.click(screen.getByRole("button", { name: /AI review/ }));

    expect(await screen.findByText("65")).toBeInTheDocument();
    expect(screen.getByText("« 御社 » s'emploie à l'oral.")).toBeInTheDocument();
    expect(prepare).toHaveBeenCalled();
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST")!;
    expect(post[0]).toBe("/api/drafts/d1/review");
    expect(JSON.parse(post[1]!.body as string)).toEqual({ language: "fr" });
  });

  it("applique une correction une seule fois", async () => {
    api({ status: 201, body: review });
    const { onApply } = renderPanel();
    await userEvent.click(screen.getByRole("button", { name: /AI review/ }));
    await userEvent.click(await screen.findByRole("button", { name: /Apply/ }));
    expect(onApply).toHaveBeenCalledWith("御社", "貴社");
    expect(screen.getByRole("button", { name: /Applied/ })).toBeDisabled();
  });

  it("explique la limite du jour avec la date de reprise", async () => {
    api({ status: 429, body: { error: "limit", reason: "day", retryAfter: "2026-10-21T00:00:00.000Z" } });
    renderPanel();
    await userEvent.click(screen.getByRole("button", { name: /AI review/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/上限/);
  });

  it("précise qu'un échec n'est pas compté", async () => {
    api({ status: 502, body: { error: "ai_failed" } });
    renderPanel();
    await userEvent.click(screen.getByRole("button", { name: /AI review/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/not counted/);
  });

  it("désactive le bouton quand il ne reste plus de relecture aujourd'hui", async () => {
    api({ status: 201, body: review }, { today: 0, month: 20 });
    renderPanel();
    await screen.findByText(/今日 0/);
    expect(screen.getByRole("button", { name: /AI review/ })).toBeDisabled();
  });
});
