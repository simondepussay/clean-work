import { afterEach, describe, expect, it, vi } from "vitest";
// La même fonction que l'extension « Clean Work に追加 » et le bookmarklet.
import { extractJob, jobLink } from "../../../extension/extract.js";
import { decodeJob, encodeJob } from "./savedJob";

/** Une page d'offre simulée. */
function page(html: string, title = "") {
  const doc = document.implementation.createHTMLDocument(title);
  doc.documentElement.innerHTML = `<head><title>${title}</title></head><body>${html}</body>`;
  return doc;
}
// Comme les vrais sites : « </ » est échappé dans le JSON, sinon il fermerait la balise <script>.
const ld = (data: unknown) => `<script type="application/ld+json">${JSON.stringify(data).replace(/<\//g, "<\\/")}</script>`;

afterEach(() => vi.restoreAllMocks());

describe("extractJob (extension Clean Work に追加)", () => {
  it("lit les données JobPosting : entreprise, poste, lieu, date limite, description en texte", () => {
    const doc = page(ld({
      "@context": "https://schema.org", "@type": "JobPosting", title: "バックエンドエンジニア（新卒）",
      hiringOrganization: { "@type": "Organization", name: "株式会社メルカリ" },
      jobLocation: { "@type": "Place", address: { addressRegion: "東京都", addressLocality: "港区" } },
      validThrough: "2026-12-15T23:59:00+09:00",
      description: "<p>Go と <b>Kubernetes</b> で開発します。</p>",
    }));
    expect(extractJob(doc, "https://www.daijob.com/jobs/123")).toEqual({
      source: "Daijob", url: "https://www.daijob.com/jobs/123", company: "株式会社メルカリ", position: "バックエンドエンジニア（新卒）",
      location: "東京都 港区", deadline: "2026-12-15", notes: "Go と Kubernetes で開発します。",
    });
  });

  it("trouve un JobPosting dans un @graph, et préfère l'adresse canonique", () => {
    const doc = page(`<link rel="canonical" href="https://www.careercross.com/ja/job/view-1">${ld({ "@graph": [{ "@type": "WebPage" }, { "@type": "JobPosting", title: "PM", hiringOrganization: "Rakuten" }] })}`);
    expect(extractJob(doc, "https://www.careercross.com/ja/job/view-1?utm_source=x")).toMatchObject({
      source: "CareerCross", url: "https://www.careercross.com/ja/job/view-1", company: "Rakuten", position: "PM",
    });
  });

  it("LinkedIn : poste et entreprise depuis la page, sans données structurées", () => {
    const doc = page(`<h1 class="job-details-jobs-unified-top-card__job-title">Software Engineer</h1>
      <div class="job-details-jobs-unified-top-card__company-name"><a>Sony Group</a></div>`, "Software Engineer | Sony Group | LinkedIn");
    expect(extractJob(doc, "https://www.linkedin.com/jobs/view/42")).toMatchObject({ source: "LinkedIn", position: "Software Engineer", company: "Sony Group" });
  });

  it("リクナビ : l'entreprise depuis le titre de la page", () => {
    const doc = page("<h1>会社概要</h1>", "株式会社サイバーエージェントの新卒採用・会社概要 | リクナビ2027");
    expect(extractJob(doc, "https://job.rikunabi.com/2027/company/r123/")).toMatchObject({ source: "リクナビ", company: "株式会社サイバーエージェント" });
  });

  it("le texte sélectionné devient le résumé de l'offre", () => {
    const doc = page(ld({ "@type": "JobPosting", title: "A", hiringOrganization: "B", description: "long…" }));
    vi.spyOn(doc, "getSelection").mockReturnValue({ toString: () => "応募資格：2027年3月卒業見込みの方。日本語ビジネスレベル。" } as Selection);
    expect(extractJob(doc, "https://example.com/").notes).toBe("応募資格：2027年3月卒業見込みの方。日本語ビジネスレベル。");
  });

  it("une description piégée n'exécute rien", () => {
    const hit = vi.fn();
    (window as unknown as { hit: () => void }).hit = hit;
    const doc = page(ld({ "@type": "JobPosting", title: "A", hiringOrganization: "B", description: '<img src=x onerror="window.hit()"><script>window.hit()</script>本文' }));
    expect(extractJob(doc, "https://example.com/").notes).toBe("本文");
    expect(hit).not.toHaveBeenCalled();
  });

  it("le lien de l'extension se relit à l'identique dans Clean Work (japonais compris)", () => {
    const job = { company: "株式会社メルカリ", position: "エンジニア", url: "https://jobs.example/1", deadline: "2026-12-15", source: "Daijob" };
    const link = jobLink(job, "https://cleanwork.simondepussay.com/");
    expect(link.startsWith("https://cleanwork.simondepussay.com/#add=")).toBe(true);
    expect(decodeJob(link.slice(link.indexOf("#")))).toEqual(job);
    expect(encodeJob(job)).toBe(link.slice(link.indexOf("#")));
  });

  it("Clean Work refuse un lien qui n'est pas http(s) et une date invalide", () => {
    expect(decodeJob(encodeJob({ company: "A", url: "javascript:alert(1)", deadline: "demain" }))).toEqual({ company: "A" });
    expect(decodeJob("#add=%%%")).toBeNull();
    expect(decodeJob(encodeJob({ notes: "rien d'autre" }))).toBeNull();
  });
});
