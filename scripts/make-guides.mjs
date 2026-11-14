// Builds the downloadable Word guides (CrowsNest-User-Guide.docx and
// CrowsNest-Admin-Guide.docx) straight from the in-app guide content in
// frontend/src/data/ — the same text GuideModal shows — so the two can't
// drift apart again. Run after editing either guide:
//
//   npm run guides
//
// Writes into frontend/public/ (what the app's Download button serves).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, Header, Footer,
  AlignmentType, HeadingLevel, BorderStyle, WidthType, ShadingType, VerticalAlign,
  PageNumber, LevelFormat, PageBreak,
} = require('docx');

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = (file) => import(pathToFileURL(path.join(ROOT, 'frontend', 'src', 'data', file)).href);
const { USER_GUIDE } = await data('userGuideContent.js');
const { ADMIN_GUIDE } = await data('adminGuideContent.js');

// ── Look (matches the app's palette) ───────────────────────

const C = {
  accent: '5865F2', dark: '1E1F22', body: '313338', muted: '80848E', white: 'FFFFFF',
  green: '23A55A', red: 'ED4245', lblue: 'EEF0FF', lgray: 'F8F9FF',
};
const FULL = 9360; // content width in twips (8.5" page, 1" margins)
const border = (color = 'DDDDDD') => Object.fromEntries(
  ['top', 'bottom', 'left', 'right'].map((s) => [s, { style: BorderStyle.SINGLE, size: 1, color }])
);
const noBorder = () => Object.fromEntries(
  ['top', 'bottom', 'left', 'right'].map((s) => [s, { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }])
);
const run = (text, opts = {}) => new TextRun({ text, font: 'Arial', size: 22, color: C.body, ...opts });

const sectionHeading = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_1,
  spacing: { before: 360, after: 160 },
  border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: C.accent, space: 6 } },
  children: [run(text, { size: 30, bold: true, color: C.dark })],
});

const subHeading = (num, text) => new Paragraph({
  heading: HeadingLevel.HEADING_2,
  spacing: { before: 260, after: 100 },
  children: [run(`${num}  `, { size: 24, bold: true, color: C.muted }), run(text, { size: 24, bold: true, color: C.accent })],
});

const bodyPara = (text) => new Paragraph({ spacing: { after: 100 }, children: [run(text)] });

// Each numbered list gets its own numbering instance so it starts at 1.
let listInstance = 0;
const listItems = (items, reference) => {
  const instance = ++listInstance;
  return items.map((item) => new Paragraph({
    numbering: { reference, level: 0, instance },
    spacing: { after: 80 },
    children: [run(item)],
  }));
};

const boxed = (fill, borders, children) => new Table({
  width: { size: FULL, type: WidthType.DXA },
  columnWidths: [FULL],
  rows: [new TableRow({ children: [new TableCell({
    borders, shading: { fill, type: ShadingType.CLEAR },
    margins: { top: 120, bottom: 120, left: 200, right: 200 },
    width: { size: FULL, type: WidthType.DXA },
    children,
  })] })],
});

const NOTE = {
  info: { fill: C.lblue, label: 'NOTE', color: C.accent },
  warning: { fill: 'FFF8E1', label: 'TIP', color: 'F57C00' },
  danger: { fill: 'FDECEA', label: 'IMPORTANT', color: C.red },
};
const note = (text, variant = 'info') => {
  const n = NOTE[variant] || NOTE.info;
  return boxed(n.fill, noBorder(), [new Paragraph({ children: [run(`${n.label}: `, { bold: true, color: n.color }), run(text)] })]);
};

const code = (text) => boxed('2B2D31', border('444444'), text.split('\n').map((line) => new Paragraph({
  children: [new TextRun({ text: line || ' ', font: 'Courier New', size: 20, color: 'A8D8A8' })],
})));

