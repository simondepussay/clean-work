import { describe, expect, it } from "vitest";
import guide from "../../public/es-guide.json";
import { firstSentence, keywordsIn, runChecks, starterText } from "./checks";
import type { Guide } from "./guide";

const g = guide as Guide;
const ids = (kind: string, body: string, state?: string) =>
  runChecks(g, kind, body).filter((r) => !state || r.state === state).map((r) => r.id);

describe("checklist du 自己PR", () => {
  it("signale les erreurs du cours", () => {
    const bad = ids("jikopr", "私は高知県出身の田中と申します。僕は色々なことを学んだと思います。", "bad");
    expect(bad).toEqual(expect.arrayContaining(["introduction", "boku", "vague", "omoimasu"]));
  });

  it("un 短所 dans un 自己PR est à vérifier, pas une erreur", () => {
    expect(ids("jikopr", "私の強みは行動力です。以前は短所だった慎重さを克服しました。", "warn")).toContain("weakness");
  });

  it("une première phrase longue est signalée avec sa longueur", () => {
    const body = "私の強みは、どんなに難しい状況でも最後まであきらめずに周りの人と協力しながら目標に向かって進み続けられる粘り強さです。";
    const r = runChecks(g, "jikopr", body).find((x) => x.id === "firstSentence");
    expect(r?.text.ja).toContain(`${firstSentence(body).length}字`);
  });

  it("seulement 中学・高校 : signalé ; avec une expérience récente : non", () => {
    expect(ids("jikopr", "私の強みは協調性です。高校の部活で学びました。")).toContain("schoolOnly");
    expect(ids("jikopr", "私の強みは協調性です。高校とアルバイトで学びました。")).not.toContain("schoolOnly");
  });

  it("plus de 2 mots-clés de qualités", () => {
    const body = "私の強みは協調性と計画性と行動力です。";
    expect(keywordsIn(body, g.keywords!)).toEqual(["協調性", "行動力", "計画性"]);
    expect(ids("jikopr", body, "warn")).toContain("keywords");
  });

  it("bonnes pratiques trouvées, ou conseillées si absentes", () => {
    expect(ids("jikopr", "【粘り強さで目標を達成】\n私の強みは2つあります。1年でN1に合格しました。", "good")).toEqual(expect.arrayContaining(["title", "twoPoints", "number"]));
    expect(ids("jikopr", "私の強みは粘り強さです。", "tip")).toEqual(expect.arrayContaining(["title", "number"]));
  });

  it("les erreurs passent avant les conseils et les bonnes pratiques", () => {
    const states = runChecks(g, "jikopr", "【強み】僕の強みは2つあります。").map((r) => r.state);
    expect(states).toEqual([...states].sort((a, b) => ["bad", "warn", "tip", "good"].indexOf(a) - ["bad", "warn", "tip", "good"].indexOf(b)));
  });
});

describe("checklist des autres ES", () => {
  it("長所と短所 : un 短所 sans effort d'amélioration", () => {
    expect(ids("strengths", "私の短所は心配性なところです。")).toContain("strengthsImprove");
    expect(ids("strengths", "私の短所は心配性なところです。改善するため、期限を決めています。")).not.toContain("strengthsImprove");
  });

  it("une ES libre ne reçoit que les règles générales", () => {
    expect(ids("free", "僕は趣味は旅行です。")).toEqual(["boku"]);
  });

  it("texte vide : rien", () => {
    expect(runChecks(g, "jikopr", "  ")).toEqual([]);
  });

  it("les exemples du guide n'ont aucune erreur", () => {
    for (const t of g.types) expect(ids(t.id, t.example, "bad")).toEqual([]);
  });
});

describe("début 3部構成", () => {
  const starter = g.types.find((t) => t.id === "jikopr")!.starter!;
  it("un mot-clé, deux mots-clés, aucun", () => {
    expect(starterText(starter, ["協調性"])).toContain("私の強みは協調性です。");
    expect(starterText(starter, ["協調性", "計画性"])).toContain("1つめは協調性、2つめは計画性です。");
    expect(starterText(starter, [])).toContain("私の強みは〇〇です。");
  });
});

describe("le squelette seul ne compte pas comme bonne pratique", () => {
  it("【〇〇】 n'est pas un vrai titre, 1つめ/2つめ ne sont pas des chiffres", () => {
    const starter = g.types.find((t) => t.id === "jikopr")!.starter!;
    const good = ids("jikopr", starterText(starter, ["協調性", "計画性"]), "good");
    expect(good).not.toContain("title");
    expect(good).not.toContain("number");
    expect(good).toContain("twoPoints");
    expect(ids("jikopr", "【粘り強さ】私の強みは粘り強さです。3か月で合格しました。", "good")).toEqual(expect.arrayContaining(["title", "number"]));
  });
});
