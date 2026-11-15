import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import guide from "../../public/es-guide.json";
import { AuthContext, type Auth } from "../auth/auth";
import { countChars } from "./count";
import { EsPage } from "./EsPage";
import { resetGuideCache, setHelpLanguage } from "./guide";

afterEach(() => {
  vi.unstubAllGlobals();
  resetGuideCache();
  // Node 26 expose un localStorage expérimental qui lève une erreur sans configuration :
  // comme l'app, le test ne compte pas sur le stockage.
  try {
    window.localStorage.clear();
  } catch { /* stockage indisponible */ }
});

describe("countChars", () => {
  it("compte la ponctuation et les espaces, pas les retours à la ligne", () => {
    expect(countChars("私の強みは、粘り強さです。")).toBe(13);
    expect(countChars("一行目\n二行目")).toBe(6);
    expect(countChars("a b")).toBe(3);
    expect(countChars("\r\n")).toBe(0);
  });

  it("compte un emoji composé ou une lettre accentuée combinée comme un seul caractère", () => {
    expect(countChars("👨‍👩‍👧")).toBe(1);
    expect(countChars("é")).toBe(1);
  });
});

const auth: Auth = { state: { status: "signedIn", email: "s@example.com", name: "Simon" }, signIn: vi.fn(), signOut: vi.fn(), getToken: async () => "jeton" };

