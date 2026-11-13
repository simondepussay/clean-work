import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import guide from "../../public/naitei-guide.json";
import { clearApiCache, type Application } from "../api";
import { AuthContext, type Auth } from "../auth/auth";
import { setHelpLanguage } from "../es/guide";
import { OfferGuidePanel, resetOfferGuideCache } from "./OfferGuidePanel";

afterEach(() => { vi.unstubAllGlobals(); clearApiCache(); resetOfferGuideCache(); });

const auth: Auth = { state: { status: "signedIn", email: "s@example.com", name: "Simon" }, signIn: vi.fn(), signOut: vi.fn(), getToken: async () => "jeton" };
const app: Application = { id: "a1", company: "ソニー", status: "offer", steps: [], nextDeadline: null, createdAt: "t", updatedAt: "t", offerChecklist: ["accept"] };

function server(putOk = true) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "PUT") return putOk ? new Response(JSON.stringify({ ...app, ...JSON.parse(init.body as string) })) : new Response("{}", { status: 500 });
    return new Response(JSON.stringify(url.endsWith("/naitei-guide.json") ? guide : {}));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
function renderPanel() {
  setHelpLanguage("ja");
  const onChange = vi.fn();
  render(<AuthContext.Provider value={auth}><OfferGuidePanel application={app} onChange={onChange} /></AuthContext.Provider>);
  return onChange;
}

describe("naitei-guide.json", () => {
  it("chaque étape a un identifiant unique et ses trois langues ; les liens sont ceux de l'immigration", () => {
    const ids = guide.steps.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    const texts = [guide.intro, guide.disclaimer, ...guide.steps.flatMap((s) => [s.title, s.when, s.detail, ...(s.items ?? []), ...(s.links ?? []).map((l) => l.label)]), ...guide.notes.flatMap((n) => [n.title, n.detail])];
    for (const t of texts) for (const lang of ["ja", "en", "fr"] as const) expect(t[lang].trim()).not.toBe("");
    for (const l of guide.steps.flatMap((s) => s.links ?? [])) expect(l.url).toMatch(/^https:\/\/www\.moj\.go\.jp\/isa\//);
    // Les montants changent (révision d'octobre 2026) : le guide renvoie à la page officielle au lieu de les citer.
    expect(JSON.stringify(guide)).not.toMatch(/\d[\d,，]*\s*円|¥\s*\d/);
  });
});

describe("OfferGuidePanel", () => {
  it("montre les étapes, celles déjà cochées, et enregistre une case cochée", async () => {
    const fetchMock = server();
    const user = userEvent.setup();
    const onChange = renderPanel();
    expect(await screen.findByText(`${guide.steps.length}つのうち 1つ完了`)).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /内定を承諾し、条件を確認する/ })).toBeChecked();

    await user.click(screen.getByRole("checkbox", { name: /出入国在留管理局に申請する/ }));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const put = fetchMock.mock.calls.find(([, init]) => init?.method === "PUT")!;
    expect(JSON.parse(put[1]!.body as string)).toEqual({ offerChecklist: ["accept", "apply"] });
    expect(screen.getByText(`${guide.steps.length}つのうち 2つ完了`)).toBeInTheDocument();
    const link = within(screen.getByRole("region", { name: "内定後の手続き" })).getAllByRole("link")[0];
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("si l'enregistrement échoue, la case revient à son état", async () => {
    server(false);
    const user = userEvent.setup();
    renderPanel();
    const box = await screen.findByRole("checkbox", { name: /学校で証明書をもらう/ });
    await user.click(box);
    expect(await screen.findByRole("alert")).toHaveTextContent("保存できませんでした");
    expect(box).not.toBeChecked();
  });
});
