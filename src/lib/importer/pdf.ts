import type { CandidateTable } from './types'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url'
import { tablesFromTextLines, tablesFromTextRows, type TextRow } from './textTable'

export { tablesFromTextLines, tablesFromTextRows }

type PdfTextItem = {
  str: string
  transform: number[]
  width?: number
}

const PDF_TABLE_OPTIONS = { idPrefix: 'pdf', sheetName: 'PDF 文字表格' }

export async function parsePdfTables(file: File): Promise<CandidateTable[]> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  const rows: TextRow[] = []

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber)
    const content = await page.getTextContent()
    const textItems: PdfTextItem[] = []
    content.items.forEach((item) => {
      if (isPdfTextItem(item)) textItems.push(item)
    })
    rows.push(...textItemsToRows(textItems, pageNumber))
  }

  return tablesFromTextRows(rows, file.name, PDF_TABLE_OPTIONS)
}

type PositionedItem = { text: string; x: number; y: number; width: number }

export function textItemsToRows(items: PdfTextItem[], page: number): TextRow[] {
  const positioned: PositionedItem[] = items
    .map((item) => ({
      text: item.str.trim(),
      x: item.transform[4] ?? 0,
      y: item.transform[5] ?? 0,
      width: item.width ?? 0,
    }))
    .filter((item) => item.text !== '')

  const lines: Array<{ y: number; items: PositionedItem[] }> = []
  positioned
    .sort((a, b) => b.y - a.y || a.x - b.x)
    .forEach((item) => {
      const line = lines.find((current) => Math.abs(current.y - item.y) <= 4)
      if (line) {
        line.items.push(item)
        return
      }
      lines.push({ y: item.y, items: [item] })
    })

  return lines.map((line) => ({ text: joinLineItems(line.items), page }))
}

// 用文字項寬度估每個字的平均寬度，若兩個相鄰文字項之間的空隙明顯大於字寬，
// 視為欄位分隔，插入 tab，讓多欄版面能正確切欄。
function joinLineItems(items: PositionedItem[]): string {
  const sorted = items.sort((a, b) => a.x - b.x)
  const totalWidth = sorted.reduce((sum, item) => sum + item.width, 0)
  const totalChars = sorted.reduce((sum, item) => sum + Math.max(item.text.length, 1), 0)
  const avgCharWidth = totalChars > 0 ? totalWidth / totalChars : 0

  return sorted.reduce((text, item, index) => {
    if (index === 0) return item.text
    const prev = sorted[index - 1]
    const gap = item.x - (prev.x + prev.width)
    const columnGap = avgCharWidth > 0 ? avgCharWidth * 1.5 : 6
    const separator = gap > columnGap ? '\t' : ' '
    return text + separator + item.text
  }, '')
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
