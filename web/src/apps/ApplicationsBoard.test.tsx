import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Application } from "../api";
import { AuthContext, type Auth } from "../auth/auth";
import { ApplicationsBoard } from "./ApplicationsBoard";
import { daysUntil, deadlineLabel, neighbour } from "./statuses";

afterEach(() => vi.unstubAllGlobals());

const auth: Auth = { state: { status: "signedIn", email: "s@example.com", name: "Simon" }, signIn: vi.fn(), signOut: vi.fn(), getToken: async () => "jeton" };
const iso = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const app = (p: Partial<Application>): Application => ({
  id: "a1", company: "楽天", status: "es", steps: [], nextDeadline: null, createdAt: "t", updatedAt: "t", ...p,
});

function server(initial: Application[]) {
  const store = [...initial];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    if (init?.method === "PUT") {
      const i = store.findIndex((a) => url.endsWith(a.id));
      store[i] = { ...store[i], ...body };
      return new Response(JSON.stringify(store[i]));
    }
    if (init?.method === "POST") {
      if (!body.company) return new Response(JSON.stringify({ issues: [{ path: "company", message: "入力してください / Required" }] }), { status: 400 });
      const created = { ...app({ id: "new" }), ...body, nextDeadline: null };
      store.push(created);
      return new Response(JSON.stringify(created), { status: 201 });
    }
    return new Response(JSON.stringify(store));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const renderBoard = () => render(<AuthContext.Provider value={auth}><ApplicationsBoard /></AuthContext.Provider>);
const column = (name: RegExp) => screen.getByRole("listitem", { name });

describe("statuses", () => {
  it("étape suivante et précédente, sans passer automatiquement à « 終了 »", () => {
    expect(neighbour("es", 1)).toBe("test");
    expect(neighbour("interested", -1)).toBeNull();
    expect(neighbour("offer", 1)).toBeNull();
    expect(neighbour("rejected", 1)).toBeNull();
  });

  it("jours restants et libellé", () => {
    expect(daysUntil("2026-11-01", new Date(2026, 9, 29))).toBe(3);
    expect(deadlineLabel(0)).toBe("今日 / today");
    expect(deadlineLabel(1)).toBe("明日 / tomorrow");
    expect(deadlineLabel(5)).toBe("あと5日 / 5 days left");
  });
});

describe("ApplicationsBoard", () => {
  it("range chaque candidature dans sa colonne, les refus dans « 終了 »", async () => {
    server([app({ id: "a1", company: "楽天", status: "es" }), app({ id: "a2", company: "LINEヤフー", status: "rejected" })]);
    renderBoard();
    await screen.findByText("楽天");
    expect(within(column(/^ES \/ Entry sheet$/)).getByText("楽天")).toBeInTheDocument();
    expect(within(column(/終了/)).getByText("LINEヤフー")).toBeInTheDocument();
    expect(within(column(/終了/)).getByText(/不合格/)).toBeInTheDocument();
  });

  it("▶ fait passer à l'étape suivante (PUT du statut seulement)", async () => {
    const fetchMock = server([app({ id: "a1", company: "楽天", status: "es" })]);
    renderBoard();
    await userEvent.click(await screen.findByRole("button", { name: /楽天 : 次のステップへ/ }));
    expect(within(column(/適性検査/)).getByText("楽天")).toBeInTheDocument();
    const put = fetchMock.mock.calls.find(([, i]) => i?.method === "PUT") as unknown as [string, RequestInit];
    expect(put[0]).toBe("/api/applications/a1");
    expect(JSON.parse(put[1].body as string)).toEqual({ status: "test" });
  });

  it("affiche l'échéance, en rouge à 3 jours ou moins", async () => {
    server([app({ id: "a1", company: "A社", nextDeadline: iso(2) }), app({ id: "a2", company: "B社", nextDeadline: iso(10) })]);
    renderBoard();
    expect(await screen.findByText(/あと2日/)).toHaveClass("soon");
    expect(screen.getByText(/あと10日/)).not.toHaveClass("soon");
  });

  it("ajoute une candidature avec une étape datée", async () => {
    const fetchMock = server([]);
    renderBoard();
    await userEvent.click(await screen.findByRole("button", { name: /Add$/ }));
    const form = screen.getByRole("form", { name: "応募 / Application" });
    await userEvent.type(within(form).getByLabelText(/企業名/), "ソニー");
    await userEvent.click(within(form).getByRole("button", { name: /追加 \/ Add/ }));
    await userEvent.selectOptions(within(form).getByLabelText(/^選考 \/ Step/), "es");
    await userEvent.type(within(form).getByLabelText(/Date/), "2026-11-01");
    await userEvent.click(within(form).getByRole("button", { name: /Save/ }));

    expect(await within(column(/^気になる/)).findByText("ソニー")).toBeInTheDocument();
    const post = fetchMock.mock.calls.find(([, i]) => i?.method === "POST") as unknown as [string, RequestInit];
    const sent = JSON.parse(post[1].body as string);
    expect(sent).toMatchObject({ company: "ソニー", status: "interested", steps: [{ type: "es", dueDate: "2026-11-01", done: false }] });
    expect(sent.steps[0].id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("montre l'erreur de l'API sous le champ", async () => {
    server([]);
    renderBoard();
    await userEvent.click(await screen.findByRole("button", { name: /Add$/ }));
    await userEvent.click(screen.getByRole("button", { name: /Save/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("入力してください");
  });

  it("liste les échéances des 14 prochains jours et exporte un .ics", async () => {
    server([app({ id: "a1", company: "楽天", steps: [{ id: "s1", type: "es", dueDate: iso(1), done: false }] })]);
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:x"), revokeObjectURL: vi.fn() }));
    let file = "";
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { file = this.download; });
    renderBoard();
    const upcoming = await screen.findByRole("region", { name: /Upcoming deadlines/ });
    expect(within(upcoming).getByText("楽天")).toBeInTheDocument();
    expect(within(upcoming).getByText(/明日/)).toBeInTheDocument();
    await userEvent.click(within(upcoming).getByRole("button", { name: /Add to calendar/ }));
    expect(file).toBe("shukatsu-deadlines.ics");
    click.mockRestore();
  });

  it("bouton d'export désactivé sans échéance", async () => {
    server([app({ id: "a1", company: "楽天" })]);
    renderBoard();
    expect(await screen.findByRole("button", { name: /Add to calendar/ })).toBeDisabled();
  });
});

describe("ES et candidatures", () => {
  it("badge du nombre d'ES et bouton « このESを書く »", async () => {
    const fetchMock = vi.fn(async (url: string) => new Response(JSON.stringify(url === "/api/drafts"
      ? [{ id: "d1", applicationId: "a1", question: "Q", body: "", createdAt: "t", updatedAt: "t" }, { id: "d2", applicationId: "a1", question: "Q2", body: "", createdAt: "t", updatedAt: "t" }]
      : [app({ id: "a1", company: "楽天" })])));
    vi.stubGlobal("fetch", fetchMock);
    const onWriteEs = vi.fn();
    render(<AuthContext.Provider value={auth}><ApplicationsBoard onWriteEs={onWriteEs} /></AuthContext.Provider>);
    expect(await screen.findByText("ES 2")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "楽天" }));
    await userEvent.click(screen.getByRole("button", { name: /Write an ES/ }));
    expect(onWriteEs).toHaveBeenCalledWith({ id: "a1", company: "楽天" });
  });
});
