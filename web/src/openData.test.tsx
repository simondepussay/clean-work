import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
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

    server({});
    const { container } = wrap(<CompanyFacts company="ソニー" onLink={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "公式データで企業を探す" }));
    expect(container).toBeEmptyDOMElement();
  });
});
