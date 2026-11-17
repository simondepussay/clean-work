import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearApiCache } from "../api";
import { AuthContext, type Auth } from "../auth/auth";
import { NotesCard } from "../home/NotesCard";
import { AgentKeysPanel } from "./AgentKeysPanel";

const json = (body: unknown, status = 200) => new Response(body === null ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const auth: Auth = { state: { status: "signedIn", email: "s@example.com", name: "S" }, signIn: vi.fn(), signOut: vi.fn(), getToken: async () => "t" };
const wrap = (ui: React.ReactNode) => render(<AuthContext.Provider value={auth}>{ui}</AuthContext.Provider>);

afterEach(() => { vi.unstubAllGlobals(); clearApiCache(); });

describe("AgentKeysPanel", () => {
  it("crée une clé, la montre une fois, puis la liste ; la révocation demande confirmation", async () => {
    let keys: object[] = [];
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        const info = { id: "k1", name: "Claude", scope: "write", createdAt: "2026-11-17T03:00:00Z" };
        keys = [info];
        return json({ key: "cwk_secret", info }, 201);
      }
      if (init?.method === "DELETE") { keys = []; return json(null, 204); }
      return json(keys);
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("confirm", () => true);
    wrap(<AgentKeysPanel />);
    const panel = document.querySelector("details.agent-keys") as HTMLDetailsElement;
    expect(panel.open).toBe(false);
    await userEvent.click(screen.getByText(/^AIエージェント$|^AI agents$|^Agents IA$/));
    expect(panel.open).toBe(true);

    await userEvent.type(screen.getByRole("textbox", { name: /キーの名前|Key name|Nom de la clé/ }), "Claude");
    await userEvent.click(screen.getByRole("button", { name: /キーを作る|Create a key|Créer une clé/ }));
    expect(await screen.findByText("cwk_secret")).toBeInTheDocument();
    expect(screen.getByText(/^claude mcp add --transport http clean-work .*\/api\/mcp --header "Authorization: Bearer cwk_secret"$/)).toBeInTheDocument();
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    await userEvent.click(screen.getByRole("button", { name: /コマンドをコピー|Copy command|Copier la commande/ }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("Bearer cwk_secret"));
    expect(await screen.findByText("Claude")).toBeInTheDocument();
    expect(screen.getByText(/\/api\/mcp$/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /削除|Revoke|Révoquer/ }));
    expect(fetchMock).toHaveBeenCalledWith("/api/agent-keys/k1", expect.objectContaining({ method: "DELETE" }));
  });
});

describe("NotesCard", () => {
  it("charge le bloc-notes et l'enregistre tout seul après la frappe", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === "PUT" ? json({ text: JSON.parse(String(init.body)).text, updatedAt: "x" }) : json({ text: "OB訪問", updatedAt: null }));
    vi.stubGlobal("fetch", fetchMock);
    wrap(<NotesCard />);
    const area = await screen.findByDisplayValue("OB訪問");
    await userEvent.type(area, "のお礼");
    expect(await screen.findByText(/保存しました|Saved|Enregistré$/, {}, { timeout: 3000 })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenLastCalledWith("/api/notes", expect.objectContaining({ method: "PUT", body: JSON.stringify({ text: "OB訪問のお礼" }) }));
  });
});
