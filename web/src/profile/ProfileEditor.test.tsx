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
    const education = screen.getByRole("group", { name: "学歴 / Education" });
    await userEvent.click(within(education).getByRole("button", { name: /Add/ }));
    await userEvent.type(within(education).getByLabelText(/学校名/), "HAL東京");
    await userEvent.click(screen.getByRole("button", { name: /Save/ }));

    expect(await screen.findByText("保存しました / Saved")).toBeInTheDocument();
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
    await userEvent.click(await screen.findByRole("button", { name: /Save/ }));
    const row = screen.getByRole("group", { name: "学歴 / Education 1" });
    expect(await within(row).findByRole("alert")).toHaveTextContent("Required");
    expect(screen.getByText(/1件/)).toBeInTheDocument();
  });

  it("supprime une ligne", async () => {
    stub(200, { nameKanji: "シモン", nameKana: "シモン", education: [], work: [], certifications: [], languages: [{ language: "日本語", level: "N2" }] }, () => ({ status: 200, body: {} }));
    renderEditor();
    const languages = await screen.findByRole("group", { name: "語学 / Languages" });
    await userEvent.click(within(languages).getByRole("button", { name: /Remove/ }));
    expect(screen.queryByDisplayValue("日本語")).toBeNull();
  });
});
