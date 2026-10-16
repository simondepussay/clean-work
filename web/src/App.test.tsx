import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchHealth } from "./api";
import App from "./App";

afterEach(() => vi.unstubAllGlobals());

describe("fetchHealth", () => {
  it("renvoie l'état de l'API", async () => {
    const fake = vi.fn().mockResolvedValue({ json: async () => ({ status: "ok", version: "1", database: "ok" }) });
    expect(await fetchHealth(fake as unknown as typeof fetch)).toEqual({ status: "ok", version: "1", database: "ok" });
    expect(fake).toHaveBeenCalledWith("/api/health");
  });

  it("renvoie null si l'API est injoignable", async () => {
    const fake = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    expect(await fetchHealth(fake as unknown as typeof fetch)).toBeNull();
  });
});

describe("App", () => {
  it("affiche l'état de l'API", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => ({ status: "ok", version: "abc123", database: "ok" }) }));
    render(<App />);
    expect(screen.getByRole("heading", { name: "就活パイロット" })).toBeInTheDocument();
    expect(await screen.findByText("API: ok · DB: ok · vabc123")).toBeInTheDocument();
  });

  it("indique quand l'API est hors ligne", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    render(<App />);
    expect(await screen.findByText("API: オフライン / offline")).toBeInTheDocument();
  });
});
