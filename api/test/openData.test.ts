import { HttpRequest, InvocationContext } from "@azure/functions";
import { describe, expect, it } from "vitest";
import { openDataHandler } from "../src/functions/openData";
import type { IdentityVerifier } from "../src/lib/identity";
import { GBizClient, labelId, prefectureOf, shortPlace, toFacts, weatherKind } from "../src/lib/openData";

const verifier = (): IdentityVerifier => ({ verify: async () => ({ userId: "u1" }) });
const ctx = new InvocationContext({ logHandler: () => {} });

/** Faux services : chaque URL appelée est notée, la réponse dépend de l'adresse. */
function fakeFetch(routes: Record<string, unknown>) {
  const calls: string[] = [];
  const fetcher = (async (url: string) => {
    calls.push(url);
    const hit = Object.entries(routes).find(([k]) => url.includes(k));
    return hit ? new Response(JSON.stringify(hit[1])) : new Response("{}", { status: 404 });
  }) as typeof fetch;
  return { fetcher, calls };
}

const get = (handler: ReturnType<typeof openDataHandler>, path: string, params: Record<string, string> = {}) =>
  handler(new HttpRequest({ url: `https://x/api/${path}`, method: "GET", headers: { "x-shukatsu-token": "t" }, params }), ctx);

describe("données ouvertes", () => {
  it("météo : codes de l'OMM → six icônes ; préfecture lue au début de l'adresse, Tokyo par défaut", () => {
    expect([0, 1, 3, 45, 61, 80, 73, 95].map(weatherKind)).toEqual(["sun", "sun", "cloud", "fog", "rain", "rain", "snow", "storm"]);
    expect(prefectureOf("大阪府大阪市北区…")).toBe("大阪府");
    expect(prefectureOf(null)).toBe("東京都");
    expect(shortPlace("東京都渋谷区道玄坂一丁目２番３号")).toBe("東京都渋谷区");
  });

  it("GET /api/weather : adresse géocodée (国土地理院), prévision du jour arrondie ; rien au-delà de 15 jours", async () => {
    const { fetcher, calls } = fakeFetch({
      "msearch.gsi.go.jp": [{ geometry: { coordinates: [135.4977, 34.7000] }, properties: { title: "大阪府大阪市北区梅田一丁目" } }],
      "open-meteo": { daily: { time: ["2026-10-30"], weather_code: [63], precipitation_probability_max: [80], temperature_2m_max: [18.6], temperature_2m_min: [12.2] } },
    });
    const handler = openDataHandler("weather", { verifier, fetcher, now: () => new Date("2026-10-25T00:00:00Z") });
    const res = await get(handler, `weather?date=2026-10-30&location=${encodeURIComponent("大阪市北区梅田1-1")}`);
    expect(res.jsonBody).toEqual({ date: "2026-10-30", prefecture: "大阪府", place: "大阪府大阪市", kind: "rain", rainChance: 80, tMax: 19, tMin: 12 });
    expect(calls.find((u) => u.includes("open-meteo"))).toContain("latitude=34.70&longitude=135.50");
    expect((await get(handler, "weather?date=2026-12-30")).status).toBe(404);
  });

  it("météo : un lien (entretien en ligne) n'est pas géocodé ; sans réponse du 国土地理院, la préfecture écrite suffit", async () => {
    const { geocode } = await import("../src/lib/openData");
    const { fetcher, calls } = fakeFetch({});
    expect(await geocode("https://zoom.us/j/123", fetcher)).toBeNull();
    expect(calls).toEqual([]);
    expect(await geocode("福岡県福岡市中央区天神", fetcher)).toMatchObject({ prefecture: "福岡県", lat: 33.61 });
  });

  it("GET /api/postal/{code} : adresse complète, 404 si le code n'existe pas", async () => {
    const { fetcher } = fakeFetch({ "zipcode=1600023": { results: [{ address1: "東京都", address2: "新宿区", address3: "西新宿" }] }, "zipcode=0000000": { results: null } });
    const handler = openDataHandler("postal", { verifier, fetcher });
    expect((await get(handler, "postal/160-0023", { key: "160-0023" })).jsonBody).toEqual({ postalCode: "160-0023", address: "東京都新宿区西新宿", prefecture: "東京都" });
    expect((await get(handler, "postal/0000000", { key: "0000000" })).status).toBe(404);
  });

  it("GET /api/holidays : seulement les dates valides ; vide si le service ne répond pas", async () => {
    const ok = openDataHandler("holidays", { verifier, fetcher: fakeFetch({ "holidays-jp": { "2026-11-03": "文化の日", bad: "x" } }).fetcher });
    const body = (await get(ok, "holidays")).jsonBody as Record<string, string>;
    expect(body["2026-11-03"]).toBe("文化の日");
    expect(body.bad).toBeUndefined();
  });

  it("GET /api/company : 503 tant que le jeton gBizINFO n'est pas posé", async () => {
    const handler = openDataHandler("company", { verifier, gbiz: () => null });
    expect((await get(handler, "company/search?name=sony", { key: "search" })).status).toBe(503);
  });

  it("recherche gBizINFO : jeton dans l'en-tête, les entreprises les plus actives d'abord", async () => {
    let header = "";
    const fetcher = (async (_url: string, init?: RequestInit) => {
      header = (init?.headers as Record<string, string>)["X-hojinInfo-api-token"];
      return new Response(JSON.stringify({ "hojin-infos": [
        { corporate_number: "1111111111111", name: "ソニー販売", location: "東京都", number_of_activity: "2" },
        { corporate_number: "5010401067252", name: "ソニーグループ株式会社", location: "東京都港区港南", number_of_activity: "40" },
      ] }));
    }) as typeof fetch;
    const found = await new GBizClient("jeton", fetcher).search("ソニーグループ");
    expect(header).toBe("jeton");
    expect(found.map((c) => c.corporateNumber)).toEqual(["5010401067252", "1111111111111"]);
  });

  it("recherche gBizINFO : « 株式会社 » et espaces retirés ; 404 = aucun résultat (pas une panne)", async () => {
    const urls: string[] = [];
    const fetcher = (async (url: string) => { urls.push(url); return new Response("{}", { status: 404 }); }) as typeof fetch;
    expect(await new GBizClient("jeton", fetcher).search("株式会社 メルカリ")).toEqual([]);
    expect(decodeURIComponent(urls[0])).toContain("name=メルカリ&");
  });

  it("fiche : labels utiles en premier, pourcentages calculés, chiffres absents = null", () => {
    expect(labelId("プラチナくるみん認定")).toBe("kurumin");
    expect(labelId("ISO 9001")).toBeNull();
    const facts = toFacts(
      { corporate_number: "5010401067252", name: "ソニーグループ株式会社", employee_number: 1500, founding_year: 1946, company_url: "https://www.sony.com/" },
      [{ title: "ISO 9001", date_of_approval: "2020-01-01" }, { title: "えるぼし認定（3段階目）", date_of_approval: "2019-05-01" }, { title: "ISO 9001" }],
      { base_infos: { average_age: 43.1, month_average_predetermined_overtime_hours: 18 },
        women_activity_infos: { female_share_of_manager: 30, gender_total_of_manager: 200 },
        compatibility_of_childcare_and_work: { paternity_leave_acquisition_num: 45, number_of_paternity_leave: 60 } },
    );
    expect(facts.labels.map((l) => l.id)).toEqual(["eruboshi", null]);
    expect(facts.workplace).toEqual({ averageAge: 43.1, averageYears: null, overtimeHours: 18, femaleWorkersPct: null, femaleManagersPct: 15, paternityLeavePct: 75 });
    expect(facts.employees).toBe(1500);
  });
});
