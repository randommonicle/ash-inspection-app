import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, BorderStyle, WidthType, ShadingType,
  ImageRun, PageBreak, Header, Footer, PageNumber, TabStopType,
  BookmarkStart, BookmarkEnd, InternalHyperlink,
} from 'docx'

// ── Colour palette (matches ASH template exactly) ────────────────────────────
const C = {
  navy:      '1F3864',
  midBlue:   '2E5395',
  lightBlue: 'D6E4F0',
  red:       'C00000',
  amber:     'E26B0A',
  green:     '375623',
  lightGrey: 'F2F2F2',
  midGrey:   'D9D9D9',
  white:     'FFFFFF',
  darkText:  '222222',
  labelText: '555555',
  caption:   '888888',
}

// ── Section metadata ──────────────────────────────────────────────────────────
const SECTION_LABELS: Record<string, string> = {
  external_approach: 'External Approach and Entrance',
  grounds:           'Grounds and Landscaping',
  bin_store:         'Bin Store and Waste Facilities',
  car_park:          'Car Park',
  external_fabric:   'External Fabric and Elevations',
  roof:              'Roof and Roof Terrace',
  communal_entrance: 'Communal Entrance and Reception',
  stairwells:        'Stairwells and Circulation',
  lifts:             'Lifts',
  plant_room:        'Plant Room and Utilities',
  internal_communal: 'Internal Communal Areas (General)',
  additional:        'Additional / Property-Specific Areas',
}

const SECTION_ORDER = [
  'external_approach', 'grounds', 'bin_store', 'car_park',
  'external_fabric', 'roof', 'communal_entrance', 'stairwells',
  'lifts', 'plant_room', 'internal_communal', 'additional',
]

// Sections gated behind property flags — omitted if flag is false
const SECTION_FLAGS: Record<string, keyof PropertyFlags> = {
  car_park: 'has_car_park',
  lifts:    'has_lift',
  roof:     'has_roof_access',
}

const RISK_TIMEFRAMES: Record<string, string> = {
  High:   'Within 5 working days',
  Medium: 'Within 30 days',
  Low:    'Within 90 days',
}

const RISK_FILLS: Record<string, string> = {
  High:   'C00000',
  Medium: 'E26B0A',
  Low:    '375623',
}

// ── Types ────────────────────────────────────────────────────────────────────
interface PropertyFlags {
  has_car_park:    boolean
  has_lift:        boolean
  has_roof_access: boolean
}

export interface ReportObservation {
  id: string
  section_key: string
  template_order: number
  processed_text: string
  action_text: string | null
  risk_level: 'High' | 'Medium' | 'Low' | null
}

export interface ReportPhoto {
  id: string
  observation_id: string | null
  caption: string | null
  opus_description: { suggested_caption?: string; description?: string } | null
  imageBuffer: Buffer | null
}

export interface RecurringItem {
  section_key: string
  issue: string        // previous action_text
  previousDate: string // formatted date of the previous inspection
}

export interface ReportData {
  propertyName: string
  propertyRef: string
  propertyAddress: string
  propertyUnits: number
  managementCompany: string
  propertyFlags: PropertyFlags
  inspectionDate: string
  startTime: string
  endTime: string | null
  weather: string | null
  nextInspection: string | null
  inspectorName: string
  inspectorTitle: string
  overallSummary: string
  observations: ReportObservation[]
  photos: ReportPhoto[]
  reportGeneratedAt: string
  recurringItems: RecurringItem[]
}

// ── Helper: cell border ───────────────────────────────────────────────────────
function border(colour: string, size = 4) {
  const s = { style: BorderStyle.SINGLE, size, color: colour }
  return { top: s, bottom: s, left: s, right: s }
}

function noBorder() {
  const s = { style: BorderStyle.NONE, size: 0, color: C.white }
  return { top: s, bottom: s, left: s, right: s }
}

