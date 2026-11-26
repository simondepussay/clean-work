import { describe, expect, it } from "vitest";
import type { Profile } from "../src/lib/models";
import { renderResumeChecked } from "../src/lib/resumePdf";

const base = { nameKanji: "山田 太郎", nameKana: "やまだ たろう", birthDate: "2000-05-01", postalCode: "2710051", address: "千葉県松戸市" } as Profile;
const many = (edu: number, work: number, cert: number): Profile => ({
  ...base,
  education: Array.from({ length: edu }, (_, i) => ({ school: `学校${i}`, start: "2010-04", end: "2011-03", status: "graduated" as const })),
  work: Array.from({ length: work }, (_, i) => ({ company: `会社${i}`, start: "2021-06", end: "2022-01" })),
  certifications: Array.from({ length: cert }, (_, i) => ({ category: "other", name: `資格${i}`, date: "2024-12" })),
  languages: [],
} as unknown as Profile);
const options = { era: "western" as const, date: "2026-11-26" };

describe("履歴書 : rubriques qui ne rentrent pas", () => {
  it("un profil courant tient sans rien couper", async () => {
    expect((await renderResumeChecked(many(5, 2, 6), { ...options, template: "student", appeal: "志望動機" })).cut).toEqual([]);
  });

  it("trop de lignes : 学歴・職歴, 資格 et cases poussées hors de la page sont signalés", async () => {
    const { cut } = await renderResumeChecked(many(20, 20, 20), { ...options, template: "student", appeal: "志望動機" });
    expect(cut).toEqual(expect.arrayContaining(["history", "certifications", "appeal"]));
  });

  it("un texte trop long pour sa case est signalé", async () => {
    const { cut } = await renderResumeChecked(many(2, 1, 2), { ...options, template: "standard", appeal: "志望動機の文です。".repeat(300) });
    expect(cut).toEqual(["appeal"]);
  });
});
