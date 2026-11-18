import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cardMatches, clearApiCache, type BusinessCard } from "../api";
import { AuthContext, type Auth } from "../auth/auth";
import { setHelpLanguage } from "../es/guide";
import { CardsPanel } from "./CardsPanel";

const json = (body: unknown, status = 200) => new Response(body === null ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const auth: Auth = { state: { status: "signedIn", email: "s@example.com", name: "S" }, signIn: vi.fn(), signOut: vi.fn(), getToken: async () => "t" };
const wrap = () => render(<AuthContext.Provider value={auth}><CardsPanel /></AuthContext.Provider>);

const cards: BusinessCard[] = [
  { id: "c1", name: "山田 花子", company: "株式会社ソニー", title: "採用担当", email: "hanako@sony.example", notes: "OB訪問。ゲーム部門", hasImage: false, createdAt: "2026-11-10T00:00:00Z", updatedAt: "2026-11-10T00:00:00Z" },
  { id: "c2", name: "John Smith", company: "Rakuten", rawText: "Rakuten Group Tokyo", hasImage: false, createdAt: "2026-11-01T00:00:00Z", updatedAt: "2026-11-01T00:00:00Z" },
];

beforeEach(() => setHelpLanguage("en"));
afterEach(() => { vi.unstubAllGlobals(); clearApiCache(); });

describe("CardsPanel", () => {
  it("sans carte : explique et renvoie vers l'app iPhone (bêta)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json([])));
    wrap();
    expect(await screen.findByText("No business cards yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Get the iPhone app \(beta\)/ })).toHaveAttribute("href", "#beta");
  });

  it("cherche par mots-clés (notes et texte de la carte compris)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(cards)));
    wrap();
    expect(await screen.findByText("山田 花子")).toBeInTheDocument();
    const search = screen.getByRole("searchbox", { name: "Search business cards" });
    await userEvent.type(search, "ゲーム");
    expect(screen.queryByText("John Smith")).not.toBeInTheDocument();
    await userEvent.clear(search);
    await userEvent.type(search, "tokyo");
    expect(screen.getByText("John Smith")).toBeInTheDocument();
    expect(screen.queryByText("山田 花子")).not.toBeInTheDocument();
  });

  it("ouvre une carte, enregistre les notes, et efface un champ vidé", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "PUT") return json({ ...cards[0], ...JSON.parse(init.body as string), title: undefined });
      return json(cards);
    });
    vi.stubGlobal("fetch", fetchMock);
    wrap();
    await userEvent.click(await screen.findByRole("button", { name: /山田 花子/ }));
    const dialog = screen.getByRole("dialog");
    await userEvent.clear(within(dialog).getByLabelText("Title"));
    await userEvent.type(within(dialog).getByLabelText("Notes"), " お礼メール送信済み");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await within(dialog).findByText("Saved")).toBeInTheDocument();
    const put = fetchMock.mock.calls.find(([, i]) => i?.method === "PUT")!;
    expect(put[0]).toMatch(/\/api\/cards\/c1$/);
    const body = JSON.parse(put[1]!.body as string);
    expect(body.notes).toBe("OB訪問。ゲーム部門 お礼メール送信済み");
    expect(body.title).toBeNull();
  });

  it("supprime une carte après confirmation", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => (init?.method === "DELETE" ? json(null, 204) : json(cards))));
    vi.stubGlobal("confirm", () => true);
    wrap();
    await userEvent.click(await screen.findByRole("button", { name: /John Smith/ }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Delete/ }));
    expect(screen.queryByText("John Smith")).not.toBeInTheDocument();
    expect(screen.getByText("山田 花子")).toBeInTheDocument();
  });

  it("la recherche ignore pleine largeur et majuscules", () => {
    expect(cardMatches(cards[1], "ＲＡＫＵＴＥＮ")).toBe(true);
    expect(cardMatches(cards[0], "ソニー 採用")).toBe(true);
    expect(cardMatches(cards[0], "ソニー パナソニック")).toBe(false);
  });
});