// ── Helper: text run ─────────────────────────────────────────────────────────
function t(text: string, opts: {
  bold?: boolean; italic?: boolean; size?: number; color?: string
} = {}): TextRun {
  return new TextRun({
    text,
    font:    'Arial',
    bold:    opts.bold,
    italics: opts.italic,
    size:    opts.size ?? 20,
    color:   opts.color ?? C.darkText,
  })
}

// ── Header ───────────────────────────────────────────────────────────────────
function buildHeader(): Header {
  return new Header({
    children: [
      new Table({
        width: { size: 9906, type: WidthType.DXA },
        columnWidths: [5800, 4106],
        rows: [
          new TableRow({
            children: [
              new TableCell({
                borders: noBorder(),
                width: { size: 5800, type: WidthType.DXA },
                children: [
                  new Paragraph({
                    spacing: { after: 40 },
                    children: [t('ASH CHARTERED SURVEYORS', { bold: true, size: 24, color: C.navy })],
                  }),
                  new Paragraph({
                    spacing: { after: 40 },
                    children: [t('1-5 Kew Place, Cheltenham GL53 7NQ', { size: 17, color: C.labelText })],
                  }),
                  new Paragraph({
                    // TODO [PRODUCTION]: Replace ben@ashproperty.co.uk with the firm's
                    // general enquiries address (e.g. info@ashproperty.co.uk) once confirmed.
                    children: [t('T: 01242 237274  |  ben@ashproperty.co.uk  |  ashproperty.co.uk', { size: 17, color: C.labelText })],
                  }),
                ],
              }),
              new TableCell({
                borders: noBorder(),
                width: { size: 4106, type: WidthType.DXA },
                verticalAlign: 'center' as any,
                children: [
                  new Paragraph({
                    alignment: AlignmentType.RIGHT,
                    children: [t('PROPERTY INSPECTION REPORT', { bold: true, size: 22, color: C.midBlue })],
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
      // Rule line beneath header table
      new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: C.navy, space: 4 } },
        spacing: { before: 0, after: 0 },
        children: [],
      }),
    ],
  })
}

// ── Footer ───────────────────────────────────────────────────────────────────
function buildFooter(): Footer {
  return new Footer({
    children: [
      // Top rule
      new Paragraph({
        border: { top: { style: BorderStyle.SINGLE, size: 6, color: C.midBlue, space: 4 } },
        spacing: { before: 0, after: 0 },
        children: [],
      }),
      // Page address + page number
      new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: 9906 }],
        spacing: { before: 40, after: 0 },
        children: [
          t('ASH Chartered Surveyors  |  1-5 Kew Place, Cheltenham GL53 7NQ  |  01242 237274', { size: 16, color: C.caption }),
          new TextRun({ text: '\t', font: 'Arial', size: 16 }),
          t('Page ', { size: 16, color: C.caption }),
          new TextRun({ children: [PageNumber.CURRENT], font: 'Arial', size: 16, color: C.caption }),
        ],
      }),
      // Disclaimer
      new Paragraph({
        spacing: { before: 40, after: 0 },
        children: [t(
          'This report has been prepared by ASH Chartered Surveyors in its capacity as managing agent. Observations are made during a visual inspection of accessible common areas only and do not constitute a structural survey. Where specialist investigation is recommended, this should be carried out by an appropriately qualified professional.',
          { italic: true, size: 14, color: C.caption },
        )],
      }),
    ],
  })
}

// ── Inspection details table (top of document) ────────────────────────────────
function buildInspectionDetailsTable(data: ReportData): Table {
  const labelCell = (text: string) => new TableCell({
    borders: border(C.midGrey),
    width: { size: 2100, type: WidthType.DXA },
    shading: { fill: C.navy, type: ShadingType.CLEAR },
    margins: { top: 60, bottom: 60, left: 140, right: 140 },
    children: [new Paragraph({ children: [t(text, { bold: true, size: 18, color: C.white })] })],
  })

  const valueCell = (text: string, wide = false) => new TableCell({
    borders: border(C.midGrey),
    width: { size: wide ? 2906 : 2800, type: WidthType.DXA },
    shading: { fill: C.lightBlue, type: ShadingType.CLEAR },
    margins: { top: 60, bottom: 60, left: 140, right: 140 },
    children: [new Paragraph({ children: [t(text, { italic: true, size: 18, color: C.labelText })] })],
  })

  const timeRange = data.endTime
    ? `${data.startTime} – ${data.endTime}`
    : data.startTime

  return new Table({
    width: { size: 9906, type: WidthType.DXA },
    columnWidths: [2100, 2800, 2100, 2906],
    rows: [
      new TableRow({ children: [labelCell('Property'), valueCell(data.propertyName), labelCell('Reference'), valueCell(data.propertyRef, true)] }),
      new TableRow({ children: [labelCell('Address'), valueCell(data.propertyAddress), labelCell('Units'), valueCell(String(data.propertyUnits), true)] }),
      new TableRow({ children: [labelCell('Inspection Date'), valueCell(data.inspectionDate), labelCell('Time'), valueCell(timeRange, true)] }),
      new TableRow({ children: [labelCell('Weather'), valueCell(data.weather ?? '—'), labelCell('Next Inspection'), valueCell(data.nextInspection ?? '—', true)] }),
      new TableRow({ children: [labelCell('Inspector'), valueCell(`${data.inspectorName}, Senior Property Manager`), labelCell('Management Co.'), valueCell(data.managementCompany, true)] }),
    ],
  })
}

// ── Full-width single-cell box (used for summary and action items) ─────────────
function summaryBox(text: string): Table {
  return new Table({
    width: { size: 9906, type: WidthType.DXA },
    columnWidths: [9906],
    rows: [
      new TableRow({
        children: [
          new TableCell({
            borders: border(C.midBlue, 6),
            width: { size: 9906, type: WidthType.DXA },
            shading: { fill: C.lightBlue, type: ShadingType.CLEAR },
            margins: { top: 100, bottom: 100, left: 140, right: 140 },
            children: [new Paragraph({ children: [t(text, { italic: true, size: 20, color: C.labelText })] })],
          }),
        ],
      }),
    ],
  })
}

// ── Section sub-heading (plain paragraph with bottom border rule) ──────────────
function sectionSubHeading(label: string, bookmarkId?: number, bookmarkName?: string): Paragraph {
  const textRun = t(label, { bold: true, size: 22, color: C.navy })
  const children = (bookmarkId !== undefined && bookmarkName)
    ? [new BookmarkStart(bookmarkName, bookmarkId), textRun, new BookmarkEnd(bookmarkId)]
    : [textRun]
  return new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: C.midBlue, space: 4 } },
    spacing: { before: 200, after: 80 },
    children,
  })
}

