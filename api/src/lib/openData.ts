/**
 * Données ouvertes intégrées à Clean Work : tout passe par l'API (clés gardées côté serveur,
 * pas de souci de CORS, et un cache pour solliciter les services le moins possible).
 *
 *  - jours fériés : holidays-jp (données du Cabinet Office, sans clé) ;
 *  - code postal → adresse : zipcloud (sans clé) ;
 *  - météo du jour de l'entretien : Open-Meteo (open source, sans clé, usage non commercial),
 *    au lieu exact grâce à la recherche d'adresses du 国土地理院 (sans clé) ;
 *  - fiche officielle d'une entreprise : gBizINFO (経済産業省, jeton GBIZ_API_TOKEN).
 */

type Fetcher = typeof fetch;

/** Petit cache en mémoire : chaque instance de l'API garde les réponses un moment. */
class Cache<T> {
  private entries = new Map<string, { at: number; value: T }>();
  constructor(private ttlMs: number, private max = 500) {}
  async get(key: string, load: () => Promise<T>, now = Date.now()): Promise<T> {
    const hit = this.entries.get(key);
    if (hit && now - hit.at < this.ttlMs) return hit.value;
    const value = await load();
    if (this.entries.size >= this.max) this.entries.delete(this.entries.keys().next().value as string);
    this.entries.set(key, { at: now, value });
    return value;
  }
}

