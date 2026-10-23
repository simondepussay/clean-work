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
  { id: "a2", company: "ソニーグループ", position: "エンジニア", industry: "maker", companyType: "large",
    status: "interview1", steps: [{ id: "s2", type: "interview1", dueDate: inDays(6), done: false }], nextDeadline: inDays(6), createdAt: "", updatedAt: "" },
  { id: "a3", company: "楽天グループ", status: "interested", steps: [], nextDeadline: null, createdAt: "", updatedAt: "" },
  { id: "a4", company: "LINEヤフー", status: "test", steps: [{ id: "s4", type: "test", dueDate: inDays(12), done: false }], nextDeadline: inDays(12), createdAt: "", updatedAt: "" },
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

const routes: Record<string, unknown> = {
  "GET /api/plans": plans,
  "GET /api/health": { status: "ok", version: "demo", database: "ok", resume: "ok", push: "ok" },
  "GET /api/me": { userId: "demo", email: "simon@example.com", name: "Simon", hasProfile: true },
  "GET /api/profile": profile,
  "GET /api/applications": applications,
  "GET /api/drafts": drafts,
  "GET /api/usage": { today: 9, month: 28 },
  "GET /api/interviews": [{ id: "i0", company: "ソニーグループ", applicationId: "a2", stage: "interview1", status: "finished", score: 68, questions: 6, createdAt: today.toISOString() }],
  "GET /api/interview-usage": { today: 3, month: 19 },
  "POST /api/interviews": interview,
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
    const echo = { id: crypto.randomUUID(), done: false, createdAt: "", updatedAt: "", ...plans.find((p) => url.endsWith(p.id)), ...sent };
    const body = key in routes ? routes[key] : method === "GET" ? [] : echo;
    await new Promise((r) => setTimeout(r, 150));
    return new Response(JSON.stringify(body), { status: method === "POST" ? 201 : method === "DELETE" ? 200 : 200, headers: { "content-type": "application/json" } });
  };
}
