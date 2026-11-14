import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deleteAccount, fetchHealth, fetchMe, TOKEN_HEADER } from "./api";
import App from "./App";
import { AuthContext, type Auth } from "./auth/auth";
import { setHelpLanguage } from "./es/guide";

afterEach(() => {
  vi.unstubAllGlobals();
  history.replaceState(null, "", "/");
  localStorage.removeItem("welcome-later:simon@example.com");
});

const json = (body: unknown, ok = true) => ({ ok, json: async () => body });
const health = { status: "ok", version: "abc123", database: "ok" };

/** Simule l'API : /api/health et /api/me. */
function stubApi(me: unknown = { userId: "u1", email: "simon@example.com", name: "Simon", hasProfile: false }) {
  // Comme le vrai serveur : /api/me, une liste d'ES (vide), l'état de l'API pour le reste.
  const fetchMock = vi.fn(async (url: string) => (url === "/api/me" ? json(me) : url === "/api/drafts" ? json([]) : json(health)));
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
    expect(screen.getByRole("heading", { name: "Clean Work" })).toBeInTheDocument();
    // Tout va bien : rien d'affiché, la version reste dans le code de la page.
    await waitFor(() => expect(screen.getByRole("status")).toHaveAttribute("data-version", "abc123"));
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("indique quand l'API est hors ligne", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    renderWith({});
    expect(await screen.findByText("サーバーに接続できません")).toBeInTheDocument();
  });

  it("nouveau compte sans profil : l'écran de bienvenue remplace le classeur, sauf après « あとで »", async () => {
    setHelpLanguage("ja");
    stubApi();
    const signedIn = { state: { status: "signedIn" as const, email: "simon@example.com", name: "Simon" }, getToken: async () => "jeton" };
    const first = renderWith(signedIn);
    expect(await screen.findByRole("heading", { name: "Simonさん、ようこそ" })).toBeInTheDocument();
    expect(screen.queryByRole("tablist")).toBeNull();
    // Le compte reste accessible (se déconnecter) pendant la bienvenue.
    expect(screen.getByRole("button", { name: /アカウント/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "あとで登録する" }));
    expect(await screen.findByRole("tablist")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Simonさん、ようこそ" })).toBeNull();
    expect(first.signOut).not.toHaveBeenCalled();
  });

  it("un compte qui a déjà un profil arrive directement sur le classeur", async () => {
    stubApi({ userId: "u1", email: "simon@example.com", name: "Simon", hasProfile: true });
    renderWith({ state: { status: "signedIn", email: "simon@example.com", name: "Simon" }, getToken: async () => "jeton" });
    expect(await screen.findByRole("tablist")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("heading", { name: /ようこそ/ })).toBeNull());
  });

  it("annonce la connexion à venir tant que l'annuaire n'est pas configuré", async () => {
    stubApi();
    renderWith({ state: { status: "disabled" } });
    expect(screen.getByText(/サインインは準備中です/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /サインイン/ })).toBeNull();
  });

  it("toute l'interface suit la langue choisie (sauf le menu en intercalaires)", async () => {
    setHelpLanguage("fr");
    stubApi();
    renderWith({ state: { status: "signedOut" } });
    expect(screen.getAllByRole("button", { name: "Se connecter" })).toHaveLength(2);
    expect(screen.getByText("Vers des journées où l'on ne se perd plus.")).toBeInTheDocument();
    expect(screen.queryByText(/サインイン/)).not.toBeInTheDocument();
  });

  it("lance la connexion au clic", async () => {
    stubApi();
    const auth = renderWith({ state: { status: "signedOut" } });
    // En haut à droite et au centre de la page d'accueil.
    const buttons = screen.getAllByRole("button", { name: /サインイン/ });
    expect(buttons).toHaveLength(2);
    await userEvent.click(buttons[0]);
    expect(auth.signIn).toHaveBeenCalled();
  });

  it("connexion refusée par l'annuaire : un message, pas un retour silencieux à l'accueil", async () => {
    stubApi();
    renderWith({ state: { status: "signedOut", error: "interaction_required" } });
    expect(screen.getByRole("alert")).toHaveTextContent("サインインできませんでした");
  });

  it("propose de créer un compte sous la connexion", async () => {
    stubApi();
    const auth = renderWith({ state: { status: "signedOut" }, signUp: vi.fn() });
    await userEvent.click(screen.getByRole("button", { name: "アカウントを作成" }));
    expect(auth.signUp).toHaveBeenCalled();
  });

  it("une fois connecté, appelle /api/me avec le jeton et affiche le compte", async () => {
    const fetchMock = stubApi();
    renderWith({ state: { status: "signedIn", email: "simon@example.com", name: "Simon" }, getToken: async () => "jeton" });
    await userEvent.click(screen.getByRole("button", { name: "アカウント" }));
    expect(await screen.findByText(/プロフィール未登録/)).toBeInTheDocument();
    expect(screen.getByText("Simon")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/me", { headers: { [TOKEN_HEADER]: "jeton" } });
  });

  it("une seule requête /api/bootstrap remplit tout : compte, et les onglets s'ouvrent depuis le cache", async () => {
    const saved = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (k: string) => saved.get(k) ?? null, setItem: (k: string, v: string) => saved.set(k, v), removeItem: (k: string) => saved.delete(k) });
    const boot = { me: { userId: "u1", email: "simon@example.com", name: "Simon", hasProfile: true }, profile: null,
      applications: [], plans: [], drafts: [], kokoro: null, holidays: {}, today: "2026-10-30" };
    const fetchMock = vi.fn(async (url: string) => (url.startsWith("/api/bootstrap") ? json(boot) : json(health)));
    vi.stubGlobal("fetch", fetchMock);
    renderWith({ state: { status: "signedIn", email: "simon@example.com", name: "Simon" }, getToken: async () => "jeton" });
    await userEvent.click(await screen.findByRole("button", { name: "アカウント" }));
    expect(await screen.findByText(/プロフィール登録済み/)).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([u]) => u === "/api/me")).toBe(false);
    // La copie est gardée sur l'appareil pour le prochain lancement (même compte seulement).
    expect(JSON.parse(saved.get("clean-work-snapshot-v1")!).owner).toBe("simon@example.com");
  });

  it("signale une erreur si l'API refuse le jeton", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (url === "/api/me" ? json({}, false) : json(health))));
    renderWith({ state: { status: "signedIn", email: "simon@example.com", name: null }, getToken: async () => "jeton" });
    await userEvent.click(screen.getByRole("button", { name: "アカウント" }));
    expect(await screen.findByText(/API エラー/)).toBeInTheDocument();
  });

  it("se déconnecte au clic", async () => {
    stubApi();
    const auth = renderWith({ state: { status: "signedIn", email: "s@example.com", name: "Simon" }, getToken: async () => "jeton" });
    await userEvent.click(screen.getByRole("button", { name: "アカウント" }));
    await userEvent.click(screen.getByRole("button", { name: /サインアウト/ }));
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

  it("annonce le délai de 30 jours et l'adresse de restauration", async () => {
    stubApi();
    const confirm = vi.fn<(message?: string) => boolean>(() => false);
    vi.stubGlobal("confirm", confirm);
    renderWith(signedIn);
    await userEvent.click(screen.getByRole("button", { name: "アカウント" }));
    await userEvent.click(screen.getByRole("button", { name: /アカウント削除/ }));
    expect(confirm.mock.calls[0][0]).toMatch(/30日後に完全に削除/);
    expect(confirm.mock.calls[0][0]).toContain("depussay.simon@icloud.com");
  });

  it("ne supprime rien si l'utilisateur annule", async () => {
    const fetchMock = stubApi();
    vi.stubGlobal("confirm", vi.fn(() => false));
    const auth = renderWith(signedIn);
    await userEvent.click(screen.getByRole("button", { name: "アカウント" }));
    await userEvent.click(screen.getByRole("button", { name: /アカウント削除/ }));
    expect(fetchMock).not.toHaveBeenCalledWith("/api/me", expect.objectContaining({ method: "DELETE" }));
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("supprime puis déconnecte après confirmation", async () => {
    const fetchMock = stubApi();
    vi.stubGlobal("confirm", vi.fn(() => true));
    const auth = renderWith(signedIn);
    await userEvent.click(screen.getByRole("button", { name: "アカウント" }));
    await userEvent.click(screen.getByRole("button", { name: /アカウント削除/ }));
    expect(fetchMock).toHaveBeenCalledWith("/api/me", { method: "DELETE", headers: { [TOKEN_HEADER]: "jeton" } });
    expect(auth.signOut).toHaveBeenCalled();
  });

  it("reste connecté et prévient si la suppression échoue", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) =>
      init?.method === "DELETE" ? json({ error: "deletion_not_configured" }, false) : url === "/api/me" ? json({ hasProfile: false }) : json(health)));
    vi.stubGlobal("confirm", vi.fn(() => true));
    const auth = renderWith(signedIn);
    await userEvent.click(screen.getByRole("button", { name: "アカウント" }));
    await userEvent.click(screen.getByRole("button", { name: /アカウント削除/ }));
    expect(await screen.findByText(/削除できませんでした/)).toBeInTheDocument();
    expect(auth.signOut).not.toHaveBeenCalled();
  });
});
