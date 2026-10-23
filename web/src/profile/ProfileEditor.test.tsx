import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { withoutEmptyFields } from "../api";
import { AuthContext, type Auth } from "../auth/auth";
import { ProfileEditor } from "./ProfileEditor";

afterEach(() => vi.unstubAllGlobals());

const auth: Auth = { state: { status: "signedIn", email: "s@example.com", name: "Simon" }, signIn: vi.fn(), signOut: vi.fn(), getToken: async () => "jeton" };
const response = (status: number, body: unknown) => ({ status, ok: status < 300, json: async () => body });

function stub(getStatus: number, getBody: unknown, put: (body: unknown) => { status: number; body: unknown }) {
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === "PUT") {
      const r = put(JSON.parse(init.body as string));
      return response(r.status, r.body);
    }
    return response(getStatus, getBody);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const renderEditor = (onSaved = vi.fn()) => {
  render(<AuthContext.Provider value={auth}><ProfileEditor onSaved={onSaved} /></AuthContext.Provider>);
  return onSaved;
};

describe("withoutEmptyFields", () => {
  it("retire les champs vides, y compris dans les listes", () => {
    expect(withoutEmptyFields({ a: "x", b: "", c: [{ d: "", e: "y" }] })).toEqual({ a: "x", c: [{ e: "y" }] });
  });
});

describe("ProfileEditor", () => {
  it("part d'un formulaire vide quand il n'y a pas de profil", async () => {
    stub(404, { error: "not_found" }, () => ({ status: 200, body: {} }));
    renderEditor();
    expect(await screen.findByLabelText(/氏名/)).toHaveValue("");
  });

  it("affiche le profil existant", async () => {
    stub(200, { nameKanji: "デプセ シモン", nameKana: "デプセ シモン", education: [{ school: "HAL東京", start: "2026-04", status: "enrolled" }], work: [], certifications: [], languages: [] }, () => ({ status: 200, body: {} }));
    renderEditor();
    expect(await screen.findByLabelText(/氏名/)).toHaveValue("デプセ シモン");
    expect(screen.getByDisplayValue("HAL東京")).toBeInTheDocument();
  });

  it("ajoute une ligne de scolarité et envoie le profil sans champs vides", async () => {
    let sent: unknown;
    const onSaved = vi.fn();
    stub(404, {}, (body) => { sent = body; return { status: 200, body }; });
    renderEditor(onSaved);

    await userEvent.type(await screen.findByLabelText(/氏名/), "デプセ シモン");
    await userEvent.type(screen.getByLabelText(/ふりがな/), "でぷせ しもん");
    const education = screen.getByRole("group", { name: "学歴" });
    await userEvent.click(within(education).getByRole("button", { name: /^追加$/ }));
    await userEvent.type(within(education).getByLabelText(/学校名/), "HAL東京");
    await userEvent.click(screen.getByRole("button", { name: /保存/ }));

    expect(await screen.findByText("保存しました")).toBeInTheDocument();
    expect(sent).toEqual({
      nameKanji: "デプセ シモン",
      nameKana: "でぷせ しもん",
      education: [{ school: "HAL東京", status: "enrolled" }],
      work: [],
      certifications: [],
      languages: [],
    });
    expect(onSaved).toHaveBeenCalled();
  });

  it("affiche l'erreur de l'API sous le bon champ", async () => {
    stub(200, { nameKanji: "シモン", nameKana: "シモン", education: [{ school: "HAL", start: "", status: "enrolled" }], work: [], certifications: [], languages: [] },
      () => ({ status: 400, body: { error: "invalid", issues: [{ path: "education.0.start", message: "Required" }] } }));
    renderEditor();
    await userEvent.click(await screen.findByRole("button", { name: /保存/ }));
    const row = screen.getByRole("group", { name: "学歴 1" });
    expect(await within(row).findByRole("alert")).toHaveTextContent("Required");
    expect(screen.getByText(/1件/)).toBeInTheDocument();
  });

  it("supprime une ligne", async () => {
    stub(200, { nameKanji: "シモン", nameKana: "シモン", education: [], work: [], certifications: [], languages: [{ language: "ja", level: "business" }] }, () => ({ status: 200, body: {} }));
    renderEditor();
    const languages = await screen.findByRole("group", { name: "語学" });
    await userEvent.click(within(languages).getByRole("button", { name: /^削除$/ }));
    expect(screen.queryByDisplayValue("日本語 / Japanese")).toBeNull();
  });

  it("choisit langue et niveau dans des listes", async () => {
    let sent: { languages?: unknown } = {};
    stub(200, { nameKanji: "シモン", nameKana: "しもん", education: [], work: [], certifications: [], languages: [] },
      (body) => { sent = body as typeof sent; return { status: 200, body }; });
    renderEditor();
    const group = await screen.findByRole("group", { name: "語学" });
    await userEvent.click(within(group).getByRole("button", { name: /^追加$/ }));
    await userEvent.selectOptions(within(group).getByLabelText(/言語/), "fr");
    await userEvent.selectOptions(within(group).getByLabelText(/レベル/), "native");
    await userEvent.click(screen.getByRole("button", { name: /保存/ }));
    await screen.findByText("保存しました");
    expect(sent.languages).toEqual([{ language: "fr", level: "native" }]);
  });

  it("« その他 » fait apparaître un champ pour écrire la langue", async () => {
    let sent: { languages?: unknown } = {};
    stub(200, { nameKanji: "シモン", nameKana: "しもん", education: [], work: [], certifications: [], languages: [] },
      (body) => { sent = body as typeof sent; return { status: 200, body }; });
    renderEditor();
    const group = await screen.findByRole("group", { name: "語学" });
    await userEvent.click(within(group).getByRole("button", { name: /^追加$/ }));
    expect(within(group).queryByLabelText(/どの言語/)).toBeNull();

    await userEvent.selectOptions(within(group).getByLabelText(/言語/), "other");
    await userEvent.type(within(group).getByLabelText(/どの言語/), "タガログ語");
    await userEvent.selectOptions(within(group).getByLabelText(/レベル/), "basic");
    await userEvent.click(screen.getByRole("button", { name: /保存/ }));
    await screen.findByText("保存しました");
    expect(sent.languages).toEqual([{ language: "other", languageOther: "タガログ語", level: "basic" }]);
  });

  it("propose des noms de certification selon la catégorie", async () => {
    stub(200, { nameKanji: "シモン", nameKana: "しもん", education: [], work: [], languages: [],
      certifications: [{ category: "it", name: "", date: "" }] }, () => ({ status: 200, body: {} }));
    const { container } = render(<AuthContext.Provider value={auth}><ProfileEditor /></AuthContext.Provider>);
    await screen.findByRole("group", { name: "資格" });
    const options = [...container.querySelectorAll("datalist option")].map((o) => o.getAttribute("value"));
    expect(options).toContain("基本情報技術者試験");
    expect(options).not.toContain("日本語能力試験 N2");
  });
});

