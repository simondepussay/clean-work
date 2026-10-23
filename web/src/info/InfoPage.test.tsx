import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type Auth } from "../auth/auth";
import { InfoPage } from "./InfoPage";

afterEach(() => vi.unstubAllGlobals());

const auth: Auth = { state: { status: "signedIn", email: "s@example.com", name: "Simon" }, signIn: vi.fn(), signOut: vi.fn(), getToken: async () => "jeton" };
const news = {
  sources: [{ id: "mhlw", name: "厚生労働省", site: "", lang: "ja" }, { id: "japantimes", name: "The Japan Times", site: "", lang: "en" }],
  items: [
    { source: "japantimes", title: "Hiring of foreign graduates rises", link: "https://jt.example/a", date: "2026-10-23T00:00:00Z", excerpt: "More companies…" },
    { source: "mhlw", title: "外国人雇用状況", link: "https://mhlw.example/b", date: "2026-10-22T00:00:00Z", excerpt: "" },
  ],
};
const articles = [{ id: "a", date: "2026-10-23", kind: "interview", lang: "ja",
  title: { ja: "先輩インタビュー", en: "Interview", fr: "Interview" }, summary: { ja: "要約", en: "Summary", fr: "Résumé" }, body: "第一段落\n\n第二段落" }];

function renderPage() {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => ({ ok: true, status: 200, json: async () => (url === "/api/news" ? news : articles) })));
  render(<AuthContext.Provider value={auth}><InfoPage /></AuthContext.Provider>);
}

describe("InfoPage (情報)", () => {
  it("liens partenaires (JLPT, Kanji Otter) et sites d'offres, ouverts dans un nouvel onglet", async () => {
    renderPage();
    const side = screen.getByRole("complementary", { name: "リンク" });
    expect(within(side).getByRole("link", { name: /JLPT Étude/ })).toHaveAttribute("href", "https://jlpt.simondepussay.com");
    expect(within(side).getByRole("link", { name: /Kanji Otter/ })).toHaveAttribute("href", expect.stringContaining("apps.apple.com"));
    expect(within(side).getByRole("link", { name: /ハローワーク/ })).toHaveAttribute("target", "_blank");
  });

  it("actualités par date, filtrables par source ; article dépliable", async () => {
    renderPage();
    expect(await screen.findByText("Hiring of foreign graduates rises")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "厚生労働省" }));
    expect(screen.queryByText("Hiring of foreign graduates rises")).not.toBeInTheDocument();
    expect(screen.getByText("外国人雇用状況")).toBeInTheDocument();

    expect(await screen.findByText("先輩インタビュー")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /続きを読む/ }));
    expect(screen.getByText("第二段落")).toBeInTheDocument();
  });
});
