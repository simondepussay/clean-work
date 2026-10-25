import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearApiCache } from "./api";
import { CompanyFacts } from "./apps/CompanyFacts";
import { AuthContext, type Auth } from "./auth/auth";
import { HomePage } from "./home/HomePage";
import { ymd } from "./home/agenda";
import { ProfileEditor } from "./profile/ProfileEditor";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const auth: Auth = { state: { status: "signedIn", email: "s@example.com", name: "Simon" }, signIn: vi.fn(), signOut: vi.fn(), getToken: async () => "jeton" };
const json = (body: unknown, status = 200) => ({ ok: status < 300, status, json: async () => body });
const wrap = (ui: React.ReactNode) => render(<AuthContext.Provider value={auth}>{ui}</AuthContext.Provider>);

/** Faux serveur : chaque préfixe d'URL renvoie sa réponse. */
function server(routes: Record<string, unknown>) {
  const fetchMock = vi.fn(async (url: string) => {
    const hit = Object.entries(routes).find(([k]) => url.startsWith(k));
    return hit ? json(hit[1]) : json(null, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("données ouvertes dans l'app", () => {
  it("accueil : jour férié dans le calendrier, et météo du prochain entretien avec un conseil s'il pleut", async () => {
    const d = new Date();
    const today = ymd(d);
    server({
      "/api/applications": [{ id: "a1", company: "ソニー", status: "interview1", location: "大阪府大阪市", steps: [{ id: "s1", type: "interview1", dueDate: today, done: false }], nextDeadline: null, createdAt: "", updatedAt: "" }],
      "/api/plans": [],
      "/api/holidays": { [today]: "文化の日" },
      "/api/weather": { date: today, prefecture: "大阪府", kind: "rain", rainChance: 80, tMax: 19, tMin: 12 },
    });
    wrap(<HomePage name="Simon" onOpenApps={vi.fn()} />);
    expect(await screen.findByText(/傘を忘れずに/)).toBeInTheDocument();
    expect(screen.getByText(/雨 · 19° \/ 12° · 80%/)).toBeInTheDocument();
    expect(screen.getAllByText(/文化の日/).length).toBeGreaterThan(0);
    const weatherCall = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.map(([u]) => u as string).find((u) => u.startsWith("/api/weather"));
    expect(weatherCall).toContain(encodeURIComponent("大阪府大阪市"));
  });

  it("accueil : météo au lieu de l'entretien ET chez soi quand ce n'est pas la même ville", async () => {
    const today = ymd(new Date());
    const fetchMock = vi.fn(async (url: string) => {
      if (url.startsWith("/api/applications")) return json([{ id: "a1", company: "ソニー", status: "interview1", nextDeadline: null, createdAt: "", updatedAt: "",
        steps: [{ id: "s1", type: "interview1", dueDate: today, time: "14:00", place: "大阪市北区梅田1-1", done: false }] }]);
      if (url.startsWith("/api/profile")) return json({ nameKanji: "デプセ", nameKana: "でぷせ", address: "東京都新宿区西新宿", education: [], work: [], certifications: [], languages: [] });
      if (url.startsWith("/api/weather")) {
        const osaka = decodeURIComponent(url).includes("大阪");
        return json({ date: today, prefecture: osaka ? "大阪府" : "東京都", place: osaka ? "大阪府大阪市" : "東京都新宿区", kind: osaka ? "sun" : "rain", rainChance: osaka ? 0 : 90, tMax: 20, tMin: 12 });
      }
      return json([]);
    });
    vi.stubGlobal("fetch", fetchMock);
    wrap(<HomePage name="Simon" onOpenApps={vi.fn()} />);
    expect(await screen.findByText("自宅")).toBeInTheDocument();
    expect(screen.getByText("会場")).toBeInTheDocument();
    expect(screen.getByText("大阪市北区梅田1-1")).toBeInTheDocument();
    expect(screen.getByText(/傘を忘れずに/), "il pleut chez soi : parapluie au départ").toBeInTheDocument();
  });

  it("accueil : entretien en ligne → bouton pour rejoindre, pas de météo du lieu", async () => {
    const today = ymd(new Date());
    server({
      "/api/applications": [{ id: "a1", company: "ソニー", status: "interview1", nextDeadline: null, createdAt: "", updatedAt: "",
        steps: [{ id: "s1", type: "interview1", dueDate: today, place: "https://zoom.us/j/123", done: false }] }],
      "/api/plans": [],
    });
    wrap(<HomePage name="Simon" onOpenApps={vi.fn()} />);
    expect(await screen.findByRole("link", { name: /オンライン面接に参加/ })).toHaveAttribute("href", "https://zoom.us/j/123");
    expect(screen.queryByText("会場")).toBeNull();
  });

  it("profil : le 〒 à 7 chiffres remplit l'adresse vide", async () => {
    server({ "/api/profile": { nameKanji: "デプセ", nameKana: "でぷせ", education: [], work: [], certifications: [], languages: [] },
      "/api/postal/1600023": { postalCode: "160-0023", address: "東京都新宿区西新宿", prefecture: "東京都" } });
    wrap(<ProfileEditor onSaved={vi.fn()} />);
    await userEvent.type(await screen.findByLabelText("郵便番号"), "1600023");
    expect(await screen.findByDisplayValue("東京都新宿区西新宿")).toBeInTheDocument();
    expect(screen.getByDisplayValue("160-0023")).toBeInTheDocument();
  });

  it("candidature : on retrouve l'entreprise par son nom, puis on la relie", async () => {
    server({ "/api/company/search": [{ corporateNumber: "5010401067252", name: "ソニーグループ株式会社", location: "東京都港区" }] });
    const onLink = vi.fn();
    wrap(<CompanyFacts company="ソニーグループ" onLink={onLink} />);
    await userEvent.click(screen.getByRole("button", { name: "公式データで企業を探す" }));
    await userEvent.click(await screen.findByRole("button", { name: /ソニーグループ株式会社/ }));
    expect(onLink).toHaveBeenCalledWith({ corporateNumber: "5010401067252", name: "ソニーグループ株式会社", location: "東京都港区" });
  });

  it("fiche reliée : labels d'État expliqués et chiffres du lieu de travail ; rien si gBizINFO n'est pas configuré", async () => {
    server({ "/api/company/5010401067252": { corporateNumber: "5010401067252", name: "ソニーグループ株式会社", location: null, url: null, employees: 1800, capital: null, founded: 1946, summary: null,
      labels: [{ id: "kurumin", title: "プラチナくるみん認定", date: "2022-06-01" }], workplace: { averageAge: 43.1, averageYears: null, overtimeHours: 17.5, femaleWorkersPct: null, femaleManagersPct: 13, paternityLeavePct: 82 } } });
    wrap(<CompanyFacts company="ソニーグループ" corporateNumber="5010401067252" onLink={vi.fn()} />);
    expect(await screen.findByText("プラチナくるみん認定")).toBeInTheDocument();
    expect(screen.getByText("子育てサポート企業")).toBeInTheDocument();
    expect(screen.getByText("17.5時間")).toBeInTheDocument();
    expect(screen.getByText("82%")).toBeInTheDocument();
    cleanup();

    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "not_configured" }, 503)));
    const { container } = wrap(<CompanyFacts company="ソニー" onLink={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "公式データで企業を探す" }));
    expect(container).toBeEmptyDOMElement();
  });

  it("rien trouvé : un message qui aide à corriger le nom, et on peut chercher à nouveau ; panne : un autre message", async () => {
    server({ "/api/company/search": [] });
    wrap(<CompanyFacts company="ソニー" onLink={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "公式データで企業を探す" }));
    expect(await screen.findByText("「ソニー」は見つかりませんでした。")).toBeInTheDocument();
    expect(screen.getByText(/正式な社名/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "もう一度探す" })).toBeInTheDocument();
    cleanup();
    clearApiCache();

    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "unavailable" }, 502)));
    wrap(<CompanyFacts company="ソニー" onLink={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "公式データで企業を探す" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("公式データに接続できませんでした");
  });
});
