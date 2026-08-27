import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';

type DocxRun = TextRun | ExternalHyperlink;

type Block = Paragraph | Table;

interface RunStyle {
  bold?: boolean;
  italics?: boolean;
  strike?: boolean;
  color?: string;
  font?: string;
  size?: number;
  underline?: Record<string, never>;
}

const CODE_SHADING = { type: ShadingType.CLEAR, color: 'auto', fill: 'F2F2F2' } as const;

const HEADING_LEVELS: Record<string, (typeof HeadingLevel)[keyof typeof HeadingLevel]> = {
  h1: HeadingLevel.HEADING_1,
  h2: HeadingLevel.HEADING_2,
  h3: HeadingLevel.HEADING_3,
  h4: HeadingLevel.HEADING_4,
  h5: HeadingLevel.HEADING_5,
  h6: HeadingLevel.HEADING_6,
};

const TABLE_BORDERS = {
  top: { style: BorderStyle.SINGLE, size: 4, color: 'B0B0B0' },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: 'B0B0B0' },
  left: { style: BorderStyle.SINGLE, size: 4, color: 'B0B0B0' },
  right: { style: BorderStyle.SINGLE, size: 4, color: 'B0B0B0' },
  insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: 'B0B0B0' },
  insideVertical: { style: BorderStyle.SINGLE, size: 4, color: 'B0B0B0' },
} as const;

const NUMBERING_CONFIG = [
  {
    reference: 'bullets',
    levels: [
      {
        level: 0,
        format: LevelFormat.BULLET,
        text: '\u2022',
        alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } },
      },
      {
        level: 1,
        format: LevelFormat.BULLET,
        text: '\u25E6',
        alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 1080, hanging: 360 } } },
      },
      {
        level: 2,
        format: LevelFormat.BULLET,
        text: '\u25AA',
        alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 1440, hanging: 360 } } },
      },
    ],
  },
  {
    reference: 'numbers',
    levels: [
      {
        level: 0,
        format: LevelFormat.DECIMAL,
        text: '%1.',
        alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } },
      },
      {
        level: 1,
        format: LevelFormat.DECIMAL,
        text: '%2.',
        alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 1080, hanging: 360 } } },
      },
      {
        level: 2,
        format: LevelFormat.DECIMAL,
        text: '%3.',
        alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 1440, hanging: 360 } } },
      },
    ],
  },
];

interface WalkState {
  numInstance: number;
}

const isElement = (node: ChildNode): node is Element => node.nodeType === Node.ELEMENT_NODE;

const tagOf = (el: Element): string => el.tagName.toLowerCase();

const textOf = (el: Element): string => el.textContent ?? '';

const collapseWhitespace = (text: string): string => text.replace(/\s+/g, ' ').trim();

function inlineRuns(parent: Element, style: RunStyle = {}): DocxRun[] {
  const runs: DocxRun[] = [];
  for (const node of Array.from(parent.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = collapseWhitespace(node.textContent ?? '');
      if (text.length > 0) runs.push(new TextRun({ text, ...style }));
      continue;
    }
    if (!isElement(node)) continue;
    const el = node;
    const t = tagOf(el);
    if (t === 'ul' || t === 'ol') continue;
    if (t === 'strong' || t === 'b') {
      runs.push(...inlineRuns(el, { ...style, bold: true }));
    } else if (t === 'em' || t === 'i') {
      runs.push(...inlineRuns(el, { ...style, italics: true }));
    } else if (t === 'del' || t === 's' || t === 'strike') {
      runs.push(...inlineRuns(el, { ...style, strike: true }));
    } else if (t === 'code') {
      runs.push(
        new TextRun({
          text: collapseWhitespace(textOf(el)),
          font: 'Consolas',
          size: 18,
          shading: CODE_SHADING,
          ...style,
        }),
      );
    } else if (t === 'a') {
      const href = el.getAttribute('href') ?? '#';
      const children = inlineRuns(el, { ...style, color: '0563C1', underline: {} });
      runs.push(
        new ExternalHyperlink({
          link: href,
          children: children.length > 0 ? children : [new TextRun({ text: href, ...style })],
        }),
      );
    } else if (t === 'br') {
      runs.push(new TextRun({ text: '', break: 1 }));
    } else if (t === 'img') {
      runs.push(
        new TextRun({
          text: `[Image: ${el.getAttribute('alt') ?? ''}]`,
          italics: true,
          color: '888888',
          ...style,
        }),
      );
    } else {
      runs.push(...inlineRuns(el, style));
    }
  }
  return runs;
}

function headingParagraph(el: Element): Paragraph {
  const level = HEADING_LEVELS[tagOf(el)] ?? HeadingLevel.HEADING_1;
  const major = tagOf(el) === 'h1' || tagOf(el) === 'h2';
  return new Paragraph({
    heading: level,
    spacing: { before: major ? 360 : 240, after: 160 },
    children: inlineRuns(el),
  });
}

