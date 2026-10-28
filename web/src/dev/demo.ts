/**
 * Mode démo, en développement seulement (`npm run dev`, puis http://localhost:5174/?demo).
 *
 * Un faux compte et des données d'exemple, sans connexion ni serveur : pour travailler le
 * design de tous les écrans et faire des captures pour le portfolio. Le code n'est chargé
 * que si `import.meta.env.DEV` est vrai : il n'existe pas dans le site en production.
 */
import type { Auth } from "../auth/auth";

export const demoAuth: Auth = {
  state: { status: "signedIn", email: "simon@example.com", name: "Simon" },
  signIn: async () => {},
  signOut: async () => { location.search = ""; },
  getToken: async () => "demo",
};

const today = new Date();
const inDays = (n: number) => new Date(today.getTime() + n * 86400_000).toISOString().slice(0, 10);

const applications = [
  { id: "a1", company: "株式会社サイバーエージェント", position: "ゲームプランナー", industry: "it", companyType: "large", notes: "Cygames。若手に裁量を与える文化。",
    status: "es", steps: [{ id: "s1", type: "es", dueDate: inDays(2), done: false }], nextDeadline: inDays(2), createdAt: "", updatedAt: "" },
  { id: "a2", company: "ソニーグループ", position: "エンジニア", industry: "maker", companyType: "large", corporateNumber: "5010401067252", location: "東京都港区港南１丁目７番１号",
    status: "interview1", steps: [{ id: "s2", type: "interview1", dueDate: inDays(6), time: "14:00", done: false, place: "東京都港区港南1-7-1" }], nextDeadline: inDays(6), createdAt: "", updatedAt: "" },
  { id: "a3", company: "楽天グループ", status: "interested", steps: [], nextDeadline: null, createdAt: "", updatedAt: "" },
  { id: "a4", company: "LINEヤフー", status: "test", steps: [{ id: "s4", type: "test", dueDate: inDays(12), done: false }], nextDeadline: inDays(12), createdAt: "", updatedAt: "" },
  { id: "a5", company: "メルカリ", position: "バックエンドエンジニア", status: "applied", steps: [], nextDeadline: null, createdAt: "", updatedAt: "2026-10-22" },
  { id: "a6", company: "トヨタ自動車", position: "ソフトウェア開発", status: "applied", steps: [], nextDeadline: null, createdAt: "", updatedAt: "2026-10-20" },
];

const drafts = [
  { id: "d1", kind: "motivation", applicationId: "a1", company: "株式会社サイバーエージェント", question: "当社を志望する理由を教えてください。", charLimit: 400,
    body: "私が貴社を志望する理由は、世界中の人を楽しませるゲームを作りたいからです。", createdAt: "", updatedAt: today.toISOString() },
  { id: "d2", kind: "jikopr", question: "自己PRをしてください。", charLimit: 300, body: "私の強みは行動力です。", createdAt: "", updatedAt: today.toISOString() },
];

const profile = {
  nameKanji: "ドゥピュッセ シモン", nameKana: "どぅぴゅっせ しもん", nameLatin: "Simon Depussay",
  education: [{ school: "HAL東京", faculty: "IT学部", start: "2026-04", end: "2028-03", status: "expected" }],
  work: [], certifications: [{ category: "language", name: "JLPT N2", date: "2025-12" }],
  languages: [{ language: "fr", level: "native" }, { language: "ja", level: "business" }],
};

const interview = {
  id: "i1", applicationId: "a1", company: "株式会社サイバーエージェント", stage: "interview1", language: "fr", status: "active", createdAt: today.toISOString(), updatedAt: "",
  turns: [
    { question: "まず、自己紹介をお願いします。", intent: "Clarté et structure de la présentation.", kind: "main" },
    { question: "当社のゲーム事業に興味を持った理由を教えてください。", intent: "Motivation spécifique pour l'entreprise.", kind: "main" },
  ],
};

const plans = [
  { id: "p1", kind: "event", title: "合同企業説明会", date: inDays(1), time: "13:00", done: false, createdAt: "", updatedAt: "" },
  { id: "p2", kind: "goal", title: "ES 3本提出", date: inDays(5), done: false, createdAt: "", updatedAt: "" },
  { id: "p3", kind: "event", title: "OB訪問（楽天）", date: inDays(8), time: "18:30", done: false, createdAt: "", updatedAt: "" },
  { id: "p4", kind: "goal", title: "SPI 模試で7割", date: inDays(14), done: false, createdAt: "", updatedAt: "" },
];

