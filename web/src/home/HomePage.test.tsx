import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type Auth } from "../auth/auth";
import { HomePage } from "./HomePage";
import { ymd } from "./agenda";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const auth: Auth = { state: { status: "signedIn", email: "s@example.com", name: "Simon" }, signIn: vi.fn(), signOut: vi.fn(), getToken: async () => "jeton" };
const today = new Date();
const inDays = (n: number) => ymd(new Date(today.getFullYear(), today.getMonth(), today.getDate() + n));

function server(plans: unknown[] = []) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/applications") {
      return { ok: true, status: 200, json: async () => [
        { id: "a1", company: "ソニー", status: "interview1", steps: [{ id: "s1", type: "interview1", dueDate: ymd(today), done: false }], nextDeadline: null, createdAt: "", updatedAt: "" },
      ] };
    }
    if (url.startsWith("/api/plans/") && init?.method === "PUT") {
      return { ok: true, status: 200, json: async () => ({ ...(plans[0] as object), ...JSON.parse(init.body as string) }) };
    }
    if (url === "/api/plans" && init?.method === "POST") {
      return { ok: true, status: 201, json: async () => ({ id: "new", done: false, createdAt: "", updatedAt: "", ...JSON.parse(init.body as string) }) };
    }
    return { ok: true, status: 200, json: async () => plans };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const renderHome = () => render(<AuthContext.Provider value={auth}><HomePage name="Simon" onOpenApps={vi.fn()} /></AuthContext.Provider>);

describe("HomePage", () => {
  it("le calendrier montre l'entretien du jour, et le prochain entretien en évidence", async () => {
    server();
    renderHome();
    expect(screen.getByRole("region", { name: /Calendar/ })).toBeInTheDocument();
    expect(await screen.findByText("次の面接 / Next interview")).toBeInTheDocument();
    expect(screen.getAllByText(/ソニー/).length).toBeGreaterThan(0);
  });

  it("ajoute un événement à la date choisie, avec l'heure", async () => {
    const fetchMock = server();
    renderHome();
    const target = inDays(1);
    const [, m, d] = target.split("-").map(Number);
    // La case du lendemain peut être dans le mois suivant : on y va si besoin.
    if (Number(target.slice(5, 7)) !== today.getMonth() + 1) await userEvent.click(screen.getByRole("button", { name: /Next month/ }));
    await userEvent.click(screen.getByRole("gridcell", { name: new RegExp(`^${m}月${d}日`) }));
    const form = screen.getByRole("form", { name: /Add an event or goal/ });
    await userEvent.type(within(form).getByLabelText(/Event/), "合同説明会");
    await userEvent.type(within(form).getByLabelText(/Time/), "13:00");
    await userEvent.click(within(form).getByRole("button", { name: /Add/ }));

    const post = fetchMock.mock.calls.find(([url, init]) => url === "/api/plans" && init?.method === "POST")!;
    expect(JSON.parse(post[1]!.body as string)).toEqual({ kind: "event", title: "合同説明会", date: target, time: "13:00" });
    expect(await screen.findAllByText(/合同説明会/)).not.toHaveLength(0);
  });

  it("un objectif apparaît dans la liste des objectifs et se coche", async () => {
    const goal = { id: "g1", kind: "goal", title: "ES 3本提出", date: inDays(3), done: false, createdAt: "", updatedAt: "" };
    const fetchMock = server([goal]);
    renderHome();
    const goals = await screen.findByRole("region", { name: /Goals/ });
    expect(await within(goals).findByText("ES 3本提出")).toBeInTheDocument();
    await userEvent.click(within(goals).getByRole("button", { name: /Done: ES 3本提出/ }));
    expect(fetchMock).toHaveBeenCalledWith("/api/plans/g1", expect.objectContaining({ method: "PUT" }));
  });
});