// ── Action box for a section ──────────────────────────────────────────────────
function actionBox(actionText: string | null): Table {
  const content = actionText ?? 'No action required at this time.'
  return new Table({
    width: { size: 9906, type: WidthType.DXA },
    columnWidths: [9906],
    rows: [
      new TableRow({
        children: [
          new TableCell({
            borders: border(C.midBlue, 6),
            width: { size: 9906, type: WidthType.DXA },
            shading: { fill: C.lightBlue, type: ShadingType.CLEAR },
            margins: { top: 100, bottom: 100, left: 140, right: 140 },
            children: [
              new Paragraph({
                spacing: { before: 0, after: 0 },
                children: [
                  t('Action: ', { bold: true, size: 20, color: C.navy }),
                  t(content, { italic: true, size: 20, color: '333333' }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  })
}

// ── Photo grid for a section ──────────────────────────────────────────────────
function photoGrid(sectionLabel: string, photos: ReportPhoto[]): (Table | Paragraph)[] {
  const embeddable = photos.filter(p => p.imageBuffer)
  if (embeddable.length === 0) return []

  const results: (Table | Paragraph)[] = []

  // Pair up photos two per row
  for (let i = 0; i < embeddable.length; i += 2) {
    const left  = embeddable[i]
    const right = embeddable[i + 1] ?? null

    const makePhotoCell = (photo: ReportPhoto, width: number) => {
      const caption = photo.opus_description?.suggested_caption ?? photo.caption ?? ''
      const children: Paragraph[] = []

      // DXA → pixels: divide by 15 (1440 DXA = 1 inch = 96 px)
      // Subtract cell margins (100 DXA each side) before converting
      const imgW = Math.round((width - 200) / 15)
      const imgH = Math.round(imgW * 0.75) // 4:3 landscape ratio

      try {
        children.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 60, after: 40 },
            children: [
              new ImageRun({
                type: 'jpg',
                data: photo.imageBuffer!,
                transformation: { width: imgW, height: imgH },
                altText: { title: caption, description: caption, name: photo.id },
              }),
            ],
          }),
        )
      } catch {
        children.push(new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 200, after: 200 },
          children: [t('[Photo]', { italic: true, size: 18, color: C.caption })],
        }))
      }

      if (caption) {
        children.push(new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 60 },
          children: [t(caption, { italic: true, size: 16, color: C.caption })],
        }))
      }

      return new TableCell({
        borders: border(C.midGrey),
        width: { size: width, type: WidthType.DXA },
        shading: { fill: C.lightGrey, type: ShadingType.CLEAR },
        margins: { top: 60, bottom: 60, left: 100, right: 100 },
        children,
      })
    }

    const makeEmptyCell = (width: number) => new TableCell({
      borders: border(C.midGrey),
      width: { size: width, type: WidthType.DXA },
      shading: { fill: C.lightGrey, type: ShadingType.CLEAR },
      margins: { top: 60, bottom: 60, left: 100, right: 100 },
      children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 200, after: 200 },
        children: [t('', { size: 18 })],
      })],
    })

    results.push(
      new Table({
        width: { size: 9906, type: WidthType.DXA },
        columnWidths: [4953, 4953],
        rows: [
          new TableRow({
            children: [
              makePhotoCell(left, 4953),
              right ? makePhotoCell(right, 4953) : makeEmptyCell(4953),
            ],
          }),
        ],
      }),
      new Paragraph({ spacing: { before: 0, after: 80 }, children: [] }),
    )
  }

  return results
}