/** Onglet « こころ » : quelques jours notés, dont 3 jours de pluie cette semaine (palier « often »). */
const moodDays: ["sunny" | "cloudy" | "rainy", string?][] = [
  ["sunny"], ["cloudy"], ["sunny", "ほっとした"], ["cloudy"], ["rainy", "不安"], ["sunny"], ["cloudy", "疲れた"], ["sunny"], ["cloudy"],
  ["sunny", "ワクワク"], ["rainy", "焦り"], ["cloudy"], ["rainy", "疲れた"], ["rainy", "不安"],
];
// « ?demo&mood=sunny » : choisir la météo du jour pour comparer les ciels (captures).
const demoMood = new URLSearchParams(location.search).get("mood");
if (demoMood === "sunny" || demoMood === "cloudy" || demoMood === "rainy") moodDays[moodDays.length - 1] = [demoMood];
const kokoro = {
  moods: moodDays.map(([weather, word], i) => ({ date: inDays(i - moodDays.length + 1), weather, ...(word ? { word } : {}) })),
  values: ["家族を安心させたい", "誠実でいること", "人の役に立つものを作る"],
  support: { level: "often", rainy7: 3, rainy14: 4 },
  week: { applications: 2, drafts: 3, interviews: 1, rejections: 1 },
  prefecture: "東京都",
  international: true,
  cheers: [
    { id: "done-1", kind: "done", title: { ja: "昨日もよくがんばりました", en: "Nice work yesterday", fr: "Belle journée hier" },
      body: { ja: "1社を追加、ESを1本、面接練習を1回。ちゃんと前に進んでいます。", en: "1 company added, 1 entry sheet written, 1 practice interview. You're really moving forward.", fr: "1 entreprise ajoutée, 1 ES rédigée, 1 entretien d'entraînement. Vous avancez vraiment." } },
    { id: "nudge-1", kind: "nudge", title: { ja: "面接の練習をしてみませんか", en: "A little interview practice?", fr: "Un peu d'entraînement ?" },
      body: { ja: "ソニーグループの一次面接まであと3日。10分だけでも、話す感覚がつかめます。", en: "3 days until your first interview at Sony Group. Even ten minutes helps you find your words.", fr: "3 jours avant votre premier entretien chez Sony Group. Dix minutes suffisent pour trouver vos mots." },
      action: { tab: "interview", applicationId: "a2" } },
    { id: "word-g05", kind: "word", title: { ja: "今日のひとこと", en: "Today's word", fr: "Le mot du jour" },
      body: { ja: "深呼吸を3回。それだけで、少し景色が変わります。", en: "Three deep breaths. That alone changes the view a little.", fr: "Trois grandes respirations. Ça suffit à changer un peu le paysage." } },
  ],
  charms: [{ text: "準備してきた自分を信じて。", when: "hour" }, { text: "笑顔で入ろう。", when: "tenmin" }],
  cheerFrequency: "daily",
  devices: { count: 1, lastSeen: today.toISOString() },
};

