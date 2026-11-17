import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDraft } from "./api";
import { ScoreBadge } from "./ScoreBadge";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

afterEach(() => vi.unstubAllGlobals());

describe("ScoreBadge", () => {
  it("affiche le niveau et les points, puis « +5 » après un geste", async () => {
    let points = 40;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.endsWith("/api/score")) return json({ points, level: points >= 50 ? 1 : 0, floor: points >= 50 ? 50 : 0, next: points >= 50 ? 150 : 50 });
      points += 15;
      return json({ id: "d1", question: "q", body: "", createdAt: "", updatedAt: "" }, 201);
    }));
    render(<ScoreBadge getToken={async () => "t"} />);
    expect(await screen.findByRole("button", { name: /40/ })).toHaveTextContent("種");

    await act(async () => { await createDraft("t", { question: "q", body: "" }); });
    expect(await screen.findByText("+15")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /55/ })).toHaveTextContent("芽");

    await userEvent.click(screen.getByRole("button", { name: /55/ }));
    expect(screen.getByRole("dialog")).toHaveTextContent(/95 pt/);
  });

  it("ne montre rien si l'API ne répond pas", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "x" }, 500)));
    const { container } = render(<ScoreBadge getToken={async () => "t"} />);
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(container).toBeEmptyDOMElement();
  });
});
