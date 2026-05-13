// Markdown → DOCX converter for the ASH Inspection App audit pack.
// Reads SPECIFICATION.md, COVERING_LETTER.md, MERGE_SPECIFICATION.md
// in this directory and writes matching .docx files.
//
// Handles: headings (H1-H4), paragraphs, bullet/numbered lists, tables,
// fenced code blocks, inline code, bold, italic, links, horizontal rules.
//
// Run with: node convert-md-to-docx.js
//
// Requires `docx` to be installed globally (already verified). The require()
// goes through the global npm path that Node 24 resolves automatically.

const fs   = require('fs')
const path = require('path')

const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, LevelFormat,
  HeadingLevel, BorderStyle, WidthType, ShadingType,
  PageNumber, ExternalHyperlink,
} = require('docx')

// ── Page / style constants ────────────────────────────────────────────────────
// 2 cm margin = 1134 DXA (1 cm = 567 DXA).
// A4 page = 11906 x 16838 DXA. Content width = 11906 - 1134 - 1134 = 9638.
const MARGIN_DXA      = 1134
const PAGE_W          = 11906
const PAGE_H          = 16838
const CONTENT_WIDTH   = PAGE_W - 2 * MARGIN_DXA
const COLOR_BODY      = '222222'
const COLOR_HEADING   = '1F3864'
const COLOR_CODE_BG   = 'F4F4F4'
const COLOR_CODE_TEXT = '333333'
const COLOR_LINK      = '2E5395'
const COLOR_TABLE_HDR = '1F3864'
const COLOR_BORDER    = 'BFBFBF'

