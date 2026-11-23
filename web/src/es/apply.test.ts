import { describe, expect, it } from "vitest";
import { applyIssue, issueState } from "./apply";

describe("applyIssue", () => {
  it("remplace la citation exacte, une seule fois", () => {
    expect(applyIssue("御社で働きたい。御社が好きです。", "御社", "貴社")).toBe("貴社で働きたい。御社が好きです。");
  });

  it("retrouve le passage malgré un retour à la ligne ou un espace", () => {
    expect(applyIssue("私の強みは\n継続力です。", "私の強みは継続力です。", "私の強みは粘り強さです。")).toBe("私の強みは粘り強さです。");
    expect(applyIssue("私は　リーダーです", "私はリーダーです", "私はまとめ役です")).toBe("私はまとめ役です");
  });

  it("garde les caractères spéciaux tels quels", () => {
    expect(applyIssue("売上が2倍(200%)に", "2倍(200%)", "$&2倍")).toBe("売上が$&2倍に");
  });

  it("renvoie null si le passage n'est plus dans le texte", () => {
    expect(applyIssue("全く別の文章です", "御社", "貴社")).toBeNull();
    expect(applyIssue("本文", "  ", "x")).toBeNull();
  });
});

describe("issueState", () => {
  it("appliquée, à appliquer ou disparue", () => {
    const issue = { quote: "御社", suggestion: "貴社" };
    expect(issueState("貴社で働きたい", issue).state).toBe("applied");
    expect(issueState("御社で働きたい", issue).state).toBe("open");
    expect(issueState("別の文章", issue).state).toBe("gone");
  });

  it("une correction qui allonge le passage compte comme appliquée", () => {
    expect(issueState("得意科目はDBです（具体例）。", { quote: "得意科目はDBです", suggestion: "得意科目はDBです（具体例）" }).state).toBe("applied");
  });

  it("deux propositions sur la même phrase : l'autre devient un choix", () => {
    const a = { quote: "Webデザインです。", suggestion: "Webデザインで貢献できます。" };
    const b = { quote: "Webデザインです。", suggestion: "貴社のサービス向上に貢献します。" };
    const body = applyIssue("得意科目は Webデザインです。", a.quote, a.suggestion)!;
    expect(issueState(body, a, [a, b]).state).toBe("applied");
    const other = issueState(body, b, [a, b]);
    expect(other).toEqual({ state: "alternative", current: a.suggestion });
    const swapped = applyIssue(body, a.suggestion, b.suggestion)!;
    expect(swapped).toBe("得意科目は 貴社のサービス向上に貢献します。");
    expect(issueState(swapped, a, [a, b])).toEqual({ state: "alternative", current: b.suggestion });
  });

  it("une proposition à trous ou identique au passage est un conseil seul", () => {
    const body = "アプリを作りました。";
    expect(issueState(body, { quote: body, suggestion: body }).state).toBe("advice");
    expect(issueState(body, { quote: body, suggestion: "○○機能を持つアプリを作りました。" }).state).toBe("advice");
    expect(issueState(body, { quote: body, suggestion: "アプリを作りました（成果を記入）。" }).state).toBe("advice");
    expect(issueState(body, { quote: body, suggestion: "授業でアプリを作りました。" }).state).toBe("open");
  });
});
