/**
 * Régression du 21/10 : dans un PDF avec PEU de caractères, la police découpée utilise des
 * offsets « courts » (divisés par 2). Des glyphes de longueur impaire décalaient alors tous les
 * suivants : « simon » devenait « im ». Le gros PDF d'exemple, lui, s'affichait bien.
 */
import fontkit from "@pdf-lib/fontkit";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { decodePDFRawStream, PDFDict, PDFDocument, PDFName, PDFRawStream } from "pdf-lib";
import { describe, expect, it } from "vitest";
import type { Profile } from "../src/lib/models";
import { renderResume } from "../src/lib/resumePdf";

const fontBytes = readFileSync(join(__dirname, "../assets/fonts/NotoSerifJP-Regular.ttf"));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fullFont = fontkit.create(fontBytes) as any;

const small: Profile = {
  id: "u", userId: "u", updatedAt: "", nameKanji: "simon", nameKana: "でぷ",
  education: [{ school: "hal tokyo", start: "2026-03", end: "2026-07", status: "enrolled" }],
  work: [], certifications: [],
  languages: [{ language: "fr", level: "native" }, { language: "en", level: "business" }, { language: "ja", level: "conversational" }],
};

/** Police embarquée et table CID → caractère (ToUnicode) d'un PDF généré. */
async function embedded(pdf: Uint8Array) {
  const doc = await PDFDocument.load(pdf);
  let font: Uint8Array | null = null;
  const toUnicode = new Map<number, string>();
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (obj instanceof PDFDict && obj.get(PDFName.of("Type")) === PDFName.of("FontDescriptor")) {
      font = decodePDFRawStream(doc.context.lookup(obj.get(PDFName.of("FontFile2"))) as PDFRawStream).decode();
    }
    if (obj instanceof PDFDict && obj.get(PDFName.of("ToUnicode"))) {
      const cmap = Buffer.from(decodePDFRawStream(doc.context.lookup(obj.get(PDFName.of("ToUnicode"))) as PDFRawStream).decode()).toString("latin1");
      for (const [, cid, hex] of cmap.matchAll(/<([0-9a-fA-F]{4})>\s*<([0-9a-fA-F]+)>/g)) {
        toUnicode.set(parseInt(cid, 16), Buffer.from(hex, "hex").swap16().toString("utf16le"));
      }
    }
  }
  return { font: fontkit.create(Buffer.from(font!)) as any, toUnicode }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

describe("police du 履歴書", () => {
  it("chaque glyphe a une longueur paire (sinon les offsets courts se décalent)", () => {
    const offsets: number[] = fullFont.loca.offsets;
    expect(offsets.filter((o) => o % 2 !== 0)).toEqual([]);
  });

  it("dans un PDF avec peu de caractères, chaque caractère a le bon dessin", async () => {
    const pdf = await renderResume(small, { era: "western", date: "2026-10-21" });
    const { font, toUnicode } = await embedded(pdf);
    expect(toUnicode.size).toBeGreaterThan(40);
    const wrong: string[] = [];
    for (const [cid, char] of toUnicode) {
      const original = fullFont.glyphForCodePoint(char.codePointAt(0));
      const inPdf = font.getGlyph(cid);
      if (inPdf.path.commands.length !== original.path.commands.length) wrong.push(char);
    }
    expect(wrong).toEqual([]);
  });

  it("deux PDF de suite (serveur « chaud ») sont tous les deux corrects", async () => {
    await renderResume({ ...small, languages: [] }, { era: "japanese", date: "2026-10-21" });
    const { font, toUnicode } = await embedded(await renderResume(small, { era: "western", date: "2026-10-21" }));
    for (const [cid, char] of toUnicode) {
      expect(font.getGlyph(cid).path.commands.length, char).toBe(fullFont.glyphForCodePoint(char.codePointAt(0)).path.commands.length);
    }
  });
});
