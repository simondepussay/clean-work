import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearApiCache } from "../api";
import { AuthContext, type Auth } from "../auth/auth";
import { setHelpLanguage } from "../es/guide";
import { welcomePostponed } from "./postponed";
import { WelcomeSetup } from "./WelcomeSetup";

afterEach(() => { vi.unstubAllGlobals(); clearApiCache(); localStorage.clear(); });

const auth: Auth = { state: { status: "signedIn", email: "s@example.com", name: "Simon" }, signIn: vi.fn(), signOut: vi.fn(), getToken: async () => "jeton" };
const response = (status: number, body: unknown) => ({ status, ok: status < 300, json: async () => body });

function server() {
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => (init?.method === "PUT" ? response(200, JSON.parse(init.body as string)) : response(404, { error: "not_found" })));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
function renderWelcome() {
  setHelpLanguage("ja");
  const onDone = vi.fn();
  const onProfileSaved = vi.fn();
  render(<AuthContext.Provider value={auth}><WelcomeSetup name="Simon" owner="s@example.com" onProfileSaved={onProfileSaved} onDone={onDone} /></AuthContext.Provider>);
  return { onDone, onProfileSaved };
}

describe("WelcomeSetup", () => {
  it("accueille par le prénom, change de langue, et « あとで » laisse passer sans revenir", async () => {
    server();
    const user = userEvent.setup();
    const { onDone } = renderWelcome();
    expect(screen.getByRole("heading", { name: "Simonさん、ようこそ" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Français" }));
    expect(screen.getByRole("heading", { name: "Bienvenue, Simon" })).toBeInTheDocument();
    expect(welcomePostponed("s@example.com")).toBe(false);
    await user.click(screen.getByRole("button", { name: "Plus tard" }));
    expect(onDone).toHaveBeenCalledWith("home");
    expect(welcomePostponed("s@example.com")).toBe(true);
    expect(welcomePostponed("autre@example.com")).toBe(false);
  });

  it("profil : l'import de CV est déjà ouvert ; enregistrer mène à la première action", async () => {
    const fetchMock = server();
    const user = userEvent.setup();
    const { onDone, onProfileSaved } = renderWelcome();
    await user.click(screen.getByRole("button", { name: "プロフィールを登録する" }));
    expect(screen.getByRole("listitem", { current: "step" })).toHaveTextContent("プロフィール");
    await user.type(await screen.findByLabelText(/氏名/), "デプセ シモン");
    // Déjà déplié : le bouton pour refermer l'import est là, pas celui pour l'ouvrir.
    expect(document.querySelector(".cv-import-open")).toBeNull();
    await user.type(screen.getByLabelText(/ふりがな/), "デプセ シモン");
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(await screen.findByRole("heading", { name: "準備ができました" })).toBeInTheDocument();
    expect(onProfileSaved).toHaveBeenCalled();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(true);
    await user.click(screen.getByRole("button", { name: /応募を追加する/ }));
    expect(onDone).toHaveBeenCalledWith("apps");
  });
});