// ── Actions summary table ─────────────────────────────────────────────────────
function buildActionsSummary(observations: ReportObservation[], sectionLabels: Record<string, string>): (Paragraph | Table)[] {
  const actions = observations.filter(o => o.action_text && o.risk_level)
  if (actions.length === 0) return []

  const headerCell = (text: string, width: number) => new TableCell({
    borders: border(C.midGrey),
    width: { size: width, type: WidthType.DXA },
    shading: { fill: C.navy, type: ShadingType.CLEAR },
    margins: { top: 60, bottom: 60, left: 140, right: 140 },
    children: [new Paragraph({ children: [t(text, { bold: true, size: 18, color: C.white })] })],
  })

  const dataCell = (text: string, width: number, fill: string) => new TableCell({
    borders: border(C.midGrey),
    width: { size: width, type: WidthType.DXA },
    shading: { fill, type: ShadingType.CLEAR },
    margins: { top: 60, bottom: 60, left: 140, right: 140 },
    children: [new Paragraph({ children: [t(text, { size: 18 })] })],
  })

  const riskCell = (risk: string, width: number) => new TableCell({
    borders: border(C.midGrey),
    width: { size: width, type: WidthType.DXA },
    shading: { fill: RISK_FILLS[risk] ?? C.midGrey, type: ShadingType.CLEAR },
    margins: { top: 60, bottom: 60, left: 60, right: 60 },
    verticalAlign: 'center' as any,
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [t(risk.toUpperCase(), { bold: true, size: 16, color: C.white })],
    })],
  })

  const dataRows = actions.map((obs, idx) => {
    const fill = idx % 2 === 0 ? C.white : C.lightGrey
    const risk = obs.risk_level!
    return new TableRow({
      children: [
        dataCell(sectionLabels[obs.section_key] ?? obs.section_key, 1646, fill),
        dataCell(obs.action_text!, 3300, fill),
        riskCell(risk, 1000),
        dataCell(RISK_TIMEFRAMES[risk] ?? '—', 1760, fill),
        dataCell('ASH / Contractor', 1200, fill),
      ],
    })
  })

  return [
    new Paragraph({ children: [new PageBreak()] }),
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 240, after: 120 },
      children: [t('Actions Summary', { bold: true, size: 28, color: C.navy })],
    }),
    new Paragraph({
      spacing: { before: 60, after: 60 },
      children: [t('The following table consolidates all required actions identified during this inspection, together with recommended response timeframes and responsibility.', { size: 20 })],
    }),
    new Table({
      width: { size: 9906, type: WidthType.DXA },
      columnWidths: [1646, 3300, 1000, 1760, 1200],
      rows: [
        new TableRow({
          children: [
            headerCell('Area', 1646),
            headerCell('Action Required', 3300),
            headerCell('Risk', 1000),
            headerCell('Response Timeframe', 1760),
            headerCell('Responsibility', 1200),
          ],
        }),
        ...dataRows,
      ],
    }),
    new Paragraph({ spacing: { before: 0, after: 160 }, children: [] }),
  ]
}