async function getJson(url: string, fetcher: Fetcher, headers: Record<string, string> = {}) {
  const res = await fetcher(url, { headers: { accept: "application/json", ...headers }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json();
}

// ------------------------------------------------------------------ jours fériés

const holidayCache = new Cache<Record<string, string>>(24 * 3600_000);

/** { "2026-11-03": "文化の日", … } — l'année passée, en cours et suivante. Vide si le service ne répond pas. */
export function holidays(fetcher: Fetcher = fetch): Promise<Record<string, string>> {
  return holidayCache.get("all", async () => {
    try {
      const data = await getJson("https://holidays-jp.github.io/api/v1/date.json", fetcher);
      return Object.fromEntries(Object.entries(data as Record<string, unknown>)
        .filter(([d, n]) => /^\d{4}-\d{2}-\d{2}$/.test(d) && typeof n === "string")) as Record<string, string>;
    } catch {
      return {};
    }
  });
}

// ------------------------------------------------------------------ code postal

const postalCache = new Cache<PostalAddress | null>(7 * 24 * 3600_000);
export type PostalAddress = { postalCode: string; address: string; prefecture: string };

/** Adresse d'un code postal japonais (7 chiffres), ou null s'il n'existe pas. */
export function postalAddress(code: string, fetcher: Fetcher = fetch): Promise<PostalAddress | null> {
  const zip = code.replace(/[^0-9]/g, "");
  if (zip.length !== 7) return Promise.resolve(null);
  return postalCache.get(zip, async () => {
    const data = await getJson(`https://zipcloud.ibsnet.co.jp/api/search?zipcode=${zip}`, fetcher);
    const r = data?.results?.[0];
    if (!r) return null;
    return { postalCode: `${zip.slice(0, 3)}-${zip.slice(3)}`, address: `${r.address1}${r.address2}${r.address3}`, prefecture: r.address1 };
  });
}

// ------------------------------------------------------------------ météo

/** Chef-lieu de chaque préfecture (coordonnées arrondies) : assez précis pour une prévision du jour. */
export const PREFECTURES: Record<string, [number, number]> = {
  北海道: [43.06, 141.35], 青森県: [40.82, 140.74], 岩手県: [39.70, 141.15], 宮城県: [38.27, 140.87], 秋田県: [39.72, 140.10],
  山形県: [38.24, 140.36], 福島県: [37.75, 140.47], 茨城県: [36.34, 140.45], 栃木県: [36.57, 139.88], 群馬県: [36.39, 139.06],
  埼玉県: [35.86, 139.65], 千葉県: [35.61, 140.12], 東京都: [35.69, 139.69], 神奈川県: [35.45, 139.64], 新潟県: [37.90, 139.02],
  富山県: [36.70, 137.21], 石川県: [36.59, 136.63], 福井県: [36.07, 136.22], 山梨県: [35.66, 138.57], 長野県: [36.65, 138.18],
  岐阜県: [35.39, 136.72], 静岡県: [34.98, 138.38], 愛知県: [35.18, 136.91], 三重県: [34.73, 136.51], 滋賀県: [35.00, 135.87],
  京都府: [35.02, 135.76], 大阪府: [34.69, 135.52], 兵庫県: [34.69, 135.18], 奈良県: [34.69, 135.83], 和歌山県: [34.23, 135.17],
  鳥取県: [35.50, 134.24], 島根県: [35.47, 133.05], 岡山県: [34.66, 133.93], 広島県: [34.40, 132.46], 山口県: [34.19, 131.47],
  徳島県: [34.07, 134.56], 香川県: [34.34, 134.04], 愛媛県: [33.84, 132.77], 高知県: [33.56, 133.53], 福岡県: [33.61, 130.42],
  佐賀県: [33.25, 130.30], 長崎県: [32.74, 129.87], 熊本県: [32.79, 130.74], 大分県: [33.24, 131.61], 宮崎県: [31.91, 131.42],
  鹿児島県: [31.56, 130.56], 沖縄県: [26.21, 127.68],
};

/** La préfecture au début d'une adresse (« 東京都港区… » → 東京都), sinon Tokyo. */
export function prefectureOf(address?: string | null): string {
  return Object.keys(PREFECTURES).find((p) => address?.startsWith(p)) ?? "東京都";
}

export type WeatherKind = "sun" | "cloud" | "rain" | "snow" | "storm" | "fog";
export type DayWeather = {
  date: string;
  /** Préfecture du lieu (compatibilité avec les premières versions de l'app). */
  prefecture: string;
  /** Lieu court affiché : « 東京都渋谷区 ». */
  place: string;
  kind: WeatherKind;
  rainChance: number | null;
  tMax: number | null;
  tMin: number | null;
};

/** Codes météo de l'OMM (WMO) → une des six icônes de l'app. */
export function weatherKind(code: number): WeatherKind {
  if (code >= 95) return "storm";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  if (code === 45 || code === 48) return "fog";
  if (code >= 2) return "cloud";
  return "sun";
}

/** « 東京都渋谷区道玄坂一丁目… » → « 東京都渋谷区 » (préfecture et commune seulement). */
export function shortPlace(address: string): string {
  const m = address.match(/^(.+?[都道府県])?(.+?[市区町村])/);
  return m ? `${m[1] ?? ""}${m[2]}` : address.slice(0, 12);
}

type Point = { lat: number; lon: number; place: string; prefecture: string };
const geoCache = new Cache<Point | null>(30 * 24 * 3600_000);

/**
 * Adresse japonaise → coordonnées, avec le service de recherche d'adresses du 国土地理院 (GSI, sans clé).
 * Il comprend aussi une adresse sans préfecture (« 渋谷区道玄坂… »). Sans réponse : chef-lieu de la préfecture.
 */
export function geocode(address: string, fetcher: Fetcher = fetch): Promise<Point | null> {
  const q = address.trim();
  if (!q || /^https?:\/\//i.test(q)) return Promise.resolve(null);
  return geoCache.get(q, async () => {
    try {
      const found = await getJson(`https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(q)}`, fetcher);
      const first = Array.isArray(found) ? found[0] : null;
      const [lon, lat] = first?.geometry?.coordinates ?? [];
      if (typeof lat === "number" && typeof lon === "number") {
        const title = String(first.properties?.title ?? q);
        return { lat, lon, place: shortPlace(title), prefecture: prefectureOf(title) };
      }
    } catch {
      // Service indisponible : on retombe sur la préfecture écrite au début de l'adresse.
    }
    const pref = Object.keys(PREFECTURES).find((p) => q.startsWith(p));
    return pref ? { lat: PREFECTURES[pref][0], lon: PREFECTURES[pref][1], place: pref, prefecture: pref } : null;
  });
}

const weatherCache = new Cache<DayWeather | null>(3 * 3600_000);
const TOKYO: Point = { lat: PREFECTURES["東京都"][0], lon: PREFECTURES["東京都"][1], place: "東京都", prefecture: "東京都" };

/** Prévision d'un jour au lieu donné (Tokyo par défaut), au plus 15 jours à l'avance ; null sinon. */
export async function dayWeather(date: string, location: string | null | undefined, fetcher: Fetcher = fetch, today = new Date()): Promise<DayWeather | null> {
  const ahead = (Date.parse(date) - Date.parse(today.toISOString().slice(0, 10))) / 86400_000;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !(ahead >= 0 && ahead <= 15)) return null;
  const point = (location ? await geocode(location, fetcher) : null) ?? TOKYO;
  // Arrondi à ~1 km : deux adresses voisines partagent la même prévision en cache.
  const lat = point.lat.toFixed(2), lon = point.lon.toFixed(2);
  return weatherCache.get(`${lat},${lon}/${date}`, async () => {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&timezone=Asia%2FTokyo`
      + `&daily=weather_code,precipitation_probability_max,temperature_2m_max,temperature_2m_min&start_date=${date}&end_date=${date}`;
    const d = (await getJson(url, fetcher))?.daily;
    if (!d?.time?.length) return null;
    const round = (v: unknown) => (typeof v === "number" ? Math.round(v) : null);
    return { date, prefecture: point.prefecture, place: point.place, kind: weatherKind(Number(d.weather_code[0])),
      rainChance: round(d.precipitation_probability_max?.[0]), tMax: round(d.temperature_2m_max?.[0]), tMin: round(d.temperature_2m_min?.[0]) };
  });
}

// ------------------------------------------------------------------ gBizINFO

const GBIZ = "https://api.info.gbiz.go.jp/hojin/v2/hojin";

export type CompanyMatch = { corporateNumber: string; name: string; location: string | null };
export type CompanyLabel = { id: LabelId | null; title: string; date: string | null };
export type CompanyFacts = {
  corporateNumber: string;
  name: string;
  location: string | null;
  url: string | null;
  employees: number | null;
  capital: number | null;
  founded: number | null;
  summary: string | null;
  /** Labels d'État utiles à un étudiant d'abord, puis les autres titres (sans doublons). */
  labels: CompanyLabel[];
  workplace: {
    averageAge: number | null;
    averageYears: number | null;
    overtimeHours: number | null;
    femaleWorkersPct: number | null;
    femaleManagersPct: number | null;
    paternityLeavePct: number | null;
  } | null;
};

/** Les labels que l'app met en avant (le titre gBizINFO contient le nom ; « プラチナ » est la version supérieure). */
export const LABELS = ["kurumin", "eruboshi", "youthyell", "kenkou", "monisu", "anzen"] as const;
export type LabelId = (typeof LABELS)[number];
const LABEL_PATTERNS: [LabelId, RegExp][] = [
  ["kurumin", /くるみん/], ["eruboshi", /えるぼし/], ["youthyell", /ユースエール/],
  ["kenkou", /健康経営/], ["monisu", /もにす/], ["anzen", /安全衛生優良/],
];
export const labelId = (title: string): LabelId | null => LABEL_PATTERNS.find(([, re]) => re.test(title))?.[0] ?? null;

const searchCache = new Cache<CompanyMatch[]>(24 * 3600_000);
const factsCache = new Cache<CompanyFacts | null>(24 * 3600_000);

export class GBizClient {
  constructor(private token: string, private fetcher: Fetcher = fetch) {}

  private get(path: string) {
    return getJson(`${GBIZ}${path}`, this.fetcher, { "X-hojinInfo-api-token": this.token });
  }

  /** Entreprises en activité dont le nom contient `name`, les plus actives d'abord (5 au plus). */
  search(name: string): Promise<CompanyMatch[]> {
    const q = name.trim();
    if (q.length < 2) return Promise.resolve([]);
    return searchCache.get(q, async () => {
      const data = await this.get(`?name=${encodeURIComponent(q)}&exist_flg=true&limit=10`);
      return ((data?.["hojin-infos"] ?? []) as Record<string, string>[])
        .filter((h) => !h.status || h.status === "-" || !/閉鎖/.test(h.status))
        .sort((a, b) => Number(b.number_of_activity ?? 0) - Number(a.number_of_activity ?? 0))
        .slice(0, 5)
        .map((h) => ({ corporateNumber: h.corporate_number, name: h.name, location: h.location || null }));
    });
  }

  /** Fiche d'une entreprise par son 法人番号 (13 chiffres), ou null si elle est inconnue. */
  facts(corporateNumber: string): Promise<CompanyFacts | null> {
    if (!/^\d{13}$/.test(corporateNumber)) return Promise.resolve(null);
    return factsCache.get(corporateNumber, async () => {
      const [basic, cert, work] = await Promise.all([
        this.get(`/${corporateNumber}`),
        this.get(`/${corporateNumber}/certification`).catch(() => null),
        this.get(`/${corporateNumber}/workplace`).catch(() => null),
      ]);
      const h = basic?.["hojin-infos"]?.[0];
      if (!h) return null;
      const certs = (cert?.["hojin-infos"]?.[0]?.certification ?? []) as { title?: string; date_of_approval?: string }[];
      const wp = work?.["hojin-infos"]?.[0]?.workplace_info;
      return toFacts(h, certs, wp);
    });
  }
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && !Number.isNaN(Number(v)) ? Number(v) : null);
const pct = (part: unknown, total: unknown) => {
  const p = num(part), t = num(total);
  return p !== null && t ? Math.round((p / t) * 100) : null;
};

/** Ramène la réponse de gBizINFO aux quelques chiffres que l'app affiche. */
export function toFacts(h: Record<string, unknown>, certs: { title?: string; date_of_approval?: string }[], wp: Record<string, Record<string, unknown>> | null | undefined): CompanyFacts {
  const seen = new Set<string>();
  const labels = certs
    .filter((c) => c.title && !seen.has(c.title) && seen.add(c.title))
    .map((c) => ({ id: labelId(c.title!), title: c.title!, date: c.date_of_approval ?? null }))
    .sort((a, b) => Number(b.id !== null) - Number(a.id !== null) || (b.date ?? "").localeCompare(a.date ?? ""));
  const base = wp?.base_infos, women = wp?.women_activity_infos, care = wp?.compatibility_of_childcare_and_work;
  const workplace = wp ? {
    averageAge: num(base?.average_age),
    averageYears: num(base?.average_continuous_service_years),
    overtimeHours: num(base?.month_average_predetermined_overtime_hours),
    femaleWorkersPct: num(women?.female_workers_proportion),
    femaleManagersPct: pct(women?.female_share_of_manager, women?.gender_total_of_manager),
    paternityLeavePct: pct(care?.paternity_leave_acquisition_num, care?.number_of_paternity_leave),
  } : null;
  return {
    corporateNumber: String(h.corporate_number),
    name: String(h.name ?? ""),
    location: (h.location as string) || null,
    url: (h.company_url as string) || null,
    employees: num(h.employee_number),
    capital: num(h.capital_stock),
    founded: num(h.founding_year) ?? (typeof h.date_of_establishment === "string" ? num(h.date_of_establishment.slice(0, 4)) : null),
    summary: (h.business_summary as string) || null,
    labels,
    workplace: workplace && Object.values(workplace).some((v) => v !== null) ? workplace : null,
  };
}

export function gbizFromEnv(): GBizClient | null {
  const token = process.env.GBIZ_API_TOKEN;
  return token ? new GBizClient(token) : null;
}
