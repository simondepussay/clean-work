import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearApiCache, type Kokoro } from "../api";
import { AuthContext, type Auth } from "../auth/auth";
import { ymd } from "../home/agenda";
import { Breathing, KokoroPage } from "./KokoroPage";

beforeEach(() => clearApiCache());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const auth: Auth = { state: { status: "signedIn", email: "s@example.com", name: "Simon" }, signIn: vi.fn(), signOut: vi.fn(), getToken: async () => "jeton" };
const today = ymd(new Date());
const tomorrow = ymd(new Date(Date.now() + 86_400_000));

function kokoro(over: Partial<Kokoro> = {}): Kokoro {
  return {
    moods: [], values: [], support: { level: "calm", rainy7: 0, rainy14: 0 },
    week: { applications: 0, drafts: 0, interviews: 0, rejections: 0 }, prefecture: null, international: false, ...over,
  };
}

function server(data: Kokoro, apps: unknown[] = []) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith("/api/kokoro") && init?.method && init.method !== "GET") return { ok: true, status: 204, json: async () => null };
    if (url.startsWith("/api/kokoro")) return { ok: true, status: 200, json: async () => data };
    if (url === "/api/applications") return { ok: true, status: 200, json: async () => apps };
    return { ok: false, status: 404, json: async () => ({}) };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const renderPage = () => render(<AuthContext.Provider value={auth}><KokoroPage /></AuthContext.Provider>);