const table = (headers, rows) => {
  const widths = headers.length === 2 ? [3200, FULL - 3200] : headers.map(() => Math.floor(FULL / headers.length));
  const cell = (text, i, header, shaded) => new TableCell({
    borders: border(header ? C.accent : 'DDDDDD'),
    shading: { fill: header ? C.accent : shaded ? C.lgray : C.white, type: ShadingType.CLEAR },
    margins: { top: header ? 100 : 80, bottom: header ? 100 : 80, left: 150, right: 150 },
    width: { size: widths[i], type: WidthType.DXA },
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({ children: [run(String(text), { size: 20, bold: header, color: header ? C.white : C.body })] })],
  });
  return new Table({
    width: { size: FULL, type: WidthType.DXA },
    columnWidths: widths,
    rows: [
      new TableRow({ tableHeader: true, children: headers.map((h, i) => cell(h, i, true)) }),
      ...rows.map((r, ri) => new TableRow({ children: r.map((t, i) => cell(t, i, false, ri % 2 === 1)) })),
    ],
  });
};

const spacer = () => new Paragraph({ spacing: { after: 120 }, children: [] });

function renderBlock(block) {
  switch (block.type) {
    case 'sub': return [subHeading(block.num, block.title)];
    case 'body': return [bodyPara(block.text)];
    case 'bullets': return listItems(block.items, 'bullets');
    case 'steps': return listItems(block.items, 'steps');
    case 'note': return [note(block.text, block.variant), spacer()];
    case 'sql': return [code(block.text), spacer()];
    case 'table': return [table(block.headers, block.rows), spacer()];
    default: throw new Error(`Unknown guide block type: ${block.type}`);
  }
}

function buildDoc(guide) {
  const updated = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
  const cover = [
    new Paragraph({ spacing: { before: 2400 }, children: [] }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [run('The Crows Nest', { size: 72, bold: true, color: C.accent })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 }, children: [run(guide.title, { size: 40, color: C.dark })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 600 }, children: [run(guide.subtitle, { size: 26, color: C.muted })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [run(`Updated ${updated}`, { size: 20, color: C.muted })] }),
    new Paragraph({ children: [new PageBreak()] }),
    // A simple contents page: section numbers and titles.
    sectionHeading('Contents'),
    ...guide.sections.map((s) => new Paragraph({ spacing: { after: 80 }, children: [run(`${s.num}.  ${s.title}`)] })),
    new Paragraph({ children: [new PageBreak()] }),
  ];
  const body = guide.sections.flatMap((s) => [
    sectionHeading(`${s.num}. ${s.title}`),
    ...s.blocks.flatMap(renderBlock),
  ]);

  return new Document({
    creator: 'The Crows Nest',
    title: `The Crows Nest — ${guide.title}`,
    styles: { default: { document: { run: { font: 'Arial', size: 22 } } } },
    numbering: {
      config: [
        { reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
        { reference: 'steps', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      ],
    },
    sections: [{
      properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
      headers: { default: new Header({ children: [new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: C.accent, space: 6 } },
        children: [run('The Crows Nest  ', { size: 20, bold: true, color: C.accent }), run(`— ${guide.title}`, { size: 20, color: C.muted })],
      })] }) },
      footers: { default: new Footer({ children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          run('Page ', { size: 18, color: C.muted }),
          new TextRun({ children: [PageNumber.CURRENT], font: 'Arial', size: 18, color: C.muted }),
          run(' of ', { size: 18, color: C.muted }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], font: 'Arial', size: 18, color: C.muted }),
        ],
      })] }) },
      children: [...cover, ...body],
    }],
  });
}

for (const [guide, file] of [[USER_GUIDE, 'CrowsNest-User-Guide.docx'], [ADMIN_GUIDE, 'CrowsNest-Admin-Guide.docx']]) {
  const buffer = await Packer.toBuffer(buildDoc(guide));
  const out = path.join(ROOT, 'frontend', 'public', file);
  fs.writeFileSync(out, buffer);
  const blocks = guide.sections.reduce((n, s) => n + s.blocks.length, 0);
  console.log(`Wrote ${path.relative(ROOT, out)} — ${guide.sections.length} sections, ${blocks} blocks, ${Math.round(buffer.length / 1024)} KB`);
}
