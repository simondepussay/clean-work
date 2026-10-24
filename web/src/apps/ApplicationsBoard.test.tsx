import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Application } from "../api";
import { AuthContext, type Auth } from "../auth/auth";
import { ApplicationsBoard } from "./ApplicationsBoard";
import { daysUntil, deadlineLabel, isApplied, matches, neighbour } from "./statuses";

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
    expect(neighbour("es", 1)).toBe("applied");
    expect(neighbour("applied", 1)).toBe("test");
    expect(neighbour("interested", -1)).toBeNull();
    expect(neighbour("offer", 1)).toBeNull();
    expect(neighbour("rejected", 1)).toBeNull();
  });

  it("« postulé » = tout ce qui vient après l'ES, et recherche dans nom, poste et notes", () => {
    expect(["interested", "es"].map((s) => isApplied(s as never))).toEqual([false, false]);
    expect(["applied", "interview1", "rejected"].map((s) => isApplied(s as never))).toEqual([true, true, true]);
    expect(matches({ company: "Sony", notes: "PlayStation チーム" }, "playstation")).toBe(true);
    expect(matches({ company: "Sony", position: null }, "楽天")).toBe(false);
    expect(matches({ company: "Sony" }, "  ")).toBe(true);
  });

  it("jours restants et libellé", () => {
    expect(daysUntil("2026-11-01", new Date(2026, 9, 29))).toBe(3);
    expect(deadlineLabel(0, "ja")).toBe("今日");
    expect(deadlineLabel(1, "en")).toBe("Tomorrow");
    expect(deadlineLabel(5, "ja")).toBe("あと5日");
    expect(deadlineLabel(5, "fr")).toBe("Dans 5 jours");
  });
});

