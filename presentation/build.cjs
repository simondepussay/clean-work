/**
 * Génère la présentation du projet en français et en anglais (mêmes diapositives, textes de
 * content.cjs) :  npm install && node build.cjs
 *
 * Palette : indigo (藍色) dominant, vermillon (朱色) en accent ; motif : le cercle vermillon
 * d'un sceau (判子), repris pour les icônes.
 */
const path = require("node:path");
const pptxgen = require("pptxgenjs");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const sharp = require("sharp");
const md = require("react-icons/md");
const { applyTheme } = require(process.env.PPTX_SKILL
  ? path.join(process.env.PPTX_SKILL, "scripts/apply_theme.js")
  : "./apply_theme.js");
const CONTENT = require("./content.cjs");

const THEME = {
  name: "Shukatsu Pilot",
  headFontFace: "Cambria",
  bodyFontFace: "Calibri",
  colors: {
    dk1: "1B2A41", // 藍 indigo
    lt1: "FFFFFF",
    dk2: "4A5568",
    lt2: "F2F4F7",
    accent1: "D2452B", // 朱 vermillon
    accent2: "2F4F7F", // indigo clair
    accent3: "2E8B57", // disponible
    accent4: "C98A12", // en cours
    accent5: "8A94A6", // plus tard
    accent6: "A9C1E3",
    hlink: "2F4F7F",
    folHlink: "6B5B95",
  },
};
const HEX = THEME.colors;

const ICONS = {
  doc: md.MdDescription, edit: md.MdEditNote, calendar: md.MdEventNote, pdf: md.MdPictureAsPdf,
  review: md.MdRateReview, kanban: md.MdViewKanban, mic: md.MdMic, shield: md.MdVerifiedUser,
  lock: md.MdLock, ai: md.MdSmartToy, trash: md.MdDeleteSweep, timer: md.MdTimer, bug: md.MdBugReport,
  rule: md.MdRule, people: md.MdGroups, phone: md.MdPhoneIphone, web: md.MdLanguage, key: md.MdKey,
  cloud: md.MdCloud, db: md.MdStorage, flag: md.MdFlag,
};

const iconCache = new Map();
async function icon(name) {
  if (!iconCache.has(name)) {
    const svg = renderToStaticMarkup(React.createElement(ICONS[name], { color: "#FFFFFF", size: 256 }));
    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    iconCache.set(name, "image/png;base64," + png.toString("base64"));
  }
  return iconCache.get(name);
}

const W = 10;
const H = 5.625;
const M = 0.5;

