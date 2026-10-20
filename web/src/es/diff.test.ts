import { describe, expect, it } from "vitest";
import { diff, stats } from "./diff";

describe("diff", () => {
  it("trouve la partie commune et ce qui a changé", () => {
    expect(diff("御社で働きたい", "貴社で働きたいです")).toEqual([
      { type: "del", text: "御" },
      { type: "add", text: "貴" },
      { type: "same", text: "社で働きたい" },
      { type: "add", text: "です" },
    ]);
  });

  it("textes identiques : une seule partie inchangée", () => {
    expect(diff("同じ", "同じ")).toEqual([{ type: "same", text: "同じ" }]);
  });

  it("à partir de rien, ou vers rien", () => {
    expect(diff("", "新しい")).toEqual([{ type: "add", text: "新しい" }]);
    expect(diff("消えた", "")).toEqual([{ type: "del", text: "消えた" }]);
  });

  it("reconstruit exactement l'ancien et le nouveau texte", () => {
    const before = "私の強みはすごく粘り強いところだ。なので、御社でも活かせれると思います。";
    const after = "私の強みは粘り強さです。そのため、貴社でも活かせると考えております。";
    const parts = diff(before, after);
    expect(parts.filter((p) => p.type !== "add").map((p) => p.text).join("")).toBe(before);
    expect(parts.filter((p) => p.type !== "del").map((p) => p.text).join("")).toBe(after);
  });

  it("compare phrase par phrase quand le texte est très long", () => {
    const long = "あ".repeat(2500) + "。";
    const parts = diff(long + "最後の文。", long + "新しい最後の文。");
    expect(parts).toEqual([
      { type: "same", text: long },
      { type: "del", text: "最後の文。" },
      { type: "add", text: "新しい最後の文。" },
    ]);
  });

  it("compte les caractères ajoutés et supprimés", () => {
    expect(stats(diff("御社で働きたい", "貴社で働きたいです"))).toEqual({ added: 3, removed: 1 });
  });
});