// ── Inline tokenisation ──────────────────────────────────────────────────────
// Parses a single line of text into TextRun objects, honouring **bold**,
// *italic*, `code`, and [text](url) links. Order matters: bold consumes its
// markers before italic looks at the rest, so **bold** and *italic* never
// collide.
function inlineRuns(text) {
  const runs    = []
  let   cursor  = 0

  // Regex catches the four inline patterns in priority order:
  //   1. ![alt](url) — image, treated as alt text only
  //   2. [text](url) — hyperlink
  //   3. **bold**
  //   4. *italic*
  //   5. `code`
  const pattern = /!\[([^\]]*)\]\([^)]+\)|\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`/g

  let match
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) {
      runs.push(new TextRun({
        text: text.slice(cursor, match.index),
        font: 'Calibri',
        color: COLOR_BODY,
      }))
    }
    if (match[2] !== undefined) {
      // Hyperlink — separate construction at paragraph level (see emitParagraph)
      runs.push({ __link: { text: match[2], url: match[3] } })
    } else if (match[4] !== undefined) {
      runs.push(new TextRun({
        text: match[4], bold: true, font: 'Calibri', color: COLOR_BODY,
      }))
    } else if (match[5] !== undefined) {
      runs.push(new TextRun({
        text: match[5], italics: true, font: 'Calibri', color: COLOR_BODY,
      }))
    } else if (match[6] !== undefined) {
      runs.push(new TextRun({
        text: match[6], font: 'Consolas', color: COLOR_CODE_TEXT, shading: { fill: COLOR_CODE_BG, type: ShadingType.CLEAR },
      }))
    } else if (match[1] !== undefined) {
      runs.push(new TextRun({
        text: `[Image: ${match[1]}]`, italics: true, color: '888888', font: 'Calibri',
      }))
    }
    cursor = pattern.lastIndex
  }
  if (cursor < text.length) {
    runs.push(new TextRun({
      text: text.slice(cursor), font: 'Calibri', color: COLOR_BODY,
    }))
  }
  return runs
}

// Convert the mixed array (some TextRun, some { __link: {...} } markers) into
// a flat children array suitable for a Paragraph, building ExternalHyperlinks
// where needed.
function expandRuns(mixedRuns) {
  return mixedRuns.map(r => {
    if (r && r.__link) {
      return new ExternalHyperlink({
        link:     r.__link.url,
        children: [new TextRun({
          text: r.__link.text, color: COLOR_LINK, underline: {}, font: 'Calibri',
        })],
      })
    }
    return r
  })
}

// ── Block emitters ───────────────────────────────────────────────────────────
function emitParagraph(text, opts = {}) {
  return new Paragraph({
    spacing: { before: 60, after: 100, line: 300 },
    children: expandRuns(inlineRuns(text)),
    ...opts,
  })
}

function emitHeading(level, text) {
  const levelMap = {
    1: HeadingLevel.HEADING_1,
    2: HeadingLevel.HEADING_2,
    3: HeadingLevel.HEADING_3,
    4: HeadingLevel.HEADING_4,
    5: HeadingLevel.HEADING_5,
    6: HeadingLevel.HEADING_6,
  }
  return new Paragraph({
    heading: levelMap[level] ?? HeadingLevel.HEADING_6,
    spacing: { before: level === 1 ? 320 : 240, after: 120 },
    children: expandRuns(inlineRuns(text)),
  })
}

function emitListItem(text, ordered) {
  return new Paragraph({
    numbering: { reference: ordered ? 'numbers' : 'bullets', level: 0 },
    spacing: { before: 40, after: 40, line: 280 },
    children: expandRuns(inlineRuns(text)),
  })
}

function emitHr() {
  return new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: COLOR_BORDER, space: 8 } },
    spacing: { before: 120, after: 120 },
    children: [],
  })
}

function emitCodeBlock(lines) {
  // Each line becomes its own Paragraph so wrapping behaves correctly.
  // Shading is applied to each paragraph for a contiguous grey block.
  return lines.map((line, idx) => new Paragraph({
    shading: { fill: COLOR_CODE_BG, type: ShadingType.CLEAR },
    spacing: { before: idx === 0 ? 80 : 0, after: idx === lines.length - 1 ? 100 : 0, line: 260 },
    children: [new TextRun({
      text: line === '' ? ' ' : line,
      font: 'Consolas',
      size: 18,                       // 9 pt
      color: COLOR_CODE_TEXT,
    })],
  }))
}

// Markdown table → docx Table.
// Expects rows of cells, where the first row is the header row. Drops the
// |---|---| separator row before being called.
function emitTable(rows) {
  const ncols      = rows[0].length
  const cellWidth  = Math.floor(CONTENT_WIDTH / ncols)
  const colWidths  = new Array(ncols).fill(cellWidth)
  // Adjust last column to absorb rounding
  colWidths[ncols - 1] = CONTENT_WIDTH - cellWidth * (ncols - 1)

  const border       = { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER }
  const cellBorders  = { top: border, bottom: border, left: border, right: border }

  const mkCell = (text, isHeader, width) => new TableCell({
    width:    { size: width, type: WidthType.DXA },
    borders:  cellBorders,
    shading:  isHeader
      ? { fill: COLOR_TABLE_HDR, type: ShadingType.CLEAR }
      : { fill: 'FFFFFF', type: ShadingType.CLEAR },
    margins:  { top: 80, bottom: 80, left: 120, right: 120 },
    children: [new Paragraph({
      spacing: { before: 20, after: 20 },
      children: expandRuns(inlineRuns(text)).map(r => {
        if (r instanceof TextRun && isHeader) {
          // Force header cell text to white + bold.
          return new TextRun({
            text: r.options?.text ?? '',
            bold: true,
            color: 'FFFFFF',
            font: 'Calibri',
          })
        }
        return r
      }),
    })],
  })

  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: colWidths,
    rows: rows.map((row, idx) => new TableRow({
      tableHeader: idx === 0,
      children: row.map((cell, ci) => mkCell(cell, idx === 0, colWidths[ci])),
    })),
  })
}

// ── Markdown parser (line-driven, scoped to what these docs actually use) ────
function parseMarkdown(md) {
  const lines  = md.replace(/\r\n/g, '\n').split('\n')
  const blocks = []

  let i = 0
  while (i < lines.length) {
    const line = lines[i]

    // Blank line → skip
    if (line.trim() === '') { i++; continue }

    // Fenced code block
    if (line.startsWith('```')) {
      const code = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) {
        code.push(lines[i])
        i++
      }
      i++  // skip closing fence
      blocks.push({ type: 'code', lines: code })
      continue
    }

    // Horizontal rule
    if (/^---+\s*$/.test(line)) { blocks.push({ type: 'hr' }); i++; continue }

    // Heading
    const headingMatch = line.match(/^(#{1,6})\s+(.+?)\s*$/)
    if (headingMatch) {
      blocks.push({ type: 'heading', level: headingMatch[1].length, text: headingMatch[2] })
      i++
      continue
    }

    // Table — header row followed by a |---|---| separator
    if (line.includes('|') && i + 1 < lines.length && /^\s*\|?[\s\-:|]+\|[\s\-:|]+/.test(lines[i + 1])) {
      const rows = []
      // header
      rows.push(parseTableRow(line))
      i += 2 // skip separator
      while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') {
        rows.push(parseTableRow(lines[i]))
        i++
      }
      blocks.push({ type: 'table', rows })
      continue
    }

    // Bullet list
    if (/^[-*]\s+/.test(line)) {
      const items = []
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s+/, ''))
        i++
      }
      blocks.push({ type: 'ul', items })
      continue
    }

    // Numbered list
    if (/^\d+\.\s+/.test(line)) {
      const items = []
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s+/, ''))
        i++
      }
      blocks.push({ type: 'ol', items })
      continue
    }

    // Block quote — keep simple: render as indented italic paragraph
    if (line.startsWith('> ')) {
      const buf = []
      while (i < lines.length && lines[i].startsWith('> ')) {
        buf.push(lines[i].slice(2))
        i++
      }
      blocks.push({ type: 'blockquote', text: buf.join(' ') })
      continue
    }

    // Paragraph — accumulate until blank line / new block
    const para = [line]
    i++
    while (i < lines.length
        && lines[i].trim() !== ''
        && !lines[i].startsWith('#')
        && !lines[i].startsWith('```')
        && !/^---+\s*$/.test(lines[i])
        && !/^[-*]\s+/.test(lines[i])
        && !/^\d+\.\s+/.test(lines[i])
        && !lines[i].startsWith('> ')
        // Avoid table lookahead — if the *next* line is a table separator, this is a table not a paragraph
        && !(lines[i].includes('|') && i + 1 < lines.length && /^\s*\|?[\s\-:|]+\|[\s\-:|]+/.test(lines[i + 1]))) {
      para.push(lines[i])
      i++
    }
    blocks.push({ type: 'paragraph', text: para.join(' ') })
  }
  return blocks
}