// ── Recurring items section ───────────────────────────────────────────────────
function buildRecurringItems(items: RecurringItem[]): (Paragraph | Table)[] {
  const headerCell = (text: string, width: number) => new TableCell({
    borders: border(C.midGrey),
    width: { size: width, type: WidthType.DXA },
    shading: { fill: C.navy, type: ShadingType.CLEAR },
    margins: { top: 60, bottom: 60, left: 140, right: 140 },
    children: [new Paragraph({ children: [t(text, { bold: true, size: 18, color: C.white })] })],
  })

  const dataRows: TableRow[] = items.length === 0
    ? [
        new TableRow({
          children: [
            new TableCell({
              borders: border(C.midGrey),
              width: { size: 9906, type: WidthType.DXA },
              columnSpan: 3,
              margins: { top: 60, bottom: 60, left: 140, right: 140 },
              children: [new Paragraph({
                children: [t('No recurring items identified — all actions from the previous inspection have been resolved, or no previous inspection record exists.', { italic: true, size: 18, color: C.labelText })],
              })],
            }),
          ],
        }),
      ]
    : items.map(item => new TableRow({
        children: [
          new TableCell({
            borders: border(C.midGrey),
            width: { size: 2000, type: WidthType.DXA },
            margins: { top: 60, bottom: 60, left: 140, right: 140 },
            children: [new Paragraph({ children: [t(SECTION_LABELS[item.section_key] ?? item.section_key, { size: 18 })] })],
          }),
          new TableCell({
            borders: border(C.midGrey),
            width: { size: 5906, type: WidthType.DXA },
            margins: { top: 60, bottom: 60, left: 140, right: 140 },
            children: [new Paragraph({ children: [t(item.issue, { size: 18 })] })],
          }),
          new TableCell({
            borders: border(C.midGrey),
            width: { size: 2000, type: WidthType.DXA },
            margins: { top: 60, bottom: 60, left: 140, right: 140 },
            children: [new Paragraph({ children: [t(item.previousDate, { size: 18 })] })],
          }),
        ],
      }))

  return [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 360, after: 120 },
      children: [t('Recurring Items', { bold: true, size: 28, color: C.navy })],
    }),
    new Paragraph({
      spacing: { before: 60, after: 60 },
      children: [t(
        items.length > 0
          ? 'The following items were also recorded in the previous inspection report and remain outstanding.'
          : 'Items noted in the previous inspection report have been reviewed against current findings.',
        { size: 20 }
      )],
    }),
    new Table({
      width: { size: 9906, type: WidthType.DXA },
      columnWidths: [2000, 5906, 2000],
      rows: [
        new TableRow({
          children: [
            headerCell('Area', 2000),
            headerCell('Recurring Issue', 5906),
            headerCell('Previously Noted', 2000),
          ],
        }),
        ...dataRows,
      ],
    }),
    new Paragraph({ spacing: { before: 0, after: 160 }, children: [] }),
  ]
}

