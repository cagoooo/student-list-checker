import type { CandidateTable } from './types'
import { findHeaderRow, normalizeHeaders, toRecord } from './excel'
import { toText } from './normalize'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url'

type PdfTextItem = {
  str: string
  transform: number[]
}

export async function parsePdfTables(file: File): Promise<CandidateTable[]> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  const lines: string[] = []

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber)
    const content = await page.getTextContent()
    const textItems: PdfTextItem[] = []
    content.items.forEach((item) => {
      if (isPdfTextItem(item)) textItems.push(item)
    })
    lines.push(...textItemsToLines(textItems))
  }

  return tablesFromTextLines(lines, file.name)
}

export function tablesFromTextLines(lines: string[], sourceName: string): CandidateTable[] {
  const parsedRows = lines
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(/\s{1,}|\t/).filter(Boolean))
    .filter((row) => row.length >= 3)

  if (parsedRows.length === 0) return []

  const headerIndex = findHeaderRow(parsedRows)
  const headers = normalizeHeaders(parsedRows[headerIndex] ?? [])
  const rows = parsedRows
    .slice(headerIndex + 1)
    .map((row, index) => toRecord(row, headers, headerIndex + index + 2))
    .filter((row) =>
      Object.entries(row)
        .filter(([key]) => !key.startsWith('__'))
        .some(([, value]) => toText(value) !== ''),
    )

  return [
    {
      id: 'pdf-text-table-1',
      sourceName,
      sheetName: 'PDF 文字表格',
      headerRow: headerIndex + 1,
      headers,
      rows,
      rowCount: rows.length,
    },
  ]
}

function textItemsToLines(items: PdfTextItem[]) {
  const sortedItems = items
    .map((item) => ({ text: item.str.trim(), x: item.transform[4] ?? 0, y: item.transform[5] ?? 0 }))
    .filter((item) => item.text !== '')
    .sort((a, b) => b.y - a.y || a.x - b.x)

  const lines: Array<{ y: number; items: Array<{ text: string; x: number }> }> = []
  sortedItems.forEach((item) => {
    const line = lines.find((current) => Math.abs(current.y - item.y) <= 4)
    if (line) {
      line.items.push({ text: item.text, x: item.x })
      return
    }

    lines.push({ y: item.y, items: [{ text: item.text, x: item.x }] })
  })

  return lines.map((line) =>
    line.items
      .sort((a, b) => a.x - b.x)
      .map((item) => item.text)
      .join(' '),
  )
}

function isPdfTextItem(item: unknown): item is PdfTextItem {
  return (
    typeof item === 'object' &&
    item !== null &&
    'str' in item &&
    'transform' in item &&
    typeof item.str === 'string' &&
    Array.isArray(item.transform)
  )
}