describe("ProfileEditor — CVから入力", () => {
  it("remplit les champs vides et ajoute les lignes manquantes, sans rien écraser ni enregistrer ; mois devinés signalés", async () => {
    const existing = {
      nameKanji: "シモン", nameKana: "しもん", education: [{ school: "HAL東京", start: "2026-04", status: "expected" }],
      work: [], certifications: [], languages: [],
    };
    const imported = {
      nameKanji: "別の名前", nameLatin: "Simon Depussay", email: "simon@example.com",
      education: [{ school: "HAL東京", start: "2026-04", status: "expected" }, { school: "Université de Lyon", start: "2019-01", end: "2023-06", status: "graduated" }],
      work: [{ company: "WebAgence", role: "Stagiaire", start: "2022-06", end: "2022-08" }],
      certifications: [{ category: "language", name: "JLPT N2", date: "2024-12" }, { category: "it", name: "基本情報技術者試験", date: "" }],
      languages: [{ language: "fr", level: "native" }],
      check: [{ path: "education.1.start", reason: "month" }, { path: "certifications.1.date", reason: "date" }],
    };
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) =>
      url === "/api/profile/import" ? response(200, imported) : init?.method === "PUT" ? response(200, {}) : response(200, existing));
    vi.stubGlobal("fetch", fetchMock);
    renderEditor();
    await userEvent.click(await screen.findByRole("button", { name: /CVから入力/ }));
    await userEvent.type(screen.getByLabelText(/貼り付け/), "Simon Depussay, HAL Tokyo, Université de Lyon 2019-2023, stage WebAgence.");
    await userEvent.click(screen.getByRole("button", { name: "読み込む" }));

    expect(await screen.findByText(/CVの内容を入力しました/)).toBeInTheDocument();
    expect(screen.getByLabelText(/氏名/), "déjà saisi : pas écrasé").toHaveValue("シモン");
    expect(screen.getByLabelText(/ローマ字/)).toHaveValue("Simon Depussay");
    const education = screen.getByRole("group", { name: "学歴" });
    expect(within(education).getAllByLabelText(/学校名/).map((i) => (i as HTMLInputElement).value), "HAL東京 n'est pas ajouté deux fois")
      .toEqual(["HAL東京", "Université de Lyon"]);
    const second = within(education).getByRole("group", { name: "学歴 2" });
    expect(within(second).getByText(/月を確認してください/)).toBeInTheDocument();
    const certs = screen.getByRole("group", { name: "資格" });
    expect(within(within(certs).getByRole("group", { name: "資格 2" })).getByText(/取得年月を入力してください/)).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PUT"), "rien n'est enregistré").toBe(false);
  });
});
