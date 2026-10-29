import { describe, expect, it } from "vitest";
import { guessColumns, mapStatus, normaliseDate, parseCsv, sameApplication, toApplications } from "./importCsv";

describe("import CSV (Notion, Huntr, Excel)", () => {
  it("lit guillemets, virgules et retours à la ligne dans un champ, et le BOM d'Excel", () => {
    expect(parseCsv('﻿Company,Notes\r\n"Sony, Inc.","line 1\nline ""2"""\r\n\r\nRakuten,\n')).toEqual([
      ["Company", "Notes"], ["Sony, Inc.", 'line 1\nline "2"'], ["Rakuten", ""],
    ]);
  });

  it("reconnaît les séparateurs point-virgule et tabulation", () => {
    expect(parseCsv("企業名;ステータス\nソニー;内定")).toEqual([["企業名", "ステータス"], ["ソニー", "内定"]]);
    expect(parseCsv("Company\tStatus\nSony\tApplied")).toEqual([["Company", "Status"], ["Sony", "Applied"]]);
  });

  it("devine les colonnes d'un export Huntr et d'un modèle Notion japonais", () => {
    expect(guessColumns(["Company", "Job Title", "List", "URL", "Location", "Notes", "Created"]))
      .toEqual(["company", "position", "status", "url", "location", "notes", "ignore"]);
    expect(guessColumns(["企業名", "職種", "選考状況", "締切", "メモ"])).toEqual(["company", "position", "status", "deadline", "notes"]);
  });

  it("traduit les statuts des autres outils", () => {
    expect(["Wishlist", "Applied", "Interview", "Offer", "Rejected", "エントリー済", "Webテスト", "二次面接", "最終面接", "内々定", "お祈り", "辞退"].map(mapStatus))
      .toEqual(["interested", "applied", "interview1", "offer", "rejected", "applied", "test", "interview2", "final", "offer", "rejected", "withdrawn"]);
  });

  it("comprend les dates japonaises et anglaises", () => {
    expect(normaliseDate("2026年12月5日")).toBe("2026-12-05");
    expect(normaliseDate("2026/12/15")).toBe("2026-12-15");
    expect(normaliseDate("December 15, 2026")).toBe("2026-12-15");
    expect(normaliseDate("bientôt")).toBeUndefined();
  });

  it("crée les candidatures (sans entreprise : ligne ignorée ; lien non http : ignoré)", () => {
    const rows = parseCsv("企業名,職種,選考状況,締切,URL,勤務地\nメルカリ,エンジニア,ES提出済み,2026/12/15,https://example.jp/1,東京都\n,空行,,,,\nLINEヤフー,,,,javascript:x,");
    const apps = toApplications(rows.slice(1), guessColumns(rows[0]));
    expect(apps).toHaveLength(2);
    expect(apps[0]).toMatchObject({ company: "メルカリ", position: "エンジニア", status: "applied", url: "https://example.jp/1", notes: "勤務地：東京都",
      steps: [{ type: "es", dueDate: "2026-12-15", done: false }] });
    expect(apps[1]).toEqual({ company: "LINEヤフー", status: "interested", steps: [] });
  });

  it("repère les doublons malgré les espaces et la casse", () => {
    expect(sameApplication({ company: "Sony Group", position: "Engineer" }, { company: "sony group ", position: "engineer" })).toBe(true);
    expect(sameApplication({ company: "Sony" }, { company: "Sony", position: "PM" })).toBe(false);
  });
});