// ── Inspector declaration table ───────────────────────────────────────────────
function buildDeclaration(inspectorName: string, inspectorTitle: string, inspectionDate: string, reportGeneratedAt: string): (Paragraph | Table)[] {
  const labelCell = (text: string) => new TableCell({
    borders: border(C.midGrey),
    width: { size: 2400, type: WidthType.DXA },
    shading: { fill: C.navy, type: ShadingType.CLEAR },
    margins: { top: 60, bottom: 60, left: 140, right: 140 },
    children: [new Paragraph({ children: [t(text, { bold: true, size: 18, color: C.white })] })],
  })

  const valueCell = (text: string, topPad = 60, bottomPad = 60) => new TableCell({
    borders: border(C.midGrey),
    width: { size: 7506, type: WidthType.DXA },
    shading: { fill: C.lightBlue, type: ShadingType.CLEAR },
    margins: { top: topPad, bottom: bottomPad, left: 140, right: 140 },
    children: [new Paragraph({ children: [t(text, { italic: true, size: 18, color: C.labelText })] })],
  })

  const signatureCell = () => new TableCell({
    borders: border(C.midGrey),
    width: { size: 7506, type: WidthType.DXA },
    shading: { fill: C.white, type: ShadingType.CLEAR },
    margins: { top: 600, bottom: 600, left: 140, right: 140 },
    children: [new Paragraph({ children: [t('___________________________________________', { size: 18 })] })],
  })

  return [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 360, after: 120 },
      children: [t('Inspector Declaration', { bold: true, size: 28, color: C.navy })],
    }),
    new Table({
      width: { size: 9906, type: WidthType.DXA },
      columnWidths: [2400, 7506],
      rows: [
        new TableRow({ children: [labelCell('Inspector'), valueCell(`${inspectorName}, ${inspectorTitle}, ASH Chartered Surveyors`)] }),
        new TableRow({ children: [labelCell('RICS Regulation'), valueCell('ASH Chartered Surveyors is regulated by RICS')] }),
        new TableRow({ children: [labelCell('Inspection Date'), valueCell(inspectionDate)] }),
        new TableRow({ children: [labelCell('Report Generated'), valueCell(reportGeneratedAt)] }),
        new TableRow({ children: [labelCell('Signature'), signatureCell()] }),
      ],
    }),
  ]
}