function codeBlockParagraph(preEl: Element): Paragraph {
  const codeEl = preEl.querySelector('code');
  const codeText = codeEl ? textOf(codeEl) : textOf(preEl);
  const lines = codeText.split('\n');
  const runs = lines.map(
    (line, index) =>
      new TextRun({
        text: line.length === 0 ? ' ' : line,
        font: 'Consolas',
        size: 18,
        break: index < lines.length - 1 ? 1 : 0,
      }),
  );
  return new Paragraph({
    shading: CODE_SHADING,
    indent: { left: 360, right: 360 },
    spacing: { before: 120, after: 120 },
    children: runs,
  });
}

function tableToDocx(tableEl: Element): Table {
  const rows: TableRow[] = [];
  const trs = Array.from(tableEl.querySelectorAll('tr'));
  trs.forEach((tr, rowIndex) => {
    const cells = Array.from(tr.children)
      .filter((cell) => /^t[hd]$/i.test(tagOf(cell)))
      .map(
        (cell) =>
          new TableCell({
            shading:
              rowIndex === 0
                ? { type: ShadingType.CLEAR, color: 'auto', fill: 'E8E8E8' }
                : undefined,
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [new Paragraph({ spacing: { after: 0 }, children: inlineRuns(cell) })],
          }),
      );
    rows.push(new TableRow({ tableHeader: rowIndex === 0, children: cells }));
  });
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: TABLE_BORDERS,
    rows,
  });
}

function blockquoteParagraphs(el: Element): Paragraph[] {
  const quoteStyle = {
    indent: { left: 720, right: 360 },
    border: { left: { style: BorderStyle.SINGLE, size: 18, color: 'AAAAAA' } },
    spacing: { after: 120 },
  };
  const blockChildren = Array.from(el.children).filter((child) =>
    ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagOf(child)),
  );
  if (blockChildren.length > 0) {
    return blockChildren.map((child) => {
      if (tagOf(child).startsWith('h')) return headingParagraph(child);
      return new Paragraph({ ...quoteStyle, children: inlineRuns(child) });
    });
  }
  return [new Paragraph({ ...quoteStyle, children: inlineRuns(el) })];
}

function hrParagraph(): Paragraph {
  return new Paragraph({
    spacing: { before: 200, after: 200 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'AAAAAA' } },
  });
}

function imageParagraph(el: Element): Paragraph {
  return new Paragraph({
    spacing: { after: 120 },
    children: [
      new TextRun({
        text: `[Image: ${el.getAttribute('alt') ?? ''}]`,
        italics: true,
        color: '888888',
      }),
    ],
  });
}

function listParagraphs(listEl: Element, state: WalkState, depth = 0): Paragraph[] {
  const out: Paragraph[] = [];
  const ordered = tagOf(listEl) === 'ol';
  if (ordered && depth === 0) state.numInstance += 1;
  const reference = ordered ? 'numbers' : 'bullets';
  const instance = ordered ? state.numInstance : undefined;

  for (const li of Array.from(listEl.children).filter((child) => tagOf(child) === 'li')) {
    out.push(
      new Paragraph({
        numbering: { reference, level: depth, instance },
        spacing: { after: 60 },
        children: inlineRuns(li),
      }),
    );
    for (const child of Array.from(li.children).filter((c) => ['ul', 'ol'].includes(tagOf(c)))) {
      out.push(...listParagraphs(child, state, depth + 1));
    }
  }
  return out;
}

function blockToParagraphs(el: Element, state: WalkState): Block[] {
  const t = tagOf(el);
  switch (t) {
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6':
      return [headingParagraph(el)];
    case 'p':
      return [new Paragraph({ spacing: { after: 120 }, children: inlineRuns(el) })];
    case 'pre':
      return [codeBlockParagraph(el)];
    case 'table':
      return [tableToDocx(el)];
    case 'blockquote':
      return blockquoteParagraphs(el);
    case 'hr':
      return [hrParagraph()];
    case 'img':
      return [imageParagraph(el)];
    case 'ul':
    case 'ol':
      return listParagraphs(el, state);
    default:
      return [new Paragraph({ spacing: { after: 120 }, children: inlineRuns(el) })];
  }
}

function buildDocument(html: string, title: string): Document {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const state: WalkState = { numInstance: 0 };
  const children: Block[] = [];
  for (const node of Array.from(parsed.body.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = collapseWhitespace(node.textContent ?? '');
      if (text.length > 0) children.push(new Paragraph({ children: [new TextRun({ text })] }));
      continue;
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      children.push(...blockToParagraphs(node as Element, state));
    }
  }
  return new Document({
    creator: 'Crystallize',
    title,
    description: 'Exported from Crystallize',
    numbering: { config: NUMBERING_CONFIG },
    styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
    sections: [{ children }],
  });
}

export async function markdownToDocxBlob(markdown: string, title: string): Promise<Blob> {
  const html = renderToStaticMarkup(
    <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>,
  );
  const document = buildDocument(html, title);
  return Packer.toBlob(document);
}

export async function downloadMarkdownAsDocx(
  markdown: string,
  filename: string,
  title?: string,
): Promise<void> {
  const safeName = filename.toLowerCase().endsWith('.docx') ? filename : `${filename}.docx`;
  const blob = await markdownToDocxBlob(markdown, title ?? safeName);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = safeName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
