import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
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
    week: { applications: 0, drafts: 0, interviews: 0, rejections: 0 }, prefecture: null, international: false,
    cheers: [], charms: [], cheerFrequency: "daily", devices: { count: 0, lastSeen: null }, ...over,
  };
}

function server(data: Kokoro, apps: unknown[] = []) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/kokoro/test-push") return { ok: true, status: 200, json: async () => ({ sent: 1 }) };
    if (url.startsWith("/api/kokoro") && init?.method && init.method !== "GET") return { ok: true, status: 204, json: async () => null };
    if (url.startsWith("/api/kokoro")) return { ok: true, status: 200, json: async () => data };
    if (url === "/api/applications") return { ok: true, status: 200, json: async () => apps };
    return { ok: false, status: 404, json: async () => ({}) };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const renderPage = (onOpen = vi.fn()) => render(<AuthContext.Provider value={auth}><KokoroPage onOpen={onOpen} /></AuthContext.Provider>);

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

  it("« ひと休み » : dédiée au prochain entretien ; respirer, puis le trac ; la source en bas", async () => {
    server(kokoro(), [
      { id: "a1", company: "ソニー", status: "interview1", steps: [{ id: "s1", type: "interview1", dueDate: tomorrow, done: false }], nextDeadline: null, createdAt: "", updatedAt: "" },
    ]);
    renderPage();
    expect(await screen.findByText(/、ソニーの面接の前に/)).toBeInTheDocument();
    expect(screen.getByText("ひと休みしましょう")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "はじめる" }));
    const ritual = screen.getByRole("dialog", { name: "ひと休みしましょう" });
    expect(within(ritual).getByRole("link", { name: /出典 : こころの耳/ })).toBeInTheDocument();
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

  it("日記 : écrit la page du jour, relit les précédentes", async () => {
    const fetchMock = server(kokoro());
    const base = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/kokoro/journal" && (!init?.method || init.method === "GET")) {
        return { ok: true, status: 200, json: async () => ({ entries: [{ date: "2026-10-01", text: "面接で緊張した\nでも話せた", updatedAt: "" }] }) };
      }
      if (url === "/api/kokoro/journal") return { ok: true, status: 200, json: async () => ({ entry: { date: today, text: "少し落ち着いた", updatedAt: "" } }) };
      return base(url, init);
    });
    renderPage();
    const journal = await screen.findByRole("region", { name: "日記" });
    const past = await within(journal).findByRole("button", { name: /面接で緊張した/ });
    await userEvent.click(past);
    expect(past).toHaveAttribute("aria-expanded", "true");
    await userEvent.type(within(journal).getByLabelText("今日の日記"), "少し落ち着いた");
    await userEvent.click(within(journal).getByRole("button", { name: "保存" }));
    expect(await within(journal).findByText("保存しました")).toBeInTheDocument();
    const put = fetchMock.mock.calls.find(([url, init]) => url === "/api/kokoro/journal" && init?.method === "PUT")!;
    expect(JSON.parse(put[1]!.body as string)).toEqual({ date: today, text: "少し落ち着いた" });
    expect(screen.queryByText(/大切にしていること/)).not.toBeInTheDocument();
  });

  it("efface tout après confirmation", async () => {
    const fetchMock = server(kokoro());
    vi.stubGlobal("confirm", () => true);
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "記録をすべて消す" }));
    expect(fetchMock.mock.calls.some(([url, init]) => url === "/api/kokoro" && init?.method === "DELETE")).toBe(true);
  });
});

