/**
 * Dessin du 履歴書 en PDF (S11), sur le modèle du 厚生労働省 (A4, 2 pages).
 * Le contenu vient de resume.ts ; ici on ne fait que placer cadres et texte.
 */
import type { Profile } from "./models";
import { A4, Canvas, GREY, newDocument } from "./pdfCanvas";
import { age, certificationRows, historyRows, yearLabel, type Era, type Row } from "./resume";

const M = 42; // marge
const W = A4.width - 2 * M;

export type ResumeOptions = {
  era: Era;
  /** Date du document (AAAA-MM-JJ), « …現在 ». */
  date: string;
  /** 志望の動機・特技・好きな学科・アピールポイントなど */
  appeal?: string;
  /** 本人希望記入欄 */
  wishes?: string;
};



export async function renderResume(profile: Profile, options: ResumeOptions): Promise<Uint8Array> {
  const { doc, page } = await newDocument(`履歴書 ${profile.nameKanji}`);
  const history = historyRows(profile, options.era);
  const page1 = page();
  const firstRows = drawPage1(page1, profile, options, history);
  const page2 = page();
  drawPage2(page2, profile, options, history.slice(firstRows));
  return doc.save();
}

// ------------------------------------------------------------------ page 1

function drawPage1(c: Canvas, p: Profile, o: ResumeOptions, history: Row[]): number {
  c.text("履　歴　書", M, 52, 22);
  const [y, m, d] = [o.date.slice(0, 10), Number(o.date.slice(5, 7)), Number(o.date.slice(8, 10))];
  c.text(`${yearLabel(y, o.era)}年　${m}月　${d}日現在`, M + 150, 50, 10);

  // Cadre photo (30 × 40 mm)
  const photo = { x: A4.width - M - 85, top: 34, w: 85, h: 113 };
  c.box(photo.x, photo.top, photo.w, photo.h, { dash: true });
  ["写真をはる位置", "", "縦 36〜40mm", "横 24〜30mm", "本人単身胸から上"].forEach((t, i) =>
    c.centered(t, photo.x, photo.top + 30 + i * 13, photo.w, 7, { color: GREY }));

  // Nom, naissance, genre (facultatif)
  const left = { x: M, w: photo.x - M - 10 };
  let top = 70;
  c.box(left.x, top, left.w, 88);
  c.label("ふりがな", left.x, top, 18);
  c.fit(p.nameKana, left.x + 50, top, left.w - 56, 18, 9);
  c.hline(left.x, top + 18, left.w, { dash: true });
  c.label("氏　　名", left.x, top + 18, 44);
  c.fit(p.nameKanji, left.x + 50, top + 18, left.w - 56, 44, 22);
  c.hline(left.x, top + 62, left.w);
  const genderX = left.x + left.w - 80;
  c.vline(genderX, top + 62, 26);
  if (p.birthDate) {
    const [by, bm, bd] = [p.birthDate, Number(p.birthDate.slice(5, 7)), Number(p.birthDate.slice(8, 10))];
    c.middle(`${yearLabel(by, o.era)}年　${bm}月　${bd}日生　（満 ${age(p.birthDate, o.date)} 歳）`, left.x + 8, top + 62, 26, 10);
  } else {
    c.middle("　　　年　　月　　日生　（満　　歳）", left.x + 8, top + 62, 26, 10);
  }
  c.text("※性別", genderX + 4, top + 72, 7, { color: GREY });

  // Adresse, téléphone, e-mail ; puis contact (vide, à remplir seulement si différent)
  top = 168;
  for (const [i, title] of ["現住所", "連絡先"].entries()) {
    const block = top + i * 62;
    const leftW = W - 150;
    c.box(M, block, W, 62);
    c.vline(M + leftW, block, 62);
    c.label("ふりがな", M, block, 16);
    c.hline(M, block + 16, leftW, { dash: true });
    if (i === 0) {
      c.text(`${title}　〒`, M + 4, block + 28, 8);
      c.wrap(p.address ?? "", M + 8, block + 30, leftW - 14, 10, 2);
      c.label("電話", M + leftW, block, 14);
      c.fit(p.phone ?? "", M + leftW + 6, block + 12, 138, 18, 9);
      c.hline(M + leftW, block + 31, 150);
      c.label("E-mail", M + leftW, block + 31, 14);
      c.fit(p.email ?? "", M + leftW + 6, block + 43, 138, 18, 8);
    } else {
      c.text(`${title}　〒`, M + 4, block + 28, 8);
      c.text("（現住所以外に連絡を希望する場合のみ記入）", M + 60, block + 28, 7, { color: GREY });
      c.label("電話", M + leftW, block, 14);
      c.hline(M + leftW, block + 31, 150);
      c.label("E-mail", M + leftW, block + 31, 14);
    }
  }

  // 学歴・職歴
  const tableTop = 300;
  const rows = Math.floor((A4.height - 40 - tableTop - 20) / 24);
  drawTable(c, tableTop, rows, "学歴・職歴（各別にまとめて書く）", history.slice(0, rows));
  return Math.min(rows, history.length);
}