// ── Photo appendix ────────────────────────────────────────────────────────────
function buildPhotoAppendix(
  activeSections: string[],
  photosBySection: Map<string, ReportPhoto[]>,
): (Paragraph | Table)[] {
  const sectionsWithPhotos = activeSections.filter(key =>
    (photosBySection.get(key) ?? []).some(p => p.imageBuffer),
  )
  if (sectionsWithPhotos.length === 0) return []

  const thumbWidth = Math.floor(9906 / 3) // 3 columns

  const results: (Paragraph | Table)[] = [
    new Paragraph({ children: [new PageBreak()] }),
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 240, after: 120 },
      children: [t('Photo Appendix', { bold: true, size: 28, color: C.navy })],
    }),
    new Paragraph({
      spacing: { before: 60, after: 120 },
      children: [t(
        'All photographs taken during this inspection are collated below by section. Click a section heading to return to the relevant observations.',
        { size: 20 },
      )],
    }),
  ]

  for (const sectionKey of sectionsWithPhotos) {
    const label  = SECTION_LABELS[sectionKey] ?? sectionKey
    const photos = (photosBySection.get(sectionKey) ?? []).filter(p => p.imageBuffer)

    // Section label as internal hyperlink back to the bookmark in the body
    results.push(
      new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: C.midBlue, space: 4 } },
        spacing: { before: 200, after: 80 },
        children: [
          new InternalHyperlink({
            anchor: `section_${sectionKey}`,
            children: [
              new TextRun({ text: `↑ ${label}`, font: 'Arial', bold: true, size: 20, color: C.midBlue }),
            ],
          }),
        ],
      }),
    )

    // 3-column thumbnail grid
    for (let i = 0; i < photos.length; i += 3) {
      const row   = photos.slice(i, i + 3)
      const cells = row.map(photo => {
        const caption = photo.opus_description?.suggested_caption ?? photo.caption ?? ''
        const imgW    = Math.round((thumbWidth - 160) / 15)
        const imgH    = Math.round(imgW * 0.75)
        const kids: Paragraph[] = []
        try {
          kids.push(new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 40, after: 30 },
            children: [new ImageRun({
              type: 'jpg', data: photo.imageBuffer!,
              transformation: { width: imgW, height: imgH },
              altText: { title: caption, description: caption, name: photo.id },
            })],
          }))
        } catch {
          kids.push(new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 80, after: 80 },
            children: [t('[Photo]', { italic: true, size: 16, color: C.caption })],
          }))
        }
        if (caption) {
          kids.push(new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 0, after: 40 },
            children: [t(caption, { italic: true, size: 14, color: C.caption })],
          }))
        }
        return new TableCell({
          borders: border(C.midGrey),
          width: { size: thumbWidth, type: WidthType.DXA },
          shading: { fill: C.lightGrey, type: ShadingType.CLEAR },
          margins: { top: 40, bottom: 40, left: 80, right: 80 },
          children: kids,
        })
      })

      // Pad row to 3 cells
      while (cells.length < 3) {
        cells.push(new TableCell({
          borders: border(C.midGrey),
          width: { size: thumbWidth, type: WidthType.DXA },
          shading: { fill: C.lightGrey, type: ShadingType.CLEAR },
          margins: { top: 40, bottom: 40, left: 80, right: 80 },
          children: [new Paragraph({ children: [] })],
        }))
      }

      results.push(
        new Table({
          width: { size: 9906, type: WidthType.DXA },
          columnWidths: [thumbWidth, thumbWidth, thumbWidth],
          rows: [new TableRow({ children: cells })],
        }),
        new Paragraph({ spacing: { before: 0, after: 60 }, children: [] }),
      )
    }

    results.push(new Paragraph({ spacing: { before: 0, after: 120 }, children: [] }))
  }

  return results
}