describe("KokoroPage : fluidité (l'écran change tout de suite)", () => {
  /** Un serveur dont l'enregistrement de la météo ne répond qu'à la demande (ou échoue). */
  function slowServer(data: Kokoro, fail = false) {
    let release: () => void = () => {};
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/kokoro/mood" && init?.method === "PUT") {
        await new Promise<void>((r) => { release = r; });
        return fail ? { ok: false, status: 500, json: async () => ({}) } : { ok: true, status: 204, json: async () => null };
      }
      if (url.startsWith("/api/kokoro")) return { ok: true, status: 200, json: async () => data };
      return { ok: true, status: 200, json: async () => [] };
    });
    vi.stubGlobal("fetch", fetchMock);
    return { fetchMock, release: () => release() };
  }

  it("la météo choisie s'affiche avant la réponse du serveur", async () => {
    const server = slowServer(kokoro());
    renderPage();
    await userEvent.click(await screen.findByRole("radio", { name: /晴れ/ }));
    expect(await screen.findByRole("radio", { name: /晴れ/, checked: true })).toBeInTheDocument();
    expect(document.documentElement.dataset.mood).toBe("sunny");
    server.release();
    // Après l'enregistrement, la page se met à jour en arrière-plan.
    await waitFor(() => expect(server.fetchMock.mock.calls.filter(([u]) => u.startsWith("/api/kokoro?")).length).toBeGreaterThan(1));
  });

  it("un mot s'allume tout de suite", async () => {
    const server = slowServer(kokoro({ moods: [{ date: today, weather: "cloudy" }] }));
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "焦り" }));
    expect(screen.getByRole("button", { name: "焦り" })).toHaveAttribute("aria-pressed", "true");
    server.release();
    await waitFor(() => expect(server.fetchMock.mock.calls.filter(([u]) => u.startsWith("/api/kokoro?")).length).toBeGreaterThan(1));
  });

  it("si l'enregistrement échoue, l'écran revient en arrière et le dit", async () => {
    const server = slowServer(kokoro(), true);
    renderPage();
    await userEvent.click(await screen.findByRole("radio", { name: /雨/ }));
    await screen.findByRole("radio", { name: /雨/, checked: true });
    server.release();
    expect(await screen.findByRole("alert")).toHaveTextContent("保存できませんでした");
    expect(screen.getByRole("radio", { name: /雨/ })).toHaveAttribute("aria-checked", "false");
  });
});

describe("KokoroPage : liens avec le reste de l'app", () => {
  const word = { id: "word-g1", kind: "word" as const, title: { ja: "今日のひとこと", en: "Today's word", fr: "Le mot du jour" }, body: { ja: "深呼吸を3回。", en: "Three breaths.", fr: "Trois respirations." } };

  it("今日のあなたへ : une poussée mène au bon onglet, pour la bonne candidature", async () => {
    server(kokoro({ cheers: [
      { id: "n", kind: "nudge", title: { ja: "面接の練習をしてみませんか", en: "", fr: "" }, body: { ja: "ソニーの一次面接まであと2日。", en: "", fr: "" }, action: { tab: "interview", applicationId: "a1" } },
      word,
    ] }), [{ id: "a1", company: "ソニー", status: "interview1", steps: [], nextDeadline: null, createdAt: "", updatedAt: "" }]);
    const onOpen = vi.fn();
    renderPage(onOpen);
    const box = await screen.findByRole("region", { name: "今日のあなたへ" });
    expect(within(box).getByText("深呼吸を3回。")).toBeInTheDocument();
    await userEvent.click(within(box).getByRole("button", { name: /面接の練習へ/ }));
    expect(onOpen).toHaveBeenCalledWith({ tab: "interview", applicationId: "a1", company: "ソニー" });
  });

  it("お守りの言葉 : ajoute une suggestion, choisit le moment, enregistre", async () => {
    const fetchMock = server(kokoro());
    renderPage();
    const box = await screen.findByRole("region", { name: "お守りの言葉" });
    await userEvent.click(within(box).getByRole("button", { name: /いつも通りで大丈夫/ }));
    await userEvent.selectOptions(within(box).getByRole("combobox", { name: "届くタイミング" }), "tenmin");
    await userEvent.click(within(box).getByRole("button", { name: "保存" }));
    const put = fetchMock.mock.calls.find(([url]) => url === "/api/kokoro/charms")!;
    expect(JSON.parse(put[1]!.body as string)).toEqual({ charms: [{ text: "いつも通りで大丈夫。", when: "tenmin" }] });
    expect(await within(box).findByText(/iPhoneアプリにサインインすると届きます/)).toBeInTheDocument();
  });

  it("はげましの通知 : un petit bouton ouvre le choix du rythme ; plus de section « 通知 »", async () => {
    const fetchMock = server(kokoro());
    renderPage();
    const toggle = await screen.findByRole("button", { name: /はげましの通知/ });
    expect(screen.queryByRole("region", { name: "通知" })).not.toBeInTheDocument();
    await userEvent.click(toggle);
    const rhythm = screen.getByRole("radiogroup", { name: "はげましの通知" });
    expect(within(rhythm).getAllByRole("radio")).toHaveLength(4);
    expect(within(rhythm).getByRole("radio", { name: "毎日" })).toHaveAttribute("aria-checked", "true");
    await userEvent.click(within(rhythm).getByRole("radio", { name: "週に1回" }));
    const put = fetchMock.mock.calls.find(([url]) => url === "/api/kokoro/settings")!;
    expect(JSON.parse(put[1]!.body as string)).toEqual({ cheerFrequency: "weekly" });
    expect(screen.getByRole("button", { name: /週に1回/ })).toBeInTheDocument();
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
