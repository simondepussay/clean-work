import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearApiCache, type Step } from "../api";
import { AuthContext, type Auth } from "../auth/auth";
import { setHelpLanguage } from "../es/guide";
import { EmailPanel } from "./EmailPanel";

afterEach(() => { vi.unstubAllGlobals(); clearApiCache(); });

const auth: Auth = { state: { status: "signedIn", email: "s@example.com", name: "Simon" }, signIn: vi.fn(), signOut: vi.fn(), getToken: async () => "jeton" };
const steps: Step[] = [{ id: "s1", type: "interview1", dueDate: "2026-11-11", time: "14:00", done: true }];
const mail = { subject: "一次面接のお礼", body: "採用ご担当 〇〇様\n\nお世話になっております。", points: [{ expression: "お世話になっております", meaning: "書き出しの挨拶" }], remaining: { today: 9, month: 39 } };

function server(reply: () => Response) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) =>
    init?.method === "POST" ? reply() : new Response(JSON.stringify(url.endsWith("/api/email-usage") ? { today: 10, month: 40 } : {})));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
const renderPanel = () => {
  setHelpLanguage("ja");
  return render(<AuthContext.Provider value={auth}><EmailPanel applicationId="a1" steps={steps} /></AuthContext.Provider>);
};

describe("EmailPanel", () => {
  it("envoie le type, l'étape et les précisions, puis affiche le mail modifiable", async () => {
    const fetchMock = server(() => new Response(JSON.stringify(mail)));
    const user = userEvent.setup();
    renderPanel();
    expect(await screen.findByText("残り：今日 10 · 今月 40")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("対象の選考"), "s1");
    await user.type(screen.getByLabelText("面接で印象に残ったこと（任意）"), "チームの雰囲気");
    await user.click(screen.getByRole("button", { name: "AIで作成" }));

    expect(await screen.findByLabelText("件名")).toHaveValue("一次面接のお礼");
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST")!;
    expect(post[0]).toContain("/api/applications/a1/email");
    expect(JSON.parse(post[1]!.body as string)).toEqual({ kind: "thanks", language: "ja", stepId: "s1", details: "チームの雰囲気" });
    expect(screen.getByLabelText("本文")).toHaveValue(mail.body);
    expect(screen.getByText(/「〇〇」は送る前に書きかえてください/)).toBeInTheDocument();
    expect(screen.getByText("書き出しの挨拶")).toBeInTheDocument();
    expect(screen.getByText("残り：今日 9 · 今月 39")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "メールアプリで開く" })).toHaveAttribute("href", expect.stringContaining("mailto:?subject="));
  });

  it("l'étape n'est demandée que pour les mails qui en parlent", async () => {
    server(() => new Response(JSON.stringify(mail)));
    const user = userEvent.setup();
    renderPanel();
    await user.selectOptions(screen.getByLabelText("メールの種類"), "decline");
    expect(screen.queryByLabelText("対象の選考")).not.toBeInTheDocument();
  });

  it("explique la limite du jour", async () => {
    server(() => new Response(JSON.stringify({ error: "limit", reason: "day", retryAfter: "2026-11-13T00:00:00.000Z" }), { status: 429 }));
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole("button", { name: "AIで作成" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("今日の上限です");
  });
});