async function build(lang) {
  const t = CONTENT[lang];
  const pres = new pptxgen();
  pres.layout = "LAYOUT_16x9";
  pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
  pres.title = `${t.title.name} — ${t.title.tagline}`;
  pres.author = "Simon Depussay";
  pres.lang = lang === "fr" ? "fr-FR" : "en-US";
  const C = pres.SchemeColor;

  // ------------------------------------------------------------------ dispositions
  pres.defineSlideMaster({
    title: "DARK",
    background: { color: HEX.dk1 },
    objects: [
      { placeholder: { options: { name: "title", type: "title", x: M, y: 1.55, w: 5.6, h: 1.0, fontSize: 40, bold: true, color: C.background1, fontFace: THEME.headFontFace, align: "left", valign: "middle", margin: 0 }, text: "" } },
    ],
  });
  pres.defineSlideMaster({
    title: "CONTENT",
    background: { color: HEX.lt1 },
    margin: [0.5, 0.5, 0.6, 0.5],
    objects: [
      { placeholder: { options: { name: "title", type: "title", x: M, y: 0.3, w: W - 2 * M, h: 0.85, fontSize: 26, bold: true, color: C.text1, fontFace: THEME.headFontFace, align: "left", valign: "middle", margin: 0 }, text: "" } },
      { text: { text: t.footer, options: { x: M, y: H - 0.42, w: 5, h: 0.3, fontSize: 9, color: C.accent5, margin: 0 } } },
    ],
    slideNumber: { x: W - M - 0.5, y: H - 0.42, w: 0.5, h: 0.3, fontSize: 9, color: HEX.accent5, align: "right" },
  });

  const content = (section, title, notes) => {
    const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: section });
    s.addText(title, { placeholder: "title" });
    s.addNotes(notes);
    return s;
  };

  /** Cercle de couleur (le « sceau ») avec une icône blanche au centre. */
  const seal = async (s, name, x, y, d, color = C.accent1) => {
    s.addShape(pres.shapes.OVAL, { x, y, w: d, h: d, fill: { color }, line: { color, width: 0 }, objectName: `cercle ${name}` });
    const k = d * 0.56;
    s.addImage({ data: await icon(name), x: x + (d - k) / 2, y: y + (d - k) / 2, w: k, h: k, objectName: `icône ${name}` });
  };

  const text = (s, value, opts) => s.addText(value, { isTextBox: true, margin: 0, fontFace: THEME.bodyFontFace, color: C.text1, ...opts });
  const card = (s, x, y, w, h, name) =>
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.08, fill: { color: C.background2 }, line: { color: C.background2, width: 0 }, objectName: name });

  // ------------------------------------------------------------------ 1. titre
  pres.addSection({ title: lang === "fr" ? "Le projet" : "The project" });
  {
    const s = pres.addSlide({ masterName: "DARK", sectionTitle: lang === "fr" ? "Le projet" : "The project" });
    s.addNotes(t.title.notes);
    s.addText(t.title.jp, { placeholder: "title" });
    text(s, t.title.name, { x: M, y: 2.55, w: 5.6, h: 0.5, fontSize: 24, color: C.accent6, fontFace: THEME.headFontFace });
    text(s, t.title.tagline, { x: M, y: 3.15, w: 5.4, h: 0.8, fontSize: 16, color: C.background1 });
    text(s, t.title.meta, { x: M, y: H - 0.9, w: 6, h: 0.35, fontSize: 12, color: C.accent5 });
    s.addShape(pres.shapes.OVAL, { x: 6.55, y: 1.2, w: 3.0, h: 3.0, fill: { color: C.accent1 }, line: { color: C.accent1, width: 0 }, objectName: "sceau" });
    text(s, "就活", { x: 6.55, y: 1.2, w: 3.0, h: 3.0, fontSize: 66, bold: true, color: C.background1, align: "center", valign: "middle", fontFace: THEME.headFontFace });
  }

  // ------------------------------------------------------------------ 2. problème
  {
    const s = content(lang === "fr" ? "Le projet" : "The project", t.problem.title, t.problem.notes);
    const w = 2.85;
    for (const [i, c] of t.problem.cards.entries()) {
      const x = M + i * (w + 0.225);
      card(s, x, 1.4, w, 3.55, `carte ${c.tag}`);
      await seal(s, c.icon, x + 0.25, 1.65, 0.6);
      text(s, c.tag, { x: x + 1.0, y: 1.7, w: w - 1.15, h: 0.5, fontSize: 22, bold: true, color: C.accent1, fontFace: THEME.headFontFace });
      text(s, c.head, { x: x + 0.25, y: 2.4, w: w - 0.5, h: 0.6, fontSize: 15, bold: true, valign: "top" });
      text(s, c.body, { x: x + 0.25, y: 3.1, w: w - 0.5, h: 1.7, fontSize: 13, color: C.text2, valign: "top" });
    }
  }

  // ------------------------------------------------------------------ 3. solution
  {
    const s = content(lang === "fr" ? "Le projet" : "The project", t.solution.title, t.solution.notes);
    const colors = { done: C.accent3, doing: C.accent4, later: C.accent5 };
    const w = 4.4;
    const h = 1.7;
    for (const [i, tile] of t.solution.tiles.entries()) {
      const x = M + (i % 2) * (w + 0.2);
      const y = 1.4 + Math.floor(i / 2) * (h + 0.2);
      card(s, x, y, w, h, `fonction ${i + 1}`);
      await seal(s, tile.icon, x + 0.25, y + 0.3, 0.6, i < 2 ? C.accent1 : C.accent2);
      const label = t.solution.status[tile.status];
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: x + w - 1.35, y: y + 0.18, w: 1.15, h: 0.3, rectRadius: 0.15, fill: { color: colors[tile.status] }, line: { color: colors[tile.status], width: 0 }, objectName: `statut ${i + 1}` });
      text(s, label, { x: x + w - 1.35, y: y + 0.18, w: 1.15, h: 0.3, fontSize: 10, bold: true, color: C.background1, align: "center", valign: "middle" });
      text(s, tile.head, { x: x + 1.05, y: y + 0.55, w: w - 1.25, h: 0.4, fontSize: 15, bold: true });
      text(s, tile.body, { x: x + 1.05, y: y + 0.95, w: w - 1.25, h: 0.65, fontSize: 12, color: C.text2, valign: "top" });
    }
  }

  // ------------------------------------------------------------------ 4. relecture IA
  pres.addSection({ title: lang === "fr" ? "Comment c'est construit" : "How it's built" });
  const built = lang === "fr" ? "Comment c'est construit" : "How it's built";
  {
    const s = content(built, t.ai.title, t.ai.notes);
    const n = t.ai.steps.length;
    const gap = 0.25;
    const w = (W - 2 * M - gap * (n - 1)) / n;
    for (const [i, step] of t.ai.steps.entries()) {
      const x = M + i * (w + gap);
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 1.45, w, h: 1.15, rectRadius: 0.08, fill: { color: i === 2 ? C.accent1 : C.background2 }, line: { color: i === 2 ? C.accent1 : C.background2, width: 0 }, objectName: `étape ${i + 1}` });
      text(s, step, { x: x + 0.1, y: 1.45, w: w - 0.2, h: 1.15, fontSize: 12, bold: true, align: "center", valign: "middle", color: i === 2 ? C.background1 : C.text1 });
      if (i < n - 1) text(s, "›", { x: x + w, y: 1.45, w: gap, h: 1.15, fontSize: 22, bold: true, align: "center", valign: "middle", color: C.accent1 });
    }
    const sw = (W - 2 * M) / t.ai.stats.length;
    for (const [i, st] of t.ai.stats.entries()) {
      const x = M + i * sw;
      text(s, st.value, { x, y: 3.1, w: sw - 0.2, h: 0.75, fontSize: 32, bold: true, color: C.accent1, fontFace: THEME.headFontFace });
      text(s, st.label, { x, y: 3.85, w: sw - 0.2, h: 0.6, fontSize: 13, color: C.text2, valign: "top" });
    }
  }

  // ------------------------------------------------------------------ 5. architecture
  {
    const a = t.architecture;
    const s = content(built, a.title, a.notes);
    const box = async (x, y, w, h, name, head, sub, fill = C.background2, dark = false) => {
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.08, fill: { color: fill }, line: { color: fill, width: 0 }, objectName: head });
      await seal(s, name, x + 0.15, y + (h - 0.45) / 2, 0.45, dark ? C.accent1 : C.accent2);
      const runs = [{ text: head, options: { bold: true, fontSize: 13, color: dark ? C.background1 : C.text1, breakLine: Boolean(sub) } }];
      if (sub) runs.push({ text: sub, options: { fontSize: 11, color: dark ? C.accent6 : C.text2 } });
      text(s, runs, { x: x + 0.7, y: y + 0.05, w: w - 0.8, h: h - 0.1, valign: "middle", paraSpaceAfter: 2 });
    };
    const line = (x1, y1, x2, y2) => s.addShape(pres.shapes.LINE, { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1) || 0.001, h: Math.abs(y2 - y1) || 0.001, flipV: y2 < y1, line: { color: C.accent5, width: 1.25, endArrowType: "triangle" } });
    // clients → API, clients → annuaire ; API → données
    line(2.75, 2.35, 3.6, 2.95);
    line(2.75, 3.45, 3.6, 3.1);
    line(2.75, 2.15, 3.6, 1.75);
    line(6.15, 3.05, 6.7, 1.75);
    line(6.15, 3.05, 6.7, 2.95);
    line(6.15, 3.05, 6.7, 4.15);
    await box(M, 1.9, 2.25, 0.8, "phone", a.clients[0]);
    await box(M, 3.05, 2.25, 0.8, "web", a.clients[1]);
    await box(3.6, 1.3, 2.55, 0.9, "key", a.auth, a.authSub);
    await box(3.6, 2.6, 2.55, 0.9, "cloud", a.api, a.apiSub, C.text1, true);
    for (const [i, d] of a.data.entries()) await box(6.7, 1.3 + i * 1.15, 2.8, 0.9, ["db", "ai", "pdf"][i], d.head, d.sub);
    text(s, a.footer, { x: M, y: 4.55, w: W - 2 * M, h: 0.4, fontSize: 12, color: C.text2, italic: true });
  }

  // ------------------------------------------------------------------ 6. méthode
  {
    const m = t.method;
    const s = content(built, m.title, m.notes);
    for (const [i, st] of m.stats.entries()) {
      const y = 1.4 + i * 1.15;
      text(s, st.value, { x: M, y, w: 1.4, h: 0.75, fontSize: 40, bold: true, color: C.accent1, fontFace: THEME.headFontFace, valign: "middle" });
      text(s, st.label, { x: M + 1.45, y, w: 1.6, h: 0.75, fontSize: 14, color: C.text2, valign: "middle" });
    }
    const px = 3.95;
    text(s, m.pathLabel, { x: px, y: 1.45, w: W - M - px, h: 0.4, fontSize: 14, bold: true });
    const d = 0.55;
    const step = (W - M - px - d) / (m.path.length - 1);
    s.addShape(pres.shapes.LINE, { x: px + d / 2, y: 2.3, w: step * (m.path.length - 1), h: 0, line: { color: C.accent1, width: 2.5 } });
    for (const [i, letter] of m.path.entries()) {
      const x = px + i * step;
      s.addShape(pres.shapes.OVAL, { x, y: 2.3 - d / 2, w: d, h: d, fill: { color: C.accent1 }, line: { color: C.background1, width: 2 }, objectName: `tâche ${letter}` });
      text(s, letter, { x, y: 2.3 - d / 2, w: d, h: d, fontSize: 16, bold: true, color: C.background1, align: "center", valign: "middle" });
    }
    text(s, m.bullets.map((b, i) => ({ text: b, options: { bullet: true, breakLine: i < m.bullets.length - 1, paraSpaceAfter: 10 } })),
      { x: px, y: 3.05, w: W - M - px, h: 1.7, fontSize: 14, color: C.text1, valign: "top" });
  }

  // ------------------------------------------------------------------ 7. journées
  {
    const tl = t.timeline;
    const s = content(built, tl.title, tl.notes);
    const n = tl.days.length;
    const slot = (W - 2 * M) / n;
    const y = 2.45;
    s.addShape(pres.shapes.LINE, { x: M + slot / 2, y, w: slot * (n - 1), h: 0, line: { color: C.accent6, width: 3 } });
    for (const [i, day] of tl.days.entries()) {
      const cx = M + slot * i + slot / 2;
      s.addShape(pres.shapes.OVAL, { x: cx - 0.35, y: y - 0.35, w: 0.7, h: 0.7, fill: { color: C.accent1 }, line: { color: C.background1, width: 2 }, objectName: `jour ${i + 1}` });
      text(s, String(i + 1), { x: cx - 0.35, y: y - 0.35, w: 0.7, h: 0.7, fontSize: 18, bold: true, color: C.background1, align: "center", valign: "middle" });
      text(s, `${tl.dayLabel} ${i + 1}`, { x: cx - slot / 2 + 0.05, y: 1.65, w: slot - 0.1, h: 0.3, fontSize: 11, color: C.accent5, align: "center" });
      text(s, day.head, { x: cx - slot / 2 + 0.05, y: 3.0, w: slot - 0.1, h: 0.4, fontSize: 15, bold: true, align: "center" });
      text(s, day.body, { x: cx - slot / 2 + 0.08, y: 3.45, w: slot - 0.16, h: 1.2, fontSize: 12, color: C.text2, align: "center", valign: "top" });
    }
  }

  // ------------------------------------------------------------------ 8. qualité
  {
    const q = t.quality;
    const s = content(built, q.title, q.notes);
    const f = CONTENT.FACTS.tests;
    s.addChart(pres.charts.BAR, [{ name: q.chartTitle, labels: q.categories, values: [f.api, f.web, f.ios] }], {
      x: M, y: 1.3, w: 4.6, h: 3.6, barDir: "col",
      showTitle: true, title: q.chartTitle, titleFontSize: 14, titleColor: HEX.dk1, titleFontFace: "+mj-lt",
      showValue: true, dataLabelPosition: "outEnd", dataLabelFontSize: 13, dataLabelColor: HEX.dk1, dataLabelFontFace: "+mn-lt",
      chartColors: [HEX.accent2], showLegend: false,
      catAxisLabelColor: HEX.dk2, catAxisLabelFontSize: 13, catAxisLabelFontFace: "+mn-lt",
      valAxisHidden: true, valGridLine: { style: "none" }, catGridLine: { style: "none" },
      objectName: "graphique des tests",
    });
    const total = f.api + f.web + f.ios;
    text(s, String(total), { x: 5.45, y: 1.35, w: 4.0, h: 1.0, fontSize: 60, bold: true, color: C.accent1, fontFace: THEME.headFontFace });
    text(s, q.total, { x: 5.45, y: 2.3, w: 4.0, h: 0.4, fontSize: 15, color: C.text2 });
    text(s, q.bullets.map((b, i) => ({ text: b, options: { bullet: true, breakLine: i < q.bullets.length - 1, paraSpaceAfter: 10 } })),
      { x: 5.45, y: 2.9, w: 4.05, h: 2.0, fontSize: 14, valign: "top" });
  }

  // ------------------------------------------------------------------ 9. sécurité
  {
    const sec = t.security;
    const s = content(built, sec.title, sec.notes);
    const w = 4.4;
    for (const [i, r] of sec.rows.entries()) {
      const x = M + (i % 2) * (w + 0.2);
      const y = 1.45 + Math.floor(i / 2) * 1.7;
      await seal(s, r.icon, x, y, 0.65, C.accent2);
      text(s, r.head, { x: x + 0.85, y: y - 0.02, w: w - 0.9, h: 0.4, fontSize: 15, bold: true });
      text(s, r.body, { x: x + 0.85, y: y + 0.4, w: w - 0.9, h: 0.95, fontSize: 13, color: C.text2, valign: "top" });
    }
  }

  // ------------------------------------------------------------------ 10. leçons
  pres.addSection({ title: lang === "fr" ? "Bilan et suite" : "Review and next steps" });
  const wrap = lang === "fr" ? "Bilan et suite" : "Review and next steps";
  {
    const l = t.lessons;
    const s = content(wrap, l.title, l.notes);
    const w = (W - 2 * M - 0.6) / 4;
    for (const [i, c] of l.cards.entries()) {
      const x = M + i * (w + 0.2);
      card(s, x, 1.4, w, 3.5, `leçon ${i + 1}`);
      await seal(s, c.icon, x + 0.2, 1.6, 0.6);
      text(s, c.head, { x: x + 0.2, y: 2.4, w: w - 0.4, h: 0.95, fontSize: 14, bold: true, valign: "top" });
      text(s, c.body, { x: x + 0.2, y: 3.35, w: w - 0.4, h: 1.45, fontSize: 12, color: C.text2, valign: "top" });
    }
  }

  // ------------------------------------------------------------------ 11. suite
  {
    const nx = t.next;
    const s = content(wrap, nx.title, nx.notes);
    const n = nx.steps.length;
    const gap = 0.15;
    const w = (W - 2 * M - gap * (n - 1)) / n;
    for (const [i, st] of nx.steps.entries()) {
      const x = M + i * (w + gap);
      s.addShape(pres.shapes.CHEVRON, { x, y: 1.45, w, h: 0.75, fill: { color: i === 0 ? C.accent1 : C.accent2 }, line: { color: C.background1, width: 0 }, objectName: `tâche ${st.tag}` });
      text(s, st.tag, { x, y: 1.45, w, h: 0.75, fontSize: 18, bold: true, color: C.background1, align: "center", valign: "middle" });
      text(s, st.head, { x, y: 2.4, w, h: 0.65, fontSize: 14, bold: true, align: "center", valign: "top" });
      text(s, st.body, { x, y: 3.05, w, h: 0.6, fontSize: 12, color: C.text2, align: "center", valign: "top" });
    }
    card(s, M, 3.95, W - 2 * M, 0.85, "objectif");
    await seal(s, "flag", M + 0.2, 4.07, 0.6);
    text(s, nx.goal, { x: M + 1.0, y: 3.95, w: W - 2 * M - 1.2, h: 0.85, fontSize: 14, bold: true, valign: "middle" });
  }

  // ------------------------------------------------------------------ 12. merci
  {
    const s = pres.addSlide({ masterName: "DARK", sectionTitle: wrap });
    s.addNotes(t.thanks.notes);
    s.addText(t.thanks.title, { placeholder: "title" });
    text(s, t.thanks.jp, { x: M, y: 2.55, w: 5.8, h: 0.5, fontSize: 22, color: C.accent6, fontFace: THEME.headFontFace });
    text(s, t.thanks.contact, { x: M, y: H - 0.9, w: 6, h: 0.35, fontSize: 13, color: C.background1 });
    s.addShape(pres.shapes.OVAL, { x: 6.55, y: 1.2, w: 3.0, h: 3.0, fill: { color: C.accent1 }, line: { color: C.accent1, width: 0 }, objectName: "sceau" });
    text(s, "内定", { x: 6.55, y: 1.2, w: 3.0, h: 3.0, fontSize: 66, bold: true, color: C.background1, align: "center", valign: "middle", fontFace: THEME.headFontFace });
  }

  const out = path.join(__dirname, t.file);
  await pres.writeFile({ fileName: out });
  await applyTheme(out, THEME);
  return out;
}

(async () => {
  for (const lang of ["fr", "en"]) console.log("✅", await build(lang));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