describe("KokoroPage (こころ)", () => {
  it("note la météo du jour, avec la date de l'appareil", async () => {
    const fetchMock = server(kokoro());
    renderPage();
    await userEvent.click(await screen.findByRole("radio", { name: /雨/ }));
    const put = fetchMock.mock.calls.find(([url, init]) => url === "/api/kokoro/mood" && init?.method === "PUT")!;
    expect(JSON.parse(put[1]!.body as string)).toEqual({ date: today, weather: "rainy" });
  });

  it("une fois la météo notée, propose de la nommer en un mot", async () => {
    const fetchMock = server(kokoro({ moods: [{ date: today, weather: "cloudy" }] }));
    renderPage();
    expect(await screen.findByRole("radio", { name: /くもり/ })).toHaveAttribute("aria-checked", "true");
    await userEvent.click(screen.getByRole("button", { name: "不安" }));
    const put = fetchMock.mock.calls.filter(([url]) => url === "/api/kokoro/mood").at(-1)!;
    expect(JSON.parse(put[1]!.body as string)).toEqual({ date: today, weather: "cloudy", word: "不安" });
    expect(screen.getByRole("link", { name: /出典 : Lieberman/ })).toBeInTheDocument();
  });

  it("les aides sont toujours visibles, même par beau temps", async () => {
    server(kokoro());
    renderPage();
    const help = await screen.findByRole("region", { name: "相談先" });
    expect(within(help).getByRole("link", { name: /まもろうよこころ/ })).toHaveAttribute("href", "https://www.mhlw.go.jp/mamorouyokokoro/");
    expect(within(help).getByRole("link", { name: /0570-064-556/ })).toHaveAttribute("href", "tel:0570064556");
    expect(within(help).queryByText("TELL Lifeline")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("personnalise : la préfecture, et des lignes en langues étrangères pour un étudiant étranger", async () => {
    server(kokoro({ prefecture: "東京都", international: true }));
    renderPage();
    const help = await screen.findByRole("region", { name: "相談先" });
    expect(within(help).getByText(/新卒応援ハローワーク（東京都）/)).toBeInTheDocument();
    expect(within(help).getByText("TELL Lifeline")).toBeInTheDocument();
    expect(within(help).getByText(/よりそいホットライン/)).toBeInTheDocument();
  });

  it("jours de pluie fréquents : rappelle ce qui a été fait et oriente vers un psychologue gratuit", async () => {
    server(kokoro({ support: { level: "often", rainy7: 3, rainy14: 4 }, week: { applications: 2, drafts: 1, interviews: 0, rejections: 1 } }));
    renderPage();
    await screen.findByRole("region", { name: "相談先" });
    const box = screen.getByRole("status");
    expect(within(box).getByText(/ひとりで抱えなくて大丈夫/)).toBeInTheDocument();
    expect(within(box).getByText("応募 2件")).toBeInTheDocument();
    expect(within(box).getByText("ES 1本")).toBeInTheDocument();
    expect(within(box).getByText(/臨床心理士/)).toBeInTheDocument();
    expect(within(box).getByText(/お祈りメール/)).toBeInTheDocument();
  });

  it("deux semaines de pluie : le repère officiel, avec sa source", async () => {
    server(kokoro({ support: { level: "long", rainy7: 6, rainy14: 11 } }));
    renderPage();
    await screen.findByRole("region", { name: "相談先" });
    const box = screen.getByRole("status");
    expect(within(box).getByText(/2週間以上続くときは/)).toBeInTheDocument();
    expect(within(box).getByRole("link", { name: /こころもメンテしよう/ })).toBeInTheDocument();
  });

  it("le rituel est dédié au prochain entretien, et relit les valeurs de l'utilisateur", async () => {
    server(kokoro({ values: ["家族を安心させたい"] }), [
      { id: "a1", company: "ソニー", status: "interview1", steps: [{ id: "s1", type: "interview1", dueDate: tomorrow, done: false }], nextDeadline: null, createdAt: "", updatedAt: "" },
    ]);
    renderPage();
    expect(await screen.findByText(/、ソニーの面接の前に/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "はじめる" }));
    const ritual = screen.getByRole("dialog", { name: "面接前の3分" });
    await userEvent.click(within(ritual).getByRole("button", { name: "次へ" }));
    expect(within(ritual).getByText("家族を安心させたい")).toBeInTheDocument();
    await userEvent.click(within(ritual).getByRole("button", { name: "次へ" }));
    expect(within(ritual).getByText(/ワクワクしてる/)).toBeInTheDocument();
    await userEvent.click(within(ritual).getByRole("button", { name: "終わる" }));
    expect(within(ritual).getByText("ソニー、いってらっしゃい。")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("le ciel et tout l'arrière-plan prennent la météo du jour, puis reviennent à la normale", async () => {
    server(kokoro({ moods: [{ date: today, weather: "rainy" }] }));
    const { container, unmount } = renderPage();
    await screen.findByRole("radio", { name: /雨/ });
    expect(container.querySelector(".kokoro-sky")).toHaveClass("rainy");
    expect(screen.getByText(/ひと息つきましょう/)).toBeInTheDocument();
    expect(document.documentElement.dataset.mood).toBe("rainy");
    unmount();
    expect(document.documentElement.dataset.mood).toBeUndefined();
  });

  it("écrit ses valeurs (3 lignes au plus)", async () => {
    const fetchMock = server(kokoro());
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "書く" }));
    await userEvent.type(screen.getByLabelText("大切なこと 1"), "誠実でいること");
    await userEvent.click(screen.getByRole("button", { name: "保存" }));
    const put = fetchMock.mock.calls.find(([url]) => url === "/api/kokoro/values")!;
    expect(JSON.parse(put[1]!.body as string)).toEqual({ values: ["誠実でいること", "", ""] });
  });

  it("efface tout après confirmation", async () => {
    const fetchMock = server(kokoro());
    vi.stubGlobal("confirm", () => true);
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "記録をすべて消す" }));
    expect(fetchMock.mock.calls.some(([url, init]) => url === "/api/kokoro" && init?.method === "DELETE")).toBe(true);
  });
});

describe("Breathing", () => {
  it("4 s pour inspirer, 6 s pour expirer, puis s'arrête après une minute", () => {
    vi.useFakeTimers();
    const done = vi.fn();
    render(<Breathing onDone={done} />);
    expect(screen.getByText("吸って")).toBeInTheDocument();
    const seconds = (n: number) => { for (let i = 0; i < n; i++) act(() => { vi.advanceTimersByTime(1000); }); };
    seconds(4);
    expect(screen.getByText("吐いて")).toBeInTheDocument();
    seconds(56);
    expect(done).toHaveBeenCalledOnce();
    expect(screen.getByText("おつかれさま")).toBeInTheDocument();
  });
});