// ── Main export ───────────────────────────────────────────────────────────────
export async function buildReportDocx(data: ReportData): Promise<Buffer> {
  console.log(`[REPORT] Building Word document for ${data.propertyName}`)

  // Determine active sections (filter by property flags)
  const activeSections = SECTION_ORDER.filter(key => {
    const flag = SECTION_FLAGS[key]
    if (flag && !data.propertyFlags[flag]) return false
    return true
  })

  // Group observations and photos by section
  const obsBySection = new Map<string, ReportObservation[]>()
  for (const obs of data.observations) {
    const arr = obsBySection.get(obs.section_key) ?? []
    arr.push(obs)
    obsBySection.set(obs.section_key, arr)
  }

  // Group ALL photos per observation (Map stores an array, not a single photo,
  // so multiple photos on the same observation are all included in the grid).
  const photosByObsId = new Map<string, ReportPhoto[]>()
  for (const photo of data.photos) {
    if (photo.observation_id) {
      const arr = photosByObsId.get(photo.observation_id) ?? []
      arr.push(photo)
      photosByObsId.set(photo.observation_id, arr)
    }
  }

  const photosBySection = new Map<string, ReportPhoto[]>()
  for (const obs of data.observations) {
    const obsPhotos = photosByObsId.get(obs.id) ?? []
    if (obsPhotos.length > 0) {
      const arr = photosBySection.get(obs.section_key) ?? []
      arr.push(...obsPhotos)
      photosBySection.set(obs.section_key, arr)
    }
  }
  // Also include unlinked photos in additional section
  const unlinked = data.photos.filter(p => !p.observation_id)
  if (unlinked.length > 0) {
    const arr = photosBySection.get('additional') ?? []
    photosBySection.set('additional', [...arr, ...unlinked])
  }

  const children: (Paragraph | Table)[] = []

  // ── Inspection details ────────────────────────────────────────────────────
  children.push(buildInspectionDetailsTable(data))
  children.push(new Paragraph({ spacing: { before: 0, after: 120 }, children: [] }))

  // ── Overall condition summary ─────────────────────────────────────────────
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 240, after: 120 },
      children: [t('Overall Condition Summary', { bold: true, size: 28, color: C.navy })],
    }),
    summaryBox(data.overallSummary),
    new Paragraph({ spacing: { before: 0, after: 120 }, children: [] }),
  )

  // ── Observations heading + intro ──────────────────────────────────────────
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 240, after: 120 },
      children: [t('Observations', { bold: true, size: 28, color: C.navy })],
    }),
    new Paragraph({
      spacing: { before: 60, after: 60 },
      children: [t('Each section records observations made during the inspection together with the required action and indicative risk level. Sections marked as not applicable have been omitted where the relevant facilities are not present at this property.', { size: 20 })],
    }),
  )

  // ── Observation sections ──────────────────────────────────────────────────
  for (let i = 0; i < activeSections.length; i++) {
    const sectionKey   = activeSections[i]
    const label        = SECTION_LABELS[sectionKey] ?? sectionKey
    const observations = obsBySection.get(sectionKey) ?? []
    const photos       = photosBySection.get(sectionKey) ?? []

    children.push(sectionSubHeading(label, i, `section_${sectionKey}`))

    if (observations.length === 0) {
      children.push(
        new Paragraph({
          spacing: { before: 60, after: 80 },
          children: [t('No observations recorded for this area during this inspection.', { size: 20 })],
        }),
        actionBox(null),
        new Paragraph({ spacing: { before: 0, after: 100 }, children: [] }),
      )
    } else {
      for (const obs of observations) {
        children.push(
          new Paragraph({
            spacing: { before: 60, after: obs.action_text ? 80 : 60 },
            children: [t(obs.processed_text, { size: 20 })],
          }),
        )
        children.push(
          actionBox(obs.action_text),
          new Paragraph({ spacing: { before: 0, after: 100 }, children: [] }),
        )
      }
    }

    // Photo grid for this section
    const photoElements = photoGrid(label, photos)
    if (photoElements.length > 0) {
      children.push(...photoElements)
    }
    children.push(new Paragraph({ spacing: { before: 0, after: 160 }, children: [] }))
  }

  // ── Actions summary ───────────────────────────────────────────────────────
  children.push(...buildActionsSummary(data.observations, SECTION_LABELS))

  // ── Recurring items ───────────────────────────────────────────────────────
  children.push(...buildRecurringItems(data.recurringItems))

  // ── Photo appendix ────────────────────────────────────────────────────────
  children.push(...buildPhotoAppendix(activeSections, photosBySection))

  // ── Inspector declaration ─────────────────────────────────────────────────
  children.push(...buildDeclaration(data.inspectorName, data.inspectorTitle, data.inspectionDate, data.reportGeneratedAt))

  const doc = new Document({
    styles: {
      default: { document: { run: { font: 'Arial', size: 20 } } },
      paragraphStyles: [
        {
          id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 28, bold: true, color: C.navy, font: 'Arial' },
          paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 0 },
        },
        {
          id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 24, bold: true, color: C.midBlue, font: 'Arial' },
          paragraph: { spacing: { before: 200, after: 80 }, outlineLevel: 1 },
        },
      ],
    },
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 1000, right: 1000, bottom: 1000, left: 1000, header: 708, footer: 708 },
        },
      },
      headers: { default: buildHeader() },
      footers: { default: buildFooter() },
      children,
    }],
  })

  const buffer = await Packer.toBuffer(doc)
  console.log(`[REPORT] Word document built — ${buffer.byteLength} bytes`)
  return buffer
}
