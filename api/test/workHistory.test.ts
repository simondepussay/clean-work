import { HttpRequest, InvocationContext } from "@azure/functions";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { workHistoryHandler } from "../src/functions/workHistory";
import type { IdentityVerifier } from "../src/lib/identity";
import type { Profile } from "../src/lib/models";
import { Repository } from "../src/lib/repository";
import { MemoryStore } from "../src/lib/store";
import { jobs, periodLabel } from "../src/lib/workHistory";
import { renderWorkHistory } from "../src/lib/workHistoryPdf";

const profile = (p: Partial<Profile> = {}): Profile => ({
  id: "u", userId: "u", updatedAt: "", nameKanji: "デプセ シモン", nameKana: "でぷせ しもん",
  education: [], certifications: [], languages: [],
  work: [
    { company: "株式会社サンプル", role: "インターン（フランス向け輸出）", start: "2023-04", end: "2023-09", description: "フランスの取引先とのメール対応、輸出書類の作成。" },
    { company: "日仏アシスタント", role: "事務アシスタント", start: "2022-01", end: "2022-12" },
  ],
  ...p,
});

describe("contenu", () => {
  it("période, avec « 現在 » pour un emploi en cours, en 西暦 ou 和暦", () => {
    expect(periodLabel("2023-04", "2023-09", "western")).toBe("2023年4月～2023年9月");
    expect(periodLabel("2024-04", undefined, "japanese")).toBe("令和6年4月～現在");
  });

  it("emplois dans l'ordre chronologique (編年体)", () => {
    expect(jobs(profile(), "western").map((j) => j.company)).toEqual(["日仏アシスタント", "株式会社サンプル"]);
  });
});

describe("PDF", () => {
  it("une page pour un profil court, avec 以上", async () => {
    const pdf = await renderWorkHistory(profile(), { era: "western", date: "2026-10-21", summary: "日仏間の事務と輸出業務を経験しました。" });
    expect((await PDFDocument.load(pdf)).getPageCount()).toBe(1);
  });

  it("passe à la page suivante quand le texte est long", async () => {
    const long = "フランス語と日本語で取引先とやり取りしました。".repeat(60);
    const pdf = await renderWorkHistory(profile(), { era: "western", date: "2026-10-21", selfPr: long });
    expect((await PDFDocument.load(pdf)).getPageCount()).toBeGreaterThan(1);
  });
});

describe("POST /api/work-history", () => {
  const as = (userId: string): IdentityVerifier => ({ verify: async (t) => (t === "ok" ? { userId } : null) });
  const ctx = new InvocationContext({ logHandler: () => {} });

  async function call(work: Profile["work"]) {
    const store = new MemoryStore();
    await new Repository(store).saveProfile("u1", { nameKanji: "シモン", nameKana: "しもん", work });
    const req = new HttpRequest({ url: "https://x", method: "POST", headers: { "x-shukatsu-token": "ok" }, body: { string: "{}" } });
    return workHistoryHandler({ verifier: () => as("u1"), store: () => store })(req, ctx);
  }

  it("renvoie un PDF au nom japonais", async () => {
    const res = await call([{ company: "A社", start: "2023-04" }]);
    expect(Buffer.from((res.body as Uint8Array).slice(0, 5)).toString()).toBe("%PDF-");
    expect((res.headers as Record<string, string>)["Content-Disposition"]).toContain(encodeURIComponent("職務経歴書_シモン.pdf"));
  });

  it("400 sans expérience : ce document n'a pas de sens", async () => {
    expect((await call([])).jsonBody).toEqual({ error: "no_work" });
  });
});