function api(initial: unknown[] = []) {
  const drafts = [...initial] as { id: string }[];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    if (init?.method === "POST") {
      const d = { ...body, id: "n1", createdAt: "t", updatedAt: "t" };
      drafts.unshift(d);
      return { ok: true, status: 201, json: async () => d };
    }
    if (url === "/es-guide.json") return { ok: true, status: 200, json: async () => guide };
    return { ok: true, status: 200, json: async () => (url === "/api/drafts" ? drafts : url === "/api/usage" ? { today: 10, month: 30 } : []) };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const renderPage = () => render(<AuthContext.Provider value={auth}><EsPage /></AuthContext.Provider>);

describe("liste des ES quand il y en a beaucoup", () => {
  const draft = (id: string, company: string | undefined, question: string, updatedAt: string, body = "") =>
    ({ id, company, question, body, charLimit: 400, createdAt: "t", updatedAt });
  const many = [
    ...["ソニー", "楽天", "メルカリ", "任天堂"].flatMap((c, i) => [draft(`${c}1`, c, "志望動機", `2026-11-0${i + 1}`, `${c}で働きたい`), draft(`${c}2`, c, "ガクチカ", `2026-10-0${i + 1}`)]),
    draft("c1", undefined, "自己PR", "2026-11-09", "私の強みは行動力です。"),
  ];

  it("peu d'ES : une liste simple, la plus récente d'abord, sans recherche", async () => {
    api([draft("a", "楽天", "志望動機", "2026-10-01"), draft("b", "ソニー", "志望動機", "2026-11-01")]);
    renderPage();
    const list = await screen.findByRole("list", { name: "ES" });
    expect(within(list).getAllByRole("button").map((b) => b.textContent)).toEqual([expect.stringContaining("ソニー"), expect.stringContaining("楽天")]);
    expect(screen.queryByRole("searchbox")).toBeNull();
  });

  it("beaucoup d'ES : un dossier par entreprise (共通 en tête), replié, avec son nombre ; on l'ouvre pour voir ses ES", async () => {
    api(many);
    renderPage();
    const list = await screen.findByRole("list", { name: "ES" });
    const folders = within(list).getAllByRole("listitem").filter((f) => f.tagName === "DETAILS");
    const names = folders.map((f) => f.querySelector("summary")!.textContent);
    expect(names[0]).toBe("共通1");
    // L'ordre des entreprises suit le classement japonais du navigateur : on vérifie l'ensemble.
    expect([...names].sort()).toEqual(["共通1", "ソニー2", "メルカリ2", "任天堂2", "楽天2"].sort());
    const sony = folders.find((f) => f.textContent!.startsWith("ソニー"))!;
    expect(folders.every((f) => !(f as HTMLDetailsElement).open)).toBe(true);
    await userEvent.click(within(sony).getByText("ソニー"));
    expect((sony as HTMLDetailsElement).open).toBe(true);
    await userEvent.click(within(sony).getByRole("button", { name: /ガクチカ/ }));
    expect(await screen.findByLabelText(/設問/)).toHaveValue("ガクチカ");
  });

  it("la recherche déplie les dossiers concernés et cache les autres", async () => {
    api(many);
    renderPage();
    await userEvent.type(await screen.findByRole("searchbox", { name: "ESを検索" }), "行動力");
    const list = screen.getByRole("list", { name: "ES" });
    const folders = within(list).getAllByRole("listitem").filter((f) => f.tagName === "DETAILS");
    expect(folders).toHaveLength(1);
    expect((folders[0] as HTMLDetailsElement).open).toBe(true);
    expect(within(folders[0]).getByRole("button", { name: /自己PR/ })).toBeInTheDocument();
    await userEvent.clear(screen.getByRole("searchbox", { name: "ESを検索" }));
    await userEvent.type(screen.getByRole("searchbox", { name: "ESを検索" }), "該当なし");
    expect(screen.getByText("該当するESはありません")).toBeInTheDocument();
  });
});

describe("EsPage", () => {
  it("indique qu'il n'y a pas encore d'ES", async () => {
    api();
    renderPage();
    expect(await screen.findByText(/まだESがありません/)).toBeInTheDocument();
  });

  it("compte les caractères en direct et signale le dépassement", async () => {
    api();
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: /新しいES/ }));
    await userEvent.click(await screen.findByRole("button", { name: /自由/ }));
    await userEvent.type(screen.getByLabelText(/文字数制限/), "5");
    await userEvent.type(screen.getByLabelText(/本文/), "あいうえ");
    expect(screen.getByText("4 / 5字")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/本文/), "おか");
    expect(screen.getByText(/6 \/ 5字 — 1字オーバー/)).toHaveClass("over");
  });

  it("crée une ES et l'ajoute à la liste", async () => {
    const fetchMock = api();
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: /新しいES/ }));
    await userEvent.click(await screen.findByRole("button", { name: /自由/ }));
    await userEvent.type(screen.getByLabelText(/^企業/), "楽天");
    await userEvent.type(screen.getByLabelText(/設問/), "志望動機");
    await userEvent.type(screen.getByLabelText(/本文/), "貴社を志望する理由は…");
    await userEvent.click(screen.getByRole("button", { name: /保存/ }));

    expect(await screen.findByText("保存しました")).toBeInTheDocument();
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST")!;
    // Pas de candidature « 楽天 » : ES commune (applicationId null).
    expect(JSON.parse(post[1]!.body as string)).toEqual({ kind: "free", company: "楽天", applicationId: null, industry: null, question: "志望動機", body: "貴社を志望する理由は…" });
    expect(screen.getByRole("list", { name: "ES" })).toHaveTextContent("楽天");
  });

  it("propose un secteur pour une ES commune et l'envoie", async () => {
    const fetchMock = api();
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: /新しいES/ }));
    await userEvent.click(await screen.findByRole("button", { name: /自由/ }));
    await userEvent.selectOptions(screen.getByLabelText(/業界/), "金融");
    await userEvent.type(screen.getByLabelText(/設問/), "自己PR");
    await userEvent.click(screen.getByRole("button", { name: /保存/ }));

    expect(await screen.findByText("保存しました")).toBeInTheDocument();
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST")!;
    expect(JSON.parse(post[1]!.body as string)).toMatchObject({ industry: "finance", applicationId: null });
  });

  it("explique ce qu'est une ES, dans la langue choisie", async () => {
    api();
    renderPage();
    expect(await screen.findByText("ESとは？")).toBeInTheDocument();
    expect(screen.getByText(guide.intro.ja)).toBeInTheDocument();
    // La langue se choisit avec le globe de l'en-tête : la page suit tout de suite.
    act(() => setHelpLanguage("fr"));
    expect(screen.getByText(guide.intro.fr)).toBeInTheDocument();
  });

  it("un type de question préremplit la question et la limite, et affiche son guide (en anglais)", async () => {
    setHelpLanguage("en");
    api();
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: /New entry sheet/ }));
    await userEvent.click(await screen.findByRole("button", { name: /ガクチカ|Gakuchika/ }));
    expect(screen.getByLabelText(/Question/)).toHaveValue("学生時代に最も力を入れたことを教えてください。");
    expect(screen.getByLabelText(/Character limit/)).toHaveValue(400);
    const panel = screen.getByRole("complementary", { name: /How to write/ });
    expect(panel).toHaveTextContent("This is the STAR format");
    expect(panel).toHaveTextContent(/See an example/);
  });

  it("ouverte depuis une candidature : entreprise préremplie et ES reliée", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/es-guide.json") return { ok: true, status: 200, json: async () => guide };
      if (url === "/api/applications") return { ok: true, status: 200, json: async () => [{ id: "a1", company: "楽天", status: "es", steps: [] }] };
      if (init?.method === "POST") return { ok: true, status: 201, json: async () => ({ ...JSON.parse(init.body as string), id: "n", createdAt: "t", updatedAt: "t" }) };
      return { ok: true, status: 200, json: async () => (url === "/api/drafts" ? [] : { today: 10, month: 30 }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<AuthContext.Provider value={auth}><EsPage seed={{ company: "楽天", applicationId: "a1", nonce: 1 }} /></AuthContext.Provider>);
    await userEvent.click(await screen.findByRole("button", { name: /志望動機/ }));
    expect(screen.getByLabelText(/^企業/)).toHaveValue("楽天");
    expect(await screen.findByText(/応募と連携/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/本文/), "貴社を");
    await userEvent.click(screen.getByRole("button", { name: /保存/ }));
    await screen.findByText("保存しました");
    const post = fetchMock.mock.calls.find(([, i]) => i?.method === "POST")!;
    expect(JSON.parse(post[1]!.body as string)).toMatchObject({ company: "楽天", applicationId: "a1", kind: "motivation" });
  });
});

