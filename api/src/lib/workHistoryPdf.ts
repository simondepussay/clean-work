/**
 * Dessin du 職務経歴書 (S12), format chronologique (編年体) : document libre, A4, une ou
 * plusieurs pages selon la longueur. Ordre : 職務要約, 職務経歴, 資格, 語学,
 * 活かせる経験・知識・スキル, 自己PR, 以上.
 */
import type { Profile } from "./models";
import { A4, GREY, newDocument, type Canvas } from "./pdfCanvas";
import { certificationRows, yearLabel, type Era } from "./resume";
import { jobs } from "./workHistory";

export type WorkHistoryOptions = {
  era: Era;
  date: string;
  /** 職務要約 : deux ou trois phrases qui résument l'expérience. */
  summary?: string;
  /** 活かせる経験・知識・スキル */
  skills?: string;
  /** 自己PR (souvent repris d'une ES) */
  selfPr?: string;
};

const M = 50;
const W = A4.width - 2 * M;
const TOP = 50;
const BOTTOM = A4.height - 50;
const SIZE = 10;
const LINE = 16;

/** Descend dans la page et en ouvre une nouvelle quand la place manque. */
class Flow {
  y = TOP;
  constructor(public c: Canvas, private next: () => Canvas) {}

  /** Garantit `h` points libres, sinon page suivante. */
  need(h: number) {
    if (this.y + h > BOTTOM) {
      this.c = this.next();
      this.y = TOP;
    }
  }

  heading(text: string) {
    this.need(LINE * 3);
    this.y += 10;
    this.c.text(`■${text}`, M, this.y + 12, 12);
    this.y += 18;
    this.c.hline(M, this.y, W);
    this.y += 6;
  }

  /** Paragraphe coupé au caractère ; peut continuer sur la page suivante, ligne par ligne. */
  paragraph(text: string, indent = 0) {
    for (const line of this.c.lines(text, W - indent, SIZE)) {
      this.need(LINE);
      this.c.text(line, M + indent, this.y + SIZE + 2, SIZE);
      this.y += LINE;
    }
  }
}

export async function renderWorkHistory(profile: Profile, options: WorkHistoryOptions): Promise<Uint8Array> {
  const { doc, page } = await newDocument(`職務経歴書 ${profile.nameKanji}`);
  const canvases: Canvas[] = [];
  const newPage = () => {
    const canvas = page();
    canvases.push(canvas);
    return canvas;
  };
  const flow = new Flow(newPage(), newPage);
  const c = () => flow.c;

  // En-tête : titre, date, nom
  c().centered("職 務 経 歴 書", M, TOP + 18, W, 18);
  const [y, m, d] = [options.date, Number(options.date.slice(5, 7)), Number(options.date.slice(8, 10))];
  const dateText = `${yearLabel(y, options.era)}年${m}月${d}日現在`;
  c().text(dateText, M + W - c().width(dateText, SIZE), TOP + 44, SIZE);
  const nameText = `氏名　${profile.nameKanji}`;
  c().text(nameText, M + W - c().width(nameText, SIZE), TOP + 60, SIZE);
  flow.y = TOP + 70;

  if (options.summary?.trim()) {
    flow.heading("職務要約");
    flow.paragraph(options.summary.trim());
  }

  flow.heading("職務経歴");
  for (const job of jobs(profile, options.era)) {
    // L'en-tête d'un emploi ne reste jamais seul en bas de page.
    flow.need(LINE * 4);
    c().box(M, flow.y + 2, W, 22, { fill: true });
    c().text(job.period, M + 8, flow.y + 17, SIZE);
    c().text(job.company, M + 170, flow.y + 17, SIZE);
    flow.y += 30;
    if (job.role) flow.paragraph(`職種：${job.role}`, 8);
    if (job.description?.trim()) {
      flow.y += 2;
      flow.paragraph(job.description.trim(), 8);
    }
    flow.y += 10;
  }

  const rows = certificationRows(profile, options.era);
  const certs = rows.filter((r) => r.year);
  const languages = rows.filter((r) => !r.year && r.text !== "特になし");
  if (certs.length > 0) {
    flow.heading("資格");
    for (const r of certs) flow.paragraph(`${r.year}年${r.month}月　${r.text}`, 8);
  }
  if (languages.length > 0) {
    flow.heading("語学");
    for (const r of languages) flow.paragraph(r.text, 8);
  }
  if (options.skills?.trim()) {
    flow.heading("活かせる経験・知識・スキル");
    flow.paragraph(options.skills.trim());
  }
  if (options.selfPr?.trim()) {
    flow.heading("自己PR");
    flow.paragraph(options.selfPr.trim());
  }

  flow.need(LINE * 2);
  flow.y += 12;
  c().text("以上", M + W - c().width("以上", SIZE), flow.y + SIZE, SIZE);

  // Numéros de page « 1 / 2 » quand il y en a plusieurs
  if (canvases.length > 1) {
    canvases.forEach((canvas, i) => canvas.centered(`${i + 1} / ${canvases.length}`, 0, A4.height - 26, A4.width, 8, { color: GREY }));
  }
  return doc.save();
}
