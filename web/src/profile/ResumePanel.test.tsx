import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadResume } from "../api";
import { AuthContext, type Auth } from "../auth/auth";
import { ResumePanel } from "./ResumePanel";

afterEach(() => vi.unstubAllGlobals());

const auth: Auth = { state: { status: "signedIn", email: "s@example.com", name: "Simon" }, signIn: vi.fn(), signOut: vi.fn(), getToken: async () => "jeton" };
const pdfResponse = () => new Response(new Blob(["%PDF-1.7"]), {
  status: 200,
  headers: { "content-disposition": `attachment; filename="rirekisho.pdf"; filename*=UTF-8''${encodeURIComponent("履歴書_シモン.pdf")}` },
});

describe("downloadResume", () => {
  it("lit le nom de fichier japonais et n'envoie pas les champs vides", async () => {
    const fetcher = vi.fn(async () => pdfResponse());
    const result = await downloadResume("jeton", { era: "japanese", appeal: "", wishes: "貴社の規定に従います。" }, fetcher as unknown as typeof fetch);
    expect(result).toMatchObject({ ok: true, filename: "履歴書_シモン.pdf" });
    const [, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ era: "japanese", wishes: "貴社の規定に従います。" });
  });

  it("explique qu'il faut d'abord un profil", async () => {
    const fetcher = vi.fn(async () => new Response("{}", { status: 404 }));
    expect(await downloadResume("t", { era: "western" }, fetcher as unknown as typeof fetch)).toEqual({ ok: false, error: "profile_missing" });
  });
});

describe("ResumePanel", () => {
  it("remplit l'アピールポイント depuis une ES, puis télécharge le PDF", async () => {
    const fetchMock = vi.fn(async (url: string) => (url === "/api/drafts"
      ? new Response(JSON.stringify([{ id: "d1", question: "自己PR", body: "私の強みは粘り強さです。", createdAt: "t", updatedAt: "t" }]))
      : pdfResponse()));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:x"), revokeObjectURL: vi.fn() }));
    let downloaded = "";
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      downloaded = this.download;
    });

    render(<AuthContext.Provider value={auth}><ResumePanel /></AuthContext.Provider>);
    await userEvent.selectOptions(await screen.findByLabelText(/Fill from an ES/), "d1");
    expect(screen.getByLabelText(/Motivation/)).toHaveValue("私の強みは粘り強さです。");
    await userEvent.selectOptions(screen.getByLabelText(/Years/), "japanese");
    await userEvent.click(screen.getByRole("button", { name: /Download PDF/ }));

    expect(await screen.findByText(/Downloaded/)).toBeInTheDocument();
    expect(click).toHaveBeenCalled();
    expect(downloaded).toBe("履歴書_シモン.pdf");
    click.mockRestore();
    const post = fetchMock.mock.calls.find(([url]) => url === "/api/resume") as unknown as [string, RequestInit];
    expect(JSON.parse(post[1].body as string)).toEqual({ era: "japanese", appeal: "私の強みは粘り強さです。", wishes: "貴社の規定に従います。" });
  });
});
