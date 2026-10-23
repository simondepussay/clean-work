import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type Auth } from "../auth/auth";
import { InfoPage } from "./InfoPage";

afterEach(() => vi.unstubAllGlobals());

const auth: Auth = { state: { status: "signedIn", email: "s@example.com", name: "Simon" }, signIn: vi.fn(), signOut: vi.fn(), getToken: async () => "jeton" };
const sources = [{ id: "mhlw", name: "厚生労働省" }, { id: "japantimes", name: "The Japan Times" }];
const pick = (i: number, source = "mhlw") => ({ id: `news-${i}`, kind: "news", date: "2026-10-23", source, link: `https://news.example/${i}`,
  title: { ja: `見出し${i}`, en: `Headline ${i}`, fr: `Titre ${i}` }, summary: { ja: `要約${i}`, en: "Summary", fr: "Résumé" } });
const interview = { id: "a", date: "2026-10-23", kind: "interview", lang: "ja",
  title: { ja: "先輩インタビュー", en: "Interview", fr: "Interview" }, summary: { ja: "要約", en: "Summary", fr: "Résumé" }, body: "第一段落\n\n第二段落" };
const pages: Record<string, unknown> = {
  "/api/info?page=1": { items: [1, 2, 3, 4, 5, 6, 7].map((i) => pick(i)), page: 1, pages: 2, total: 9, sources, articles: [interview] },
  "/api/info?page=2": { items: [8, 9].map((i) => pick(i)), page: 2, pages: 2, total: 9, sources, articles: [interview] },
  "/api/info?page=1&source=japantimes": { items: [pick(20, "japantimes")], page: 1, pages: 1, total: 1, sources, articles: [interview] },
};

function renderPage() {
  const fetchMock = vi.fn(async (url: string) => ({ ok: true, status: 200, json: async () => pages[url] }));
  vi.stubGlobal("fetch", fetchMock);
  render(<AuthContext.Provider value={auth}><InfoPage /></AuthContext.Provider>);
  return fetchMock;
}

describe("InfoPage (情報)", () => {
  it("liens partenaires (JLPT, Kanji Otter) et sites d'offres, ouverts dans un nouvel onglet", async () => {
    renderPage();
    const side = screen.getByRole("complementary", { name: "リンク" });
    expect(within(side).getByRole("link", { name: /JLPT Étude/ })).toHaveAttribute("href", "https://jlpt.simondepussay.com");
    expect(within(side).getByRole("link", { name: /Kanji Otter/ })).toHaveAttribute("href", expect.stringContaining("apps.apple.com"));
    expect(within(side).getByRole("link", { name: /ハローワーク/ })).toHaveAttribute("target", "_blank");
  });

  it("最新の見出し : 7 par page, liens vers l'article d'origine, pages suivantes", async () => {
    renderPage();
    const headlines = await screen.findByRole("region", { name: "最新の見出し" });
    expect(await within(headlines).findByText("見出し7")).toBeInTheDocument();
    expect(within(headlines).getAllByRole("listitem")).toHaveLength(7);
    expect(within(headlines).getByRole("link", { name: /見出し1/ })).toHaveAttribute("href", "https://news.example/1");
    await userEvent.click(within(headlines).getByRole("button", { name: "2" }));
    expect(await within(headlines).findByText("見出し9")).toBeInTheDocument();
    expect(within(headlines).getAllByRole("listitem")).toHaveLength(2);
  });

  it("filtre par source (côté serveur) en revenant à la page 1", async () => {
    const fetchMock = renderPage();
    const headlines = await screen.findByRole("region", { name: "最新の見出し" });
    await userEvent.click(await within(headlines).findByRole("button", { name: "The Japan Times" }));
    expect(await within(headlines).findByText("見出し20")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/info?page=1&source=japantimes", expect.anything());
  });

  it("les nouvelles du site sont dessous, dépliables", async () => {
    renderPage();
    const site = await screen.findByRole("region", { name: "Clean Work からのお知らせ" });
    expect(await within(site).findByText("先輩インタビュー")).toBeInTheDocument();
    await userEvent.click(within(site).getByRole("button", { name: /続きを読む/ }));
    expect(within(site).getByText("第二段落")).toBeInTheDocument();
  });
});
