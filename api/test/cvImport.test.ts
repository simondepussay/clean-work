import { HttpRequest, InvocationContext } from "@azure/functions";
import { describe, expect, it } from "vitest";
import { profileImportHandler } from "../src/functions/profileImport";
import { sanitizeCv, type CvResult } from "../src/lib/cvImport";
import type { IdentityVerifier } from "../src/lib/identity";
import type { ChatMessage, StructuredModel } from "../src/lib/review";
import { MemoryStore } from "../src/lib/store";

const result: CvResult = {
  nameKanji: "ドゥピュッセ シモン", nameKana: "Simon", nameLatin: "Simon Depussay", birthDate: "2000-01-01",
  email: "pas-un-email", phone: "090-1234-5678", address: null,
  education: [
    { school: "HAL東京", faculty: "IT学部", start: "2026-04", end: "2028-03", status: "expected" },
    { school: "Université", faculty: null, start: "2019", end: null, status: "graduated" },
  ],
  work: [{ company: "Export SA", role: "Stagiaire", start: "2025-06", end: "2025-09", description: "Export vers le Japon" }],
  certifications: [{ category: "language", name: "JLPT N2", date: "2025-12" }, { category: "it", name: "基本情報技術者試験", date: null }],
  languages: [{ language: "fr", languageOther: null, level: "native" }, { language: "other", languageOther: null, level: "basic" }],
};

describe("import de CV", () => {
  it("garde seulement ce que le formulaire accepterait", () => {
    const p = sanitizeCv(result);
    expect(p).toMatchObject({ nameKanji: "ドゥピュッセ シモン", nameLatin: "Simon Depussay", birthDate: "2000-01-01", phone: "090-1234-5678" });
    expect(p, "ふりがな en kana seulement").not.toHaveProperty("nameKana");
    expect(p, "email invalide écarté").not.toHaveProperty("email");
    expect(p.education.map((e) => e.school)).toEqual(["HAL東京", "Université"]);
    expect(p.education[1].start, "année seule : mois provisoire").toBe("2019-01");
    expect(p.certifications.map((c) => [c.name, c.date]), "certification sans date gardée, date à compléter")
      .toEqual([["JLPT N2", "2025-12"], ["基本情報技術者試験", ""]]);
    expect(p.check).toEqual([{ path: "education.1.start", reason: "month" }, { path: "certifications.1.date", reason: "date" }]);
    expect(p.languages, "« other » sans nom de langue écarté").toEqual([{ language: "fr", level: "native" }]);
  });

  it("un cours en ligne n'apparaît qu'une fois (dans les certifications), et les signalements suivent", () => {
    const p = sanitizeCv({ ...result,
      education: [
        { school: "Coursera", faculty: "Google UX Design", start: "2024", end: "2024", status: "completed" },
        { school: "HAL東京", faculty: null, start: "2026", end: null, status: "enrolled" },
      ],
      certifications: [{ category: "it", name: "Google UX Design 修了", date: "2024" }],
    });
    expect(p.education.map((e) => e.school)).toEqual(["HAL東京"]);
    expect(p.check).toEqual([{ path: "education.0.start", reason: "month" }, { path: "certifications.0.date", reason: "month" }]);
  });

  it("POST /api/profile/import : compte comme une relecture, n'enregistre rien", async () => {
    const calls: ChatMessage[][] = [];
    const model: StructuredModel = { name: "fake", complete: async <T,>(m: ChatMessage[]) => { calls.push(m); return { result: result as T, usage: { inputTokens: 1000, outputTokens: 500 } }; } };
    const store = new MemoryStore();
    const verifier = (): IdentityVerifier => ({ verify: async () => ({ userId: "u1" }) });
    const handler = profileImportHandler({ verifier, store: () => store, model: () => model });
    const ctx = new InvocationContext({ logHandler: () => {} });
    const send = (text: string) => handler(new HttpRequest({ url: "https://x/api/profile/import", method: "POST", headers: { "x-shukatsu-token": "t" }, body: { string: JSON.stringify({ text }) } }), ctx);

    const res = await send("Simon Depussay — HAL Tokyo 2026-2028, stage export 2025, JLPT N2, français natif.");
    expect(res.jsonBody).toMatchObject({ nameLatin: "Simon Depussay", work: [{ company: "Export SA" }] });
    expect(calls[0][1].content).toContain("<cv>");
    expect(await store.list("profiles", "u1"), "rien n'est enregistré").toEqual([]);
    expect((await send("trop court")).status).toBe(400);
  });
});
