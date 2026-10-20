import { describe, expect, it } from "vitest";
import type { Profile } from "../src/lib/models";
import { age, certificationRows, historyRows, monthYearLabel, yearLabel } from "../src/lib/resume";

const profile = (p: Partial<Profile> = {}): Profile => ({
  id: "u", userId: "u", updatedAt: "", nameKanji: "デプセ シモン", nameKana: "でぷせ しもん",
  education: [], work: [], certifications: [], languages: [], ...p,
});

describe("dates", () => {
  it("西暦", () => expect(yearLabel("2026-10-21", "western")).toBe("2026"));

  it("和暦, avec 元年 et les changements d'ère", () => {
    expect(yearLabel("2026-10-21", "japanese")).toBe("令和8");
    expect(yearLabel("2019-05-01", "japanese")).toBe("令和元");
    expect(yearLabel("2019-04-30", "japanese")).toBe("平成31");
    expect(yearLabel("1989-01-08", "japanese")).toBe("平成元");
    expect(yearLabel("1989-01-07", "japanese")).toBe("昭和64");
  });

  it("pour un mois, l'ère du 1er du mois", () => {
    expect(monthYearLabel("2019-04", "japanese")).toBe("平成31");
    expect(monthYearLabel("2019-05", "japanese")).toBe("令和元");
  });

  it("âge révolu, anniversaire passé ou non", () => {
    expect(age("2000-04-01", "2026-10-21")).toBe(26);
    expect(age("2000-12-01", "2026-10-21")).toBe(25);
    expect(age("2000-10-21", "2026-10-21")).toBe(26);
  });
});

describe("学歴・職歴", () => {
  it("chronologique, entrée puis sortie, « 以上 » à la fin", () => {
    const rows = historyRows(profile({
      education: [
        { school: "HAL東京", faculty: "情報処理学科", start: "2026-04", status: "enrolled" },
        { school: "ジュネーブ大学", faculty: "国際関係学部", start: "2018-09", end: "2022-06", status: "graduated" },
      ],
    }), "western");
    expect(rows.map((r) => [r.year, r.month, r.text])).toEqual([
      ["", "", "学　歴"],
      ["2018", "9", "ジュネーブ大学　国際関係学部　入学"],
      ["2022", "6", "ジュネーブ大学　国際関係学部　卒業"],
      ["2026", "4", "HAL東京　情報処理学科　入学"],
      ["", "", "　　現在に至る（在学中）"],
      ["", "", "職　歴"],
      ["", "", "なし"],
      ["", "", "以上"],
    ]);
    expect(rows.at(-1)?.align).toBe("right");
  });

  it("expérience en cours : « 現在に至る » ; en 和暦", () => {
    const rows = historyRows(profile({ work: [{ company: "株式会社テスト", role: "アルバイト", start: "2023-04" }] }), "japanese");
    expect(rows.slice(-3).map((r) => [r.year, r.month, r.text])).toEqual([
      ["令和5", "4", "株式会社テスト　アルバイト　入社"],
      ["", "", "　　現在に至る"],
      ["", "", "以上"],
    ]);
  });
});

describe("学歴 : ordre des événements", () => {
  it("un échange s'insère entre l'entrée et la sortie de l'école principale", () => {
    const rows = historyRows(profile({
      education: [
        { school: "ジュネーブ大学", start: "2018-09", end: "2022-06", status: "graduated" },
        { school: "慶應義塾大学", faculty: "交換留学", start: "2020-09", end: "2021-06", status: "left" },
      ],
    }), "western");
    expect(rows.slice(1, 5).map((r) => `${r.year}/${r.month} ${r.text}`)).toEqual([
      "2018/9 ジュネーブ大学　入学",
      "2020/9 慶應義塾大学　交換留学　入学",
      "2021/6 慶應義塾大学　交換留学　中退",
      "2022/6 ジュネーブ大学　卒業",
    ]);
  });

  it("le même mois, la sortie d'une école passe avant l'entrée dans la suivante", () => {
    const rows = historyRows(profile({
      education: [
        { school: "B専門学校", start: "2022-03", status: "enrolled" },
        { school: "A高校", start: "2019-04", end: "2022-03", status: "graduated" },
      ],
    }), "western");
    expect(rows.slice(1, 4).map((r) => r.text)).toEqual(["A高校　入学", "A高校　卒業", "B専門学校　入学"]);
  });
});

describe("免許・資格", () => {
  it("par date, « 合格 » pour les langues, puis les langues parlées", () => {
    const rows = certificationRows(profile({
      certifications: [
        { category: "it", name: "Microsoft Azure Fundamentals (AZ-900)", date: "2025-03" },
        { category: "language", name: "日本語能力試験 N2", date: "2024-12" },
      ],
      languages: [{ language: "fr", level: "native" }, { language: "other", languageOther: "タガログ語", level: "basic" }],
    }), "western");
    expect(rows.map((r) => r.text)).toEqual([
      "日本語能力試験 N2　合格",
      "Microsoft Azure Fundamentals (AZ-900)　取得",
      "フランス語（ネイティブ）",
      "タガログ語（基礎レベル）",
    ]);
  });

  it("« 取得 » pour un score (TOEIC), « 合格 » pour un examen réussi", () => {
    const rows = certificationRows(profile({
      certifications: [
        { category: "language", name: "TOEIC Listening & Reading 925点", date: "2023-06" },
        { category: "language", name: "実用英語技能検定 2級", date: "2023-07" },
      ],
    }), "western");
    expect(rows.map((r) => r.text)).toEqual(["TOEIC Listening & Reading 925点　取得", "実用英語技能検定 2級　合格"]);
  });

  it("« 修了 » pour un 日本語学校 ou un échange", () => {
    const rows = historyRows(profile({ education: [{ school: "東京日本語学校", start: "2023-04", end: "2024-03", status: "completed" }] }), "western");
    expect(rows[2].text).toBe("東京日本語学校　修了");
  });

  it("« 特になし » s'il n'y a rien", () => {
    expect(certificationRows(profile(), "western")).toEqual([{ year: "", month: "", text: "特になし" }]);
  });
});
