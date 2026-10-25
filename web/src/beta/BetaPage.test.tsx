import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BetaPage } from "./BetaPage";

afterEach(() => vi.unstubAllGlobals());

describe("βテストに参加", () => {
  it("explique les étapes, n'envoie qu'avec le consentement, puis confirme", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 201, json: async () => ({ status: "ok" }) }));
    vi.stubGlobal("fetch", fetchMock);
    render(<BetaPage />);
    expect(screen.getByText(/iOS 18 以降の iPhone または iPad/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /TestFlight を開く/ })).toHaveAttribute("href", "https://apps.apple.com/app/testflight/id899247664");

    await userEvent.type(screen.getByLabelText(/Apple アカウントのメールアドレス/), "student@example.com");
    const send = screen.getByRole("button", { name: "参加を申し込む" });
    expect(send).toBeDisabled();
    await userEvent.click(screen.getByRole("checkbox"));
    await userEvent.click(send);

    expect(await screen.findByText("受け付けました")).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/beta");
    expect(JSON.parse(init.body as string)).toMatchObject({ email: "student@example.com", device: "iphone", consent: true, website: "", lang: "ja" });
  });

  it("adresse refusée par l'API : le message s'affiche sous le champ", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 400, json: async () => ({ issues: [{ path: "email", message: "メールアドレスが正しくありません / Invalid email address" }] }) })));
    render(<BetaPage />);
    await userEvent.type(screen.getByLabelText(/Apple アカウントのメールアドレス/), "x");
    await userEvent.click(screen.getByRole("checkbox"));
    await userEvent.click(screen.getByRole("button", { name: "参加を申し込む" }));
    expect(await screen.findByText("メールアドレスが正しくありません")).toBeInTheDocument();
  });
});
