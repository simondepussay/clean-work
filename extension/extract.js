/**
 * Lit l'offre d'emploi de la page ouverte, dans le navigateur de l'utilisateur et à sa demande
 * (extension « Clean Work に追加 », ou bookmarklet). Rien n'est envoyé ailleurs : le résultat
 * part dans l'adresse de Clean Work, après « # », et l'utilisateur vérifie avant d'enregistrer.
 *
 * Ordre de lecture :
 *  1. les données structurées JobPosting (schema.org), publiées par beaucoup de sites d'offres ;
 *  2. quelques sites connus (LinkedIn, リクナビ, マイナビ…) ;
 *  3. le titre de la page ;
 *  et le texte sélectionné par l'utilisateur, s'il y en a, comme résumé de l'offre.
 *
 * La fonction est autonome (aucune variable extérieure) : l'extension l'injecte telle quelle
 * dans la page (chrome.scripting.executeScript), et le bookmarklet la recopie.
 */
export function extractJob(doc = document, href = location.href) {
  const clean = (s) => String(s || "").replace(/\s+/g, " ").trim();
  // DOMParser n'exécute ni script ni gestionnaire d'événement : sans danger pour du HTML de la page.
  // On retire aussi <script> et <style>, dont le texte n'a rien à faire dans le résumé.
  const toText = (html) => {
    const body = new DOMParser().parseFromString(String(html || ""), "text/html").body;
    body.querySelectorAll("script, style, noscript").forEach((el) => el.remove());
    return clean(body.textContent);
  };
  const meta = (name) => clean(doc.querySelector(`meta[property="${name}"], meta[name="${name}"]`)?.getAttribute("content"));
  const first = (...selectors) => {
    for (const s of selectors) {
      const t = clean(doc.querySelector(s)?.textContent);
      if (t) return t;
    }
    return "";
  };
  const host = (() => { try { return new URL(href).hostname.replace(/^www\./, ""); } catch { return ""; } })();
  const SITES = [
    ["linkedin.com", "LinkedIn"], ["rikunabi.com", "リクナビ"], ["mynavi.jp", "マイナビ"], ["daijob.com", "Daijob"],
    ["careercross.com", "CareerCross"], ["indeed.com", "Indeed"], ["doda.jp", "doda"], ["en-japan.com", "エン転職"],
    ["onecareer.jp", "ONE CAREER"], ["gaijinpot.com", "GaijinPot"], ["tokyodev.com", "TokyoDev"], ["japan-dev.com", "Japan Dev"],
    ["hellowork.mhlw.go.jp", "ハローワーク"], ["wantedly.com", "Wantedly"],
  ];
  const source = (SITES.find(([d]) => host === d || host.endsWith(`.${d}`)) || [null, host])[1];

  const job = { source };
  const canonical = doc.querySelector('link[rel="canonical"]')?.getAttribute("href");
  job.url = /^https?:\/\//.test(canonical || "") ? canonical : href;

  // 1. JobPosting (schema.org), directement, dans un tableau ou dans un @graph.
  const postings = [];
  const visit = (node) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach(visit);
    const type = node["@type"];
    if (type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"))) postings.push(node);
    if (node["@graph"]) visit(node["@graph"]);
  };
  for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
    try { visit(JSON.parse(script.textContent)); } catch { /* bloc JSON mal formé : on passe */ }
  }
  const p = postings[0];
  if (p) {
    const org = p.hiringOrganization;
    job.company = clean(typeof org === "string" ? org : org?.name);
    job.position = clean(p.title);
    const place = [].concat(p.jobLocation || [])[0];
    const address = place?.address;
    job.location = typeof address === "string" ? clean(address)
      : clean([address?.addressRegion, address?.addressLocality].filter(Boolean).join(" "));
    if (!job.location && p.jobLocationType === "TELECOMMUTE") job.location = "リモート / Remote";
    const until = clean(p.validThrough).slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(until)) job.deadline = until;
    if (p.description) job.notes = toText(p.description);
  }

  // 2. Sites connus, quand les données structurées manquent.
  if (source === "LinkedIn") {
    job.position ||= first(".job-details-jobs-unified-top-card__job-title", ".top-card-layout__title", "h1");
    job.company ||= first(".job-details-jobs-unified-top-card__company-name", ".topcard__org-name-link", ".top-card-layout__second-subline a");
  }

  // 3. Le titre de la page : « 株式会社XXの新卒採用・会社概要 | リクナビ2027 », « Poste - Entreprise | Site »…
  const title = clean(meta("og:title") || doc.title);
  if (!job.company) {
    const m = title.match(/^(.+?)(?:の新卒採用|の採用情報|の会社概要|の企業情報|\s+の求人)/);
    if (m) job.company = clean(m[1]);
  }
  if (!job.position && !job.company) job.position = clean(title.split(/\s[|｜]\s|\s-\s/)[0]) || first("h1");

  // Le texte sélectionné passe avant la description : c'est ce que l'utilisateur a choisi de garder.
  const selected = clean(doc.getSelection ? doc.getSelection()?.toString() : "");
  if (selected.length > 20) job.notes = selected;
  if (job.notes) job.notes = job.notes.slice(0, 4000);

  for (const key of Object.keys(job)) if (!job[key]) delete job[key];
  return job;
}

/**
 * L'adresse de Clean Work qui ouvre le formulaire rempli (« #add= » + base64url du JSON en UTF-8).
 * Autonome elle aussi (copiée dans le bookmarklet). Même format que web/src/apps/savedJob.ts.
 */
export function jobLink(job, base = "https://cleanwork.simondepussay.com/") {
  const bytes = new TextEncoder().encode(JSON.stringify(job));
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return `${base}#add=${btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
}