// ------------------------------------------------------------------ page 2

function drawPage2(c: Canvas, p: Profile, o: ResumeOptions, historyRest: Row[]) {
  let top = 40;
  if (historyRest.length > 0) {
    const rows = Math.max(historyRest.length, 3);
    drawTable(c, top, rows, "学歴・職歴（続き）", historyRest);
    top += 20 + rows * 24 + 16;
  }
  const certs = certificationRows(p, o.era);
  const certRows = Math.max(certs.length, 6);
  drawTable(c, top, certRows, "免許・資格", certs);
  top += 20 + certRows * 24 + 16;

  const free = A4.height - 60 - top;
  const appealH = Math.max(150, Math.round(free * 0.62));
  c.box(M, top, W, appealH);
  c.text("志望の動機、特技、好きな学科、アピールポイントなど", M + 6, top + 14, 8);
  c.wrap(o.appeal ?? "", M + 8, top + 24, W - 16, 10, Math.floor((appealH - 28) / 16), 16);
  top += appealH + 12;

  const wishesH = Math.max(80, A4.height - 60 - top);
  c.box(M, top, W, wishesH);
  c.text("本人希望記入欄（特に給料・職種・勤務時間・勤務地・その他についての希望などがあれば記入）", M + 6, top + 14, 8);
  c.wrap(o.wishes ?? "貴社の規定に従います。", M + 8, top + 24, W - 16, 10, Math.floor((wishesH - 28) / 16), 16);

  c.text("※「性別」欄：記載は任意です。未記載とすることも可能です。", M, A4.height - 36, 7, { color: GREY });
}

/** Tableau année / mois / texte, avec une ligne d'en-tête et `rows` lignes. */
function drawTable(c: Canvas, top: number, rows: number, title: string, data: Row[]) {
  const yearW = 58;
  const monthW = 32;
  const h = 20 + rows * 24;
  c.box(M, top, W, h);
  c.vline(M + yearW, top, h);
  c.vline(M + yearW + monthW, top, h);
  c.centered("年", M, top + 14, yearW, 9);
  c.centered("月", M + yearW, top + 14, monthW, 9);
  c.centered(title, M + yearW + monthW, top + 14, W - yearW - monthW, 9);
  for (let i = 0; i < rows; i++) {
    const rowTop = top + 20 + i * 24;
    c.hline(M, rowTop, W, { thin: true });
    const row = data[i];
    if (!row) continue;
    c.centered(row.year, M, rowTop + 16, yearW, 10);
    c.centered(row.month, M + yearW, rowTop + 16, monthW, 10);
    const textX = M + yearW + monthW;
    const textW = W - yearW - monthW;
    if (row.align === "center") c.centered(row.text, textX, rowTop + 16, textW, 10);
    else if (row.align === "right") c.text(row.text, textX + textW - 12 - c.width(row.text, 10), rowTop + 16, 10);
    else c.fit(row.text, textX + 8, rowTop, textW - 14, 24, 10);
  }
}
