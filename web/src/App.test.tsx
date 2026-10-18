import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deleteAccount, fetchHealth, fetchMe, TOKEN_HEADER } from "./api";
import App from "./App";
import { AuthContext, type Auth } from "./auth/auth";

afterEach(() => vi.unstubAllGlobals());

const json = (body: unknown, ok = true) => ({ ok, json: async () => body });
const health = { status: "ok", version: "abc123", database: "ok" };

/** Simule l'API : /api/health et /api/me. */
function stubApi(me: unknown = { userId: "u1", email: "simon@example.com", name: "Simon", hasProfile: false }) {
  const fetchMock = vi.fn(async (url: string) => (url === "/api/me" ? json(me) : json(health)));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderWith(auth: Partial<Auth>) {
  const value: Auth = { state: { status: "disabled" }, signIn: vi.fn(), signOut: vi.fn(), getToken: async () => null, ...auth };
  render(<AuthContext.Provider value={value}><App /></AuthContext.Provider>);
  return value;
}

describe("api", () => {
  it("fetchHealth renvoie null si l'API est injoignable", async () => {
    const fake = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    expect(await fetchHealth(fake as unknown as typeof fetch)).toBeNull();
  });

  it("fetchMe envoie le jeton dans l'en-tête x-shukatsu-token", async () => {
    const fake = vi.fn().mockResolvedValue(json({ userId: "u1" }));
    await fetchMe("jeton", fake as unknown as typeof fetch);
    expect(fake).toHaveBeenCalledWith("/api/me", { headers: { [TOKEN_HEADER]: "jeton" } });
  });

  it("fetchMe renvoie null si l'API refuse le jeton", async () => {
    const fake = vi.fn().mockResolvedValue(json({ error: "unauthorized" }, false));
    expect(await fetchMe("périmé", fake as unknown as typeof fetch)).toBeNull();
  });
});

describe("App", () => {
  it("affiche l'état de l'API", async () => {
    stubApi();
    renderWith({});
    expect(screen.getByRole("heading", { name: "就活パイロット" })).toBeInTheDocument();
    expect(await screen.findByText("API: ok · DB: ok · vabc123")).toBeInTheDocument();
  });

  it("indique quand l'API est hors ligne", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    renderWith({});
    expect(await screen.findByText("API: オフライン / offline")).toBeInTheDocument();
  });

  it("annonce la connexion à venir tant que l'annuaire n'est pas configuré", async () => {
    stubApi();
    renderWith({ state: { status: "disabled" } });
    expect(screen.getByText(/Sign-in coming soon/)).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("lance la connexion au clic", async () => {
    stubApi();
    const auth = renderWith({ state: { status: "signedOut" } });
    await userEvent.click(screen.getByRole("button", { name: /Sign in/ }));
    expect(auth.signIn).toHaveBeenCalled();
  });

  it("une fois connecté, appelle /api/me avec le jeton et affiche le compte", async () => {
    const fetchMock = stubApi();
    renderWith({ state: { status: "signedIn", email: "simon@example.com", name: "Simon" }, getToken: async () => "jeton" });
    expect(await screen.findByText(/プロフィール未登録/)).toBeInTheDocument();
    expect(screen.getByText("Simon")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/me", { headers: { [TOKEN_HEADER]: "jeton" } });
  });

  it("signale une erreur si l'API refuse le jeton", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (url === "/api/me" ? json({}, false) : json(health))));
    renderWith({ state: { status: "signedIn", email: "simon@example.com", name: null }, getToken: async () => "jeton" });
    expect(await screen.findByText(/API error/)).toBeInTheDocument();
  });

  it("se déconnecte au clic", async () => {
    stubApi();
    const auth = renderWith({ state: { status: "signedIn", email: "s@example.com", name: "Simon" }, getToken: async () => "jeton" });
    await userEvent.click(screen.getByRole("button", { name: /Sign out/ }));
    expect(auth.signOut).toHaveBeenCalled();
  });
});

describe("suppression du compte (S25)", () => {
  const signedIn = { state: { status: "signedIn", email: "s@example.com", name: "Simon" } as const, getToken: async () => "jeton" };

  it("deleteAccount envoie DELETE /api/me avec le jeton", async () => {
    const fake = vi.fn().mockResolvedValue({ ok: true });
    expect(await deleteAccount("jeton", fake as unknown as typeof fetch)).toBe(true);
    expect(fake).toHaveBeenCalledWith("/api/me", { method: "DELETE", headers: { [TOKEN_HEADER]: "jeton" } });
  });

  it("ne supprime rien si l'utilisateur annule", async () => {
    const fetchMock = stubApi();
    vi.stubGlobal("confirm", vi.fn(() => false));
    const auth = renderWith(signedIn);
    await userEvent.click(screen.getByRole("button", { name: /Delete account/ }));
    expect(fetchMock).not.toHaveBeenCalledWith("/api/me", expect.objectContaining({ method: "DELETE" }));
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("supprime puis déconnecte après confirmation", async () => {
    const fetchMock = stubApi();
    vi.stubGlobal("confirm", vi.fn(() => true));
    const auth = renderWith(signedIn);
    await userEvent.click(screen.getByRole("button", { name: /Delete account/ }));
    expect(fetchMock).toHaveBeenCalledWith("/api/me", { method: "DELETE", headers: { [TOKEN_HEADER]: "jeton" } });
    expect(auth.signOut).toHaveBeenCalled();
  });

  it("reste connecté et prévient si la suppression échoue", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) =>
      init?.method === "DELETE" ? json({ error: "deletion_not_configured" }, false) : url === "/api/me" ? json({ hasProfile: false }) : json(health)));
    vi.stubGlobal("confirm", vi.fn(() => true));
    const auth = renderWith(signedIn);
    await userEvent.click(screen.getByRole("button", { name: /Delete account/ }));
    expect(await screen.findByText(/Could not delete/)).toBeInTheDocument();
    expect(auth.signOut).not.toHaveBeenCalled();
  });
});
