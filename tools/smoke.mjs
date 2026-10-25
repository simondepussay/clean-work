#!/usr/bin/env node
// Test de fumée (S21) : vérifie le VRAI site en ligne, sans compte ni donnée.
//
// Les tests de la CI tournent sur des copies en mémoire ; celui-ci vérifie ce que les
// utilisateurs reçoivent vraiment : les pages s'ouvrent, la base et les services répondent,
// et chaque route protégée refuse un visiteur sans jeton (401), même après un déploiement.
//
// Lancé après chaque déploiement (deploy.yml) et toutes les heures (monitor.yml).
//
//   node tools/smoke.mjs https://cleanwork.simondepussay.com [version-attendue]

const site = (process.argv[2] ?? "").replace(/\/$/, "");
const expectedVersion = process.argv[3];
if (!site.startsWith("https://")) {
  console.error("Usage : node tools/smoke.mjs https://… [version]");
  process.exit(2);
}

const failures = [];
const check = async (name, fn) => {
  try {
    await fn();
    console.log(`✅ ${name}`);
  } catch (e) {
    failures.push(name);
    console.log(`❌ ${name} — ${e.message}`);
  }
};
const expect = (cond, message) => {
  if (!cond) throw new Error(message);
};
const get = (path, init) => fetch(site + path, { redirect: "manual", signal: AbortSignal.timeout(30_000), ...init });

// ------------------------------------------------------------------ pages

for (const [path, marker] of [["/", '<div id="root">'], ["/privacy.html", "プライバシー"], ["/terms.html", "利用規約"]]) {
  await check(`page ${path}`, async () => {
    const res = await get(path);
    expect(res.status === 200, `HTTP ${res.status}`);
    expect((await res.text()).includes(marker), `« ${marker} » introuvable`);
    expect(res.headers.get("x-content-type-options") === "nosniff", "en-tête X-Content-Type-Options absent");
  });
}

await check("guide des ES (es-guide.json)", async () => {
  const res = await get("/es-guide.json");
  expect(res.status === 200, `HTTP ${res.status}`);
  const guide = await res.json();
  expect(Object.keys(guide).length > 0, "guide vide");
});

// ------------------------------------------------------------------ santé

await check("santé de l'API (base, police du PDF, push)", async () => {
  const res = await get("/api/health");
  const body = await res.json();
  expect(res.status === 200, `HTTP ${res.status} ${JSON.stringify(body)}`);
  for (const part of ["database", "resume", "push"]) expect(body[part] === "ok", `${part} = ${body[part]}`);
  if (expectedVersion) expect(body.version === expectedVersion, `version ${body.version}, attendue ${expectedVersion}`);
});

// ------------------------------------------------------------------ sécurité

const protectedRoutes = [
  ["GET", "/api/me"], ["DELETE", "/api/me"],
  ["GET", "/api/profile"], ["PUT", "/api/profile"],
  ["GET", "/api/applications"], ["POST", "/api/applications"],
  ["GET", "/api/drafts"], ["POST", "/api/drafts"],
  ["POST", "/api/drafts/x/review"], ["GET", "/api/drafts/x/reviews"], ["GET", "/api/usage"],
  ["POST", "/api/resume"], ["POST", "/api/work-history"],
  ["POST", "/api/devices"], ["POST", "/api/push/run"],
  ["GET", "/api/interviews"], ["POST", "/api/interviews"], ["POST", "/api/interviews/x/answers"],
  ["POST", "/api/interviews/x/finish"], ["GET", "/api/interview-usage"],
  ["GET", "/api/plans"], ["POST", "/api/plans"], ["GET", "/api/calendar-link"], ["GET", "/api/news"], ["GET", "/api/info"], ["POST", "/api/info/run"], ["POST", "/api/report/run"], ["POST", "/api/profile/import"],
];
await check(`${protectedRoutes.length} routes protégées refusent un visiteur sans jeton`, async () => {
  const open = [];
  await Promise.all(protectedRoutes.map(async ([method, path]) => {
    const res = await get(path, { method, headers: { "content-type": "application/json" }, body: method === "GET" || method === "DELETE" ? undefined : "{}" });
    if (res.status !== 401) open.push(`${method} ${path} → ${res.status}`);
  }));
  expect(open.length === 0, open.join(", "));
});

await check("un faux lien de calendrier ne montre rien", async () => {
  const res = await get("/api/calendar/ZmFrZQ.AAAAAAAAAAAAAAAAAAAAAAAA.ics");
  expect(res.status === 404, `HTTP ${res.status}`);
});

await check("un faux jeton est refusé aussi", async () => {
  const res = await get("/api/me", { headers: { "x-shukatsu-token": "eyJhbGciOiJub25lIn0.eyJvaWQiOiJ4In0." } });
  expect(res.status === 401, `HTTP ${res.status}`);
});

console.log(failures.length ? `\n${failures.length} vérification(s) en échec` : "\nTout est en ordre.");
process.exit(failures.length ? 1 : 0);