const routes: Record<string, unknown> = {
  "GET /api/kokoro*": kokoro,
  "GET /api/plans": plans,
  "GET /api/info?page=1": {
    page: 1, pages: 2, total: 9, sources: [{ id: "mhlw", name: "厚生労働省" }, { id: "japantimes", name: "The Japan Times" }],
    items: [
      ["mhlw", "新規学卒者の離職状況を公表", "Turnover of new graduates published", "Publication du taux de départ des jeunes diplômés"],
      ["japantimes", "日本のインフレ率が今年初めて2％超に", "Japanese inflation tops 2% for the first time this year", "L'inflation japonaise dépasse 2 % pour la première fois de l'année"],
      ["japantimes", "最大の労組連合、2027年に6％の賃上げを要求", "Biggest labour federation calls for 6% wage hike in 2027", "La plus grande fédération syndicale demande 6 % de hausse en 2027"],
      ["mhlw", "労働政策審議会 労働条件分科会の開催", "Labour policy council: working conditions subcommittee", "Conseil de politique du travail : conditions de travail"],
      ["mhlw", "外国人雇用状況の届出まとめ", "Summary of foreign employment notifications", "Bilan des déclarations d'emploi d'étrangers"],
      ["japantimes", "求人倍率は高い水準が続く", "Job-to-applicant ratio stays high", "Le ratio offres/demandeurs reste élevé"],
      ["mhlw", "キャリアコンサルタント制度の検討会", "Review of the career consultant system", "Réflexion sur le système des conseillers en carrière"],
    ].map(([source, ja, en, fr], i) => ({ id: `news-${i}`, kind: "news", date: inDays(-Math.floor(i / 5)), source, link: "https://www.mhlw.go.jp/",
      title: { ja, en, fr }, summary: { ja: "就活の参考になるニュースです。", en: "Useful context for your job hunt.", fr: "Un contexte utile pour votre recherche d'emploi." } })),
    articles: [
      { id: "bienvenue", kind: "article", date: inDays(0), lang: "ja", body: "Clean Work へようこそ。",
        title: { ja: "Clean Work へようこそ", en: "Welcome to Clean Work", fr: "Bienvenue sur Clean Work" },
        summary: { ja: "就活に必要なものを、ひとつの場所に。", en: "Everything for your job hunt, in one place.", fr: "Tout pour votre recherche d'emploi, au même endroit." } },
    ],
  },
  "GET /api/news": {
    sources: [{ id: "mhlw", name: "厚生労働省", site: "", lang: "ja" }, { id: "nhk", name: "NHK 経済", site: "", lang: "ja" }, { id: "japantimes", name: "The Japan Times", site: "", lang: "en" }],
    items: [
      { source: "mhlw", title: "外国人雇用状況の届出状況まとめ", link: "https://www.mhlw.go.jp/", date: today.toISOString(), excerpt: "" },
      { source: "japantimes", title: "Japan's job-to-applicant ratio stays high", link: "https://www.japantimes.co.jp/", date: today.toISOString(), excerpt: "Demand for workers remains strong across industries…" },
      { source: "nhk", title: "来春卒業予定の大学生の就職内定率", link: "https://www3.nhk.or.jp/news/", date: today.toISOString(), excerpt: "" },
    ],
  },
  "GET /api/calendar-link?lang=ja": { url: "https://example.test/api/calendar/demo.token.ics?lang=ja" },
  "GET /api/calendar-link?lang=en": { url: "https://example.test/api/calendar/demo.token.ics?lang=en" },
  "GET /api/calendar-link?lang=fr": { url: "https://example.test/api/calendar/demo.token.ics?lang=fr" },
  "GET /api/health": { status: "ok", version: "demo", database: "ok", resume: "ok", push: "ok" },
  "GET /api/me": { userId: "demo", email: "simon@example.com", name: "Simon", hasProfile: true },
  "GET /api/profile": profile,
  "GET /api/applications": applications,
  "GET /api/drafts": drafts,
  "GET /api/usage": { today: 9, month: 28 },
  "GET /api/interviews": [{ id: "i0", company: "ソニーグループ", applicationId: "a2", stage: "interview1", status: "finished", score: 68, questions: 6, createdAt: today.toISOString() }],
  "GET /api/interview-usage": { today: 3, month: 19 },
  "POST /api/interviews": interview,
  // Données ouvertes (exemples ; « * » = préfixe).
  "GET /api/holidays": { "2026-11-03": "文化の日", "2026-11-23": "勤労感謝の日", "2027-01-01": "元日", "2027-01-11": "成人の日", "2027-02-11": "建国記念の日" },
  "GET /api/weather*": { date: "", prefecture: "東京都", kind: "rain", rainChance: 70, tMax: 18, tMin: 12 },
  "GET /api/postal/*": { postalCode: "160-0023", address: "東京都新宿区西新宿", prefecture: "東京都" },
  "GET /api/company/search*": [
    { corporateNumber: "5010401067252", name: "ソニーグループ株式会社", location: "東京都港区港南１丁目７番１号" },
    { corporateNumber: "1010401000001", name: "ソニー生命保険株式会社", location: "東京都千代田区大手町１丁目９番２号" },
  ],
  "GET /api/company/*": {
    corporateNumber: "5010401067252", name: "ソニーグループ株式会社", location: "東京都港区港南１丁目７番１号", url: "https://www.sony.com/ja/",
    employees: 1800, capital: 880000000000, founded: 1946, summary: "エレクトロニクス、ゲーム、音楽、映画、金融などの事業を行うグループの本社機能。",
    labels: [
      { id: "kurumin", title: "プラチナくるみん認定", date: "2022-06-01" },
      { id: "eruboshi", title: "えるぼし認定（3段階目）", date: "2021-04-01" },
      { id: "kenkou", title: "健康経営優良法人（大規模法人部門）", date: "2025-03-10" },
      { id: null, title: "ISO 14001", date: null },
    ],
    workplace: { averageAge: 43.1, averageYears: 18.2, overtimeHours: 17.5, femaleWorkersPct: 26, femaleManagersPct: 13, paternityLeavePct: 82 },
  },
};

/** Remplace `fetch` pour les appels à /api par les données d'exemple ci-dessus. */
export function installDemoApi() {
  const real = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
    if (!url.startsWith("/api/")) return real(input, init);
    const method = init?.method ?? "GET";
    const key = `${method} ${url}`;
    // Ajout ou modification : on renvoie ce qui a été envoyé, avec un identifiant.
    const sent = typeof init?.body === "string" ? JSON.parse(init.body) : {};
    // こころ : la météo choisie reste affichée pendant la démo.
    if (key === "PUT /api/kokoro/mood") {
      kokoro.moods = [...kokoro.moods.filter((m) => m.date !== sent.date), ...(sent.weather ? [{ date: sent.date, weather: sent.weather, ...(sent.word ? { word: sent.word } : {}) }] : [])];
    }
    if (key === "PUT /api/kokoro/values") kokoro.values = (sent.values as string[]).filter(Boolean);
    const echo = { id: crypto.randomUUID(), done: false, createdAt: "", updatedAt: "", ...plans.find((p) => url.endsWith(p.id)), ...sent };
    const prefix = Object.keys(routes).find((k) => k.endsWith("*") && key.startsWith(k.slice(0, -1)));
    const body = key in routes ? routes[key] : prefix ? routes[prefix] : method === "GET" ? [] : echo;
    await new Promise((r) => setTimeout(r, 150));
    return new Response(JSON.stringify(body), { status: method === "POST" ? 201 : method === "DELETE" ? 200 : 200, headers: { "content-type": "application/json" } });
  };
}
