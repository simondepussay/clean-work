import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { T3 } from "../i18n";
import { JournalBook } from "./KokoroBook";

const tr = Object.assign((t: T3) => t.ja, { lang: "ja" as const });
const entries = ["2026-10-20", "2026-10-22", "2026-10-25", "2026-10-28", "2026-10-30"].map((date, i) => ({ date, text: `ページ${i + 1}`, updatedAt: "" }));

afterEach(cleanup);

describe("JournalBook (日記を読む)", () => {
  it("s'ouvre sur les dernières pages, se feuillette au clavier et se ferme avec Échap", async () => {
    const onClose = vi.fn();
    render(<JournalBook entries={[...entries].reverse()} tr={tr} onClose={onClose} />);
    const book = screen.getByRole("dialog", { name: "日記を読む" });
    // 5 pages en doubles pages (1–2, 3–4, 5) : on commence sur la dernière, la 5e seule.
    expect(within(book).getByText("ページ5")).toBeInTheDocument();
    expect(within(book).getByText("5 / 5")).toBeInTheDocument();
    expect(within(book).getByRole("button", { name: "次のページ" })).toBeDisabled();

    await userEvent.keyboard("{ArrowLeft}");
    expect(await within(book).findByText("3–4 / 5", {}, { timeout: 1500 })).toBeInTheDocument();
    expect(within(book).getAllByText("ページ3").length).toBeGreaterThan(0);

    await userEvent.click(within(book).getByRole("button", { name: "前のページ" }));
    expect(await within(book).findByText("1–2 / 5", {}, { timeout: 1500 })).toBeInTheDocument();
    expect(within(book).getByRole("button", { name: "前のページ" })).toBeDisabled();

    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });
});