describe("ApplicationsBoard", () => {
  it("range chaque candidature dans sa colonne, les refus dans « 終了 »", async () => {
    server([app({ id: "a1", company: "楽天", status: "es" }), app({ id: "a2", company: "LINEヤフー", status: "rejected" })]);
    renderBoard();
    await screen.findByText("楽天");
    expect(within(column(/^ES$/)).getByText("楽天")).toBeInTheDocument();
    expect(within(column(/終了/)).getByText("LINEヤフー")).toBeInTheDocument();
    expect(within(column(/終了/)).getByText(/不合格/)).toBeInTheDocument();
  });

  it("▶ fait passer à l'étape suivante (PUT du statut seulement)", async () => {
    const fetchMock = server([app({ id: "a1", company: "楽天", status: "es" })]);
    renderBoard();
    await userEvent.click(await screen.findByRole("button", { name: /楽天：次のステップへ/ }));
    expect(within(column(/^応募済み/)).getByText("楽天")).toBeInTheDocument();
    const put = fetchMock.mock.calls.find(([, i]) => i?.method === "PUT") as unknown as [string, RequestInit];
    expect(put[0]).toBe("/api/applications/a1");
    expect(JSON.parse(put[1].body as string)).toEqual({ status: "applied" });
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
    await userEvent.click(await screen.findByRole("button", { name: /応募を追加/ }));
    const form = screen.getByRole("form", { name: "応募" });
    await userEvent.type(within(form).getByLabelText(/企業名/), "ソニー");
    await userEvent.click(within(form).getByRole("button", { name: /^追加$/ }));
    await userEvent.selectOptions(within(form).getByLabelText(/^選考 \*/), "es");
    await userEvent.type(within(form).getByLabelText(/締切・日程/), "2026-11-01");
    await userEvent.click(within(form).getByRole("button", { name: /保存/ }));

    expect(await within(column(/^気になる/)).findByText("ソニー")).toBeInTheDocument();
    const post = fetchMock.mock.calls.find(([, i]) => i?.method === "POST") as unknown as [string, RequestInit];
    const sent = JSON.parse(post[1].body as string);
    expect(sent).toMatchObject({ company: "ソニー", status: "interested", steps: [{ type: "es", dueDate: "2026-11-01", done: false }] });
    expect(sent.steps[0].id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("montre l'erreur de l'API sous le champ", async () => {
    server([]);
    renderBoard();
    await userEvent.click(await screen.findByRole("button", { name: /応募を追加/ }));
    await userEvent.click(screen.getByRole("button", { name: /保存/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("入力してください");
  });

  it("liste les échéances des 14 prochains jours et exporte un .ics", async () => {
    server([app({ id: "a1", company: "楽天", steps: [{ id: "s1", type: "es", dueDate: iso(1), done: false }] })]);
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:x"), revokeObjectURL: vi.fn() }));
    let file = "";
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { file = this.download; });
    renderBoard();
    const upcoming = await screen.findByRole("region", { name: /近い締切/ });
    expect(within(upcoming).getByText("楽天")).toBeInTheDocument();
    expect(within(upcoming).getByText(/明日/)).toBeInTheDocument();
    await userEvent.click(within(upcoming).getByRole("button", { name: /カレンダーに追加/ }));
    await userEvent.click(screen.getByRole("menuitem", { name: /\.ics/ }));
    expect(file).toBe("shukatsu-deadlines.ics");
    click.mockRestore();
  });

  it("calendrier : abonnement Google, Apple et Outlook avec le lien privé, ou lien à copier", async () => {
    const link = "https://site.example/api/calendar/abc.def.ics?lang=ja";
    const fetchMock = server([app({ id: "a1", company: "楽天" })]);
    fetchMock.mockImplementation((async (url: string) => (url.startsWith("/api/calendar-link")
      ? { ok: true, status: 200, json: async () => ({ url: link }) }
      : { ok: true, status: 200, json: async () => [] })) as never);
    renderBoard();
    await userEvent.click(await screen.findByRole("button", { name: /カレンダーに追加/ }));
    const google = await screen.findByRole("menuitem", { name: /Google/ });
    expect(google).toHaveAttribute("href", `https://calendar.google.com/calendar/render?cid=${encodeURIComponent("webcal://site.example/api/calendar/abc.def.ics?lang=ja")}`);
    expect(screen.getByRole("menuitem", { name: /Apple/ })).toHaveAttribute("href", "webcal://site.example/api/calendar/abc.def.ics?lang=ja");
    expect(screen.getByRole("menuitem", { name: /Outlook/ }).getAttribute("href")).toContain(encodeURIComponent(link));
    expect(screen.getByLabelText(/購読用リンク/)).toHaveValue(link);
    expect(screen.getByRole("menuitem", { name: /\.ics/ })).toBeDisabled();
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
    await userEvent.click(screen.getByRole("button", { name: /この企業のESを書く/ }));
    expect(onWriteEs).toHaveBeenCalledWith({ id: "a1", company: "楽天" });
  });
});

describe("recherche et filtre « 応募済み »", () => {
  it("filtre les cartes par texte, puis ne montre que les candidatures envoyées", async () => {
    server([app({ id: "a1", company: "楽天", status: "interested" }), app({ id: "a2", company: "ソニー", status: "applied", notes: "ゲーム事業" }),
      app({ id: "a3", company: "任天堂", status: "interview1" })]);
    renderBoard();
    await screen.findByText("楽天");

    await userEvent.type(screen.getByRole("searchbox", { name: "応募を検索" }), "ゲーム");
    expect(screen.queryByText("楽天")).toBeNull();
    expect(screen.getByText("ソニー")).toBeTruthy();
    await userEvent.clear(screen.getByRole("searchbox", { name: "応募を検索" }));

    await userEvent.click(screen.getByRole("button", { name: /応募済み/ }));
    expect(screen.queryByText("楽天")).toBeNull();
    expect(screen.queryByRole("listitem", { name: "気になる" })).toBeNull();
    expect(within(column(/応募済み/)).getByText("ソニー")).toBeTruthy();
    expect(screen.getByText("任天堂")).toBeTruthy();
  });
});
