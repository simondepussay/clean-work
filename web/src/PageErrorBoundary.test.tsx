import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PageErrorBoundary } from "./PageErrorBoundary";

afterEach(() => vi.restoreAllMocks());

function Broken(): never {
  throw new Error("boom");
}

describe("onglet impossible à afficher", () => {
  it("message et bouton « recharger » au lieu d'un écran blanc", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<PageErrorBoundary message="表示できませんでした" action="再読み込み"><Broken /></PageErrorBoundary>);
    expect(screen.getByRole("alert")).toHaveTextContent("表示できませんでした");
    expect(screen.getByRole("button", { name: "再読み込み" })).toBeInTheDocument();
  });
});
