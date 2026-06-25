export type CorrectedRosterEntry = {
  status: string
  sourceLabel?: string
  className: string
  seatNo: string
  name: string
  issue: string
}

const COLUMNS = ['狀態', '來源', '班級', '座號', '姓名', '提示'] as const

// 將校對後的名單輸出成 .docx，方便處室直接拿修正版 Word 接續行政流程。
// docx 套件採動態載入，不會進入主要 bundle。
export async function buildCorrectedWordBlob(title: string, entries: CorrectedRosterEntry[]): Promise<Blob> {
  const { Document, Packer, Paragraph, Table, TableCell, TableRow, TextRun, HeadingLevel, WidthType } = await import('docx')

  const headerCells = COLUMNS.map(
    (label) =>
      new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: label, bold: true })] })],
      }),
  )

  const bodyRows = entries.map(
    (entry) =>
      new TableRow({
        children: [
          entry.status,
          entry.sourceLabel || '—',
          entry.className || '',
          entry.seatNo || '',
          entry.name || '',
          entry.issue || '',
        ].map((value) => new TableCell({ children: [new Paragraph(value)] })),
      }),
  )

  const document = new Document({
    sections: [
      {
        children: [
          new Paragraph({ text: title, heading: HeadingLevel.HEADING_1 }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [new TableRow({ children: headerCells }), ...bodyRows],
          }),
        ],
      },
    ],
  })

  return Packer.toBlob(document)
}
