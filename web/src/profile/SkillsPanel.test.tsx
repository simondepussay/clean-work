import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import catalog from "../../public/skills.json";
import { clearApiCache } from "../api";
import { AuthContext, type Auth } from "../auth/auth";
import { setHelpLanguage } from "../es/guide";
import { resetSkillCatalogCache, SkillsPanel } from "./SkillsPanel";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); clearApiCache(); resetSkillCatalogCache(); });

const auth: Auth = { state: { status: "signedIn", email: "s@example.com", name: "Simon" }, signIn: vi.fn(), signOut: vi.fn(), getToken: async () => "jeton" };

function server(levels: Record<string, number> = { python: 1 }) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/skills.json")) return new Response(JSON.stringify(catalog));
    if (init?.method === "PUT") return new Response(JSON.stringify({ ...JSON.parse(init.body as string), updatedAt: "t" }));
    return new Response(JSON.stringify({ levels, updatedAt: null }));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("skills.json", () => {
  it("des identifiants uniques et valides, des noms dans les trois langues", () => {
    const skills = catalog.categories.flatMap((c) => c.skills);
    const ids = skills.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9][a-z0-9-]{0,39}$/);
    for (const n of [...catalog.categories.map((c) => c.name), ...skills.map((s) => s.name)]) {
      if (typeof n === "string") expect(n.trim()).not.toBe("");
      else for (const lang of ["ja", "en", "fr"] as const) expect(n[lang].trim()).not.toBe("");
    }
  });
});

describe("SkillsPanel", () => {
  it("un clic = ○, deux = ◎, trois = rien ; un seul envoi pour plusieurs clics", async () => {
    const fetchMock = server();
    setHelpLanguage("ja");
    const user = userEvent.setup();
    render(<AuthContext.Provider value={auth}><SkillsPanel /></AuthContext.Provider>);

    const python = await screen.findByRole("button", { name: "Python：○ 基礎がある" });
    await user.click(python);
    expect(python).toHaveAccessibleName("Python：◎ 得意");
    const swift = screen.getByRole("button", { name: "Swift：未選択" });
    await user.click(swift);
    await user.click(swift);
    await user.click(swift);
    expect(swift).toHaveAccessibleName("Swift：未選択");

    await waitFor(() => expect(fetchMock.mock.calls.filter(([, i]) => i?.method === "PUT")).toHaveLength(1));
    const put = fetchMock.mock.calls.find(([, i]) => i?.method === "PUT")!;
    expect(JSON.parse(put[1]!.body as string)).toEqual({ levels: { python: 2 } });
  });

  it("cherche dans les trois langues", async () => {
    server({});
    setHelpLanguage("fr");
    const user = userEvent.setup();
    render(<AuthContext.Provider value={auth}><SkillsPanel /></AuthContext.Provider>);
    await user.type(await screen.findByRole("searchbox"), "敬語");
    expect(screen.getByRole("button", { name: /Keigo/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Python/ })).not.toBeInTheDocument();
  });
});