describe("EsPage — conseils du cours", () => {
  it("自己PR : début 3部構成 avec 2 mots-clés au plus, puis checklist instantanée", async () => {
    api();
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: /新しいES/ }));
    await userEvent.click(await screen.findByRole("button", { name: /^自己PR/ }));
    await userEvent.click(screen.getByRole("button", { name: "協調性" }));
    await userEvent.click(screen.getByRole("button", { name: "計画性" }));
    expect(screen.getByRole("button", { name: "行動力" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "この構成で書き始める" }));
    expect((screen.getByLabelText(/本文/) as HTMLTextAreaElement).value).toContain("1つめは協調性、2つめは計画性です。");
    expect(screen.queryByRole("button", { name: "この構成で書き始める" })).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/本文/), "僕は頑張ったと思います。");
    const list = screen.getByRole("region", { name: "チェックリスト" });
    expect(list).toHaveTextContent("僕");
    expect(list).toHaveTextContent("と思います");
  });

  it("別パターンを作る : copie non enregistrée, puis nouvelle ES", async () => {
    const fetchMock = api([{ id: "d1", kind: "jikopr", question: "自己PR", body: "私の強みは協調性です。", createdAt: "t", updatedAt: "t" }]);
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: /自己PR/ }));
    await userEvent.click(screen.getByRole("button", { name: /別パターンを作る/ }));
    expect(screen.getByText(/コピーを作りました/)).toBeInTheDocument();
    expect((screen.getByLabelText(/本文/) as HTMLTextAreaElement).value).toBe("私の強みは協調性です。");
    await userEvent.click(screen.getByRole("button", { name: "保存" }));
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(JSON.parse(post![1]!.body as string)).toMatchObject({ kind: "jikopr", body: "私の強みは協調性です。" });
  });
});
