import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearApiCache, type Application, type CompanyResearch } from "../api";
import { AuthContext, type Auth } from "../auth/auth";
import { setHelpLanguage } from "../es/guide";
import { ResearchPanel } from "./ResearchPanel";

afterEach(() => { vi.unstubAllGlobals(); clearApiCache(); });

const auth: Auth = { state: { status: "signedIn", email: "s@example.com", name: "Simon" }, signIn: vi.fn(), signOut: vi.fn(), getToken: async () => "jeton" };
const app = (p: Partial<Application> = {}): Application => ({ id: "a1", company: "ソニー", status: "es", steps: [], nextDeadline: null, createdAt: "t", updatedAt: "t", ...p });
const research: CompanyResearch = { language: "ja", summary: "グループの本社です。", angles: ["事業の幅が広い"], questions: ["配属はどのように決まりますか。"], missing: ["最近のニュース"], usedOfficialData: true, createdAt: "2026-11-15T10:00:00Z" };

function server(reply: () => Response) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) =>
    init?.method === "POST" ? reply() : new Response(JSON.stringify(url.endsWith("/api/research-usage") ? { today: 5, month: 30 } : {})));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
function renderPanel(base: Application) {
  setHelpLanguage("ja");
  const onChange = vi.fn();
  render(<AuthContext.Provider value={auth}><ResearchPanel application={base} onChange={onChange} /></AuthContext.Provider>);
  return onChange;
}

describe("ResearchPanel", () => {
  it("dit sur quelles sources la fiche se construit, puis l'affiche et la rend à la liste", async () => {
    const base = app({ corporateNumber: "5010401067252", notes: "募集要項" });
    const fetchMock = server(() => new Response(JSON.stringify({ application: { ...base, research }, remaining: { today: 4, month: 29 } })));
    const user = userEvent.setup();
    const onChange = renderPanel(base);
    expect(screen.getByText("公式データ（gBizINFO）と企業メモ・求人票だけをもとに作ります。")).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "AIでまとめる" }));

    expect(await screen.findByText("グループの本社です。")).toBeInTheDocument();
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST")!;
    expect(post[0]).toContain("/api/applications/a1/research");
    expect(JSON.parse(post[1]!.body as string)).toEqual({ language: "ja" });
    expect(screen.getByText("配属はどのように決まりますか。")).toBeInTheDocument();
    expect(screen.getByText("最近のニュース")).toBeInTheDocument();
    expect(screen.getByText("残り：今日 4 · 今月 29")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "作り直す" })).toBeInTheDocument();
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ research }));
  });

  it("sans fiche officielle ni notes : explique comment obtenir une fiche précise ; une fiche déjà faite s'affiche d'emblée", () => {
    server(() => new Response("{}"));
    renderPanel(app({ research }));
    expect(screen.getByText(/まだ情報がありません/)).toBeInTheDocument();
    expect(screen.getByText("グループの本社です。")).toBeInTheDocument();
  });

  it("explique la limite du jour", async () => {
    server(() => new Response(JSON.stringify({ error: "limit", reason: "day", retryAfter: "2026-11-16T00:00:00.000Z" }), { status: 429 }));
    const user = userEvent.setup();
    renderPanel(app());
    await user.click(screen.getByRole("button", { name: "AIでまとめる" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("今日の上限です");
  });
});
