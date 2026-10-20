/**
 * Outils de dessin PDF partagés par le 履歴書 (S11) et le 職務経歴書 (S12) :
 * police japonaise, page A4, texte (centré, ajusté, coupé au caractère), cadres et lignes.
 * Coordonnées en points (1 mm ≈ 2,83 pt), mesurées depuis le HAUT de la page.
 */
import fontkit from "@pdf-lib/fontkit";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";

export const A4 = { width: 595.28, height: 841.89 };
export const BLACK = rgb(0, 0, 0);
export const GREY = rgb(0.35, 0.35, 0.35);

// Le code compilé est dans dist/src/lib, le code source (tests) dans src/lib : on cherche le dossier.
const fontsDir = [join(__dirname, "../../../assets/fonts"), join(__dirname, "../../assets/fonts")].find(existsSync) ?? "";
let fontBytes: Buffer | null = null;

/** Vrai si la police est bien présente (vérifié par /api/health après chaque déploiement). */
export const fontReady = () => existsSync(join(fontsDir, "NotoSerifJP-Regular.ttf"));

/** Nouveau document avec la police japonaise embarquée (seulement les caractères utilisés). */
export async function newDocument(title: string) {
  fontBytes ??= readFileSync(join(fontsDir, "NotoSerifJP-Regular.ttf"));
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  // subset : seuls les caractères utilisés sont embarqués. Police en TrueType (assets/fonts/README.md).
  const font = await doc.embedFont(fontBytes, { subset: true });
  doc.setTitle(title);
  doc.setCreator("Shukatsu Pilot");
  doc.setLanguage("ja");
  return { doc, font, page: () => new Canvas(doc.addPage([A4.width, A4.height]), font) };
}

export type TextStyle = { color?: ReturnType<typeof rgb> };

export class Canvas {
  constructor(private page: PDFPage, private font: PDFFont) {}

  width(text: string, size: number, _style?: TextStyle) {
    return this.font.widthOfTextAtSize(text, size);
  }

  /** Texte dont la ligne de base est à `baseline` depuis le haut. */
  text(text: string, x: number, baseline: number, size: number, style?: TextStyle) {
    if (!text) return;
    this.page.drawText(text, { x, y: A4.height - baseline, size, font: this.font, color: style?.color ?? BLACK });
  }

  centered(text: string, x: number, baseline: number, w: number, size: number, style?: TextStyle) {
    this.text(text, x + (w - this.width(text, size, style)) / 2, baseline, size, style);
  }

  /** Texte centré verticalement dans une bande de hauteur `h`. */
  middle(text: string, x: number, top: number, h: number, size: number, style?: TextStyle) {
    this.text(text, x, top + h / 2 + size * 0.35, size, style);
  }

  /** Comme `middle`, en réduisant la taille si le texte est trop long pour `w`. */
  fit(text: string, x: number, top: number, w: number, h: number, size: number, style?: TextStyle) {
    let s = size;
    while (s > 6 && this.width(text, s, style) > w) s -= 0.5;
    this.middle(text, x, top, h, s, style);
  }

  /** Petit intitulé gris à gauche d'une bande. */
  label(text: string, x: number, top: number, h: number) {
    this.middle(text, x + 4, top, h, 7, { color: GREY });
  }

  /** Lignes d'un texte coupé au caractère (le japonais n'a pas d'espaces), retours à la ligne respectés. */
  lines(text: string, w: number, size: number): string[] {
    const out: string[] = [];
    for (const paragraph of text.split(/\r?\n/)) {
      let line = "";
      for (const ch of paragraph) {
        if (line && this.width(line + ch, size) > w) {
          out.push(line);
          line = ch;
        } else {
          line += ch;
        }
      }
      out.push(line);
    }
    return out;
  }

  /** Texte sur plusieurs lignes ; au plus `maxLines` lignes. */
  wrap(text: string, x: number, top: number, w: number, size: number, maxLines: number, lineHeight = size * 1.5) {
    this.lines(text, w, size).slice(0, maxLines).forEach((l, i) => this.text(l, x, top + size + i * lineHeight, size));
  }

  box(x: number, top: number, w: number, h: number, opts: { dash?: boolean; fill?: boolean } = {}) {
    this.page.drawRectangle({
      x, y: A4.height - top - h, width: w, height: h, borderColor: BLACK, borderWidth: 0.9,
      borderDashArray: opts.dash ? [3, 2] : undefined,
      color: opts.fill ? rgb(0.92, 0.92, 0.92) : undefined,
    });
  }

  hline(x: number, top: number, w: number, opts: { dash?: boolean; thin?: boolean } = {}) {
    this.page.drawLine({
      start: { x, y: A4.height - top }, end: { x: x + w, y: A4.height - top }, color: BLACK,
      thickness: opts.thin ? 0.4 : 0.6, dashArray: opts.dash ? [2, 2] : undefined,
    });
  }

  vline(x: number, top: number, h: number) {
    this.page.drawLine({ start: { x, y: A4.height - top }, end: { x, y: A4.height - top - h }, color: BLACK, thickness: 0.6 });
  }
}