function parseTableRow(line) {
  // Trim, strip leading/trailing pipes, split on |
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  return trimmed.split('|').map(c => c.trim())
}

// ── Block → docx element ─────────────────────────────────────────────────────
function blockToDocx(block) {
  switch (block.type) {
    case 'heading':    return [emitHeading(block.level, block.text)]
    case 'paragraph':  return [emitParagraph(block.text)]
    case 'code':       return emitCodeBlock(block.lines)
    case 'hr':         return [emitHr()]
    case 'table':      return [emitTable(block.rows), new Paragraph({ spacing: { after: 120 }, children: [] })]
    case 'ul':         return block.items.map(t => emitListItem(t, false))
    case 'ol':         return block.items.map(t => emitListItem(t, true))
    case 'blockquote': return [new Paragraph({
      indent:   { left: 567 },                  // 1 cm left indent
      spacing:  { before: 120, after: 120, line: 300 },
      children: expandRuns(inlineRuns(block.text)).map(r =>
        r instanceof TextRun ? new TextRun({
          text:    r.options?.text ?? '',
          italics: true,
          color:   '555555',
          font:    'Calibri',
        }) : r,
      ),
    })]
    default:           return []
  }
}

// ── Document assembly ────────────────────────────────────────────────────────
function buildDoc(blocks, titleHint) {
  const body = blocks.flatMap(blockToDocx)

  return new Document({
    creator:     'ASH Chartered Surveyors',
    title:       titleHint,
    description: 'Audit handover document for the ASH Inspection App',
    styles: {
      default: { document: { run: { font: 'Calibri', size: 22, color: COLOR_BODY } } },  // 11pt
      paragraphStyles: [
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 36, bold: true, color: COLOR_HEADING, font: 'Calibri' },
          paragraph: { spacing: { before: 320, after: 160 }, outlineLevel: 0 } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 28, bold: true, color: COLOR_HEADING, font: 'Calibri' },
          paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 1 } },
        { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 24, bold: true, color: COLOR_HEADING, font: 'Calibri' },
          paragraph: { spacing: { before: 200, after: 100 }, outlineLevel: 2 } },
        { id: 'Heading4', name: 'Heading 4', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 22, bold: true, color: '2E5395', font: 'Calibri' },
          paragraph: { spacing: { before: 160, after: 80 }, outlineLevel: 3 } },
      ],
    },
    numbering: {
      config: [
        { reference: 'bullets',
          levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
        { reference: 'numbers',
          levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      ],
    },
    sections: [{
      properties: {
        page: {
          size:   { width: PAGE_W, height: PAGE_H },
          margin: { top: MARGIN_DXA, right: MARGIN_DXA, bottom: MARGIN_DXA, left: MARGIN_DXA },
        },
      },
      headers: {
        default: new Header({
          children: [new Paragraph({
            alignment: AlignmentType.RIGHT,
            spacing:   { after: 80 },
            border:    { bottom: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER, space: 4 } },
            children: [new TextRun({
              text: titleHint, size: 18, color: '888888', font: 'Calibri',
            })],
          })],
        }),
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing:   { before: 80 },
            border:    { top: { style: BorderStyle.SINGLE, size: 4, color: COLOR_BORDER, space: 4 } },
            children: [
              new TextRun({ text: 'Page ', size: 18, color: '888888', font: 'Calibri' }),
              new TextRun({ children: [PageNumber.CURRENT], size: 18, color: '888888', font: 'Calibri' }),
              new TextRun({ text: ' of ',                size: 18, color: '888888', font: 'Calibri' }),
              new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18, color: '888888', font: 'Calibri' }),
            ],
          })],
        }),
      },
      children: body,
    }],
  })
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function convert(filename, title) {
  const here    = __dirname
  const srcPath = path.join(here, filename)
  const dstPath = path.join(here, filename.replace(/\.md$/, '.docx'))

  const md     = fs.readFileSync(srcPath, 'utf-8')
  const blocks = parseMarkdown(md)
  const doc    = buildDoc(blocks, title)

  const buffer = await Packer.toBuffer(doc)
  fs.writeFileSync(dstPath, buffer)
  console.log(`Wrote ${dstPath}  (${buffer.length.toLocaleString()} bytes)`)
}

;(async () => {
  await convert('SPECIFICATION.md',       'ASH Inspection App — System Specification')
  await convert('COVERING_LETTER.md',     'Covering Statement to the Audit Team')
  await convert('MERGE_SPECIFICATION.md', 'Merge Specification — Inspection App into PropOS')
  console.log('Done.')
})().catch(err => {
  console.error(err)
  process.exit(1)
})
