import type { CandidateTable } from './types'
import { findHeaderRow, normalizeHeaders, toRecord } from './excel'
import { toText } from './normalize'
import { tablesFromTextLines } from './textTable'

export async function parseWordRoster(file: File): Promise<CandidateTable[]> {
  if (/\.docx$/i.test(file.name)) return parseWordTables(file)
  return parseLegacyDocTables(file)
}

export async function parseWordTables(file: File): Promise<CandidateTable[]> {
  const mammoth = await import('mammoth')
  const result = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() })
  return tablesFromHtml(result.value, file.name)
}

// 舊版 .doc（Word 97-2003 OLE 二進位）無法用 mammoth 解析，這裡盡力從位元組中
// 還原可讀文字（多為 UTF-16LE），再交給文字表格抽取器。屬 best-effort，失敗時
// 會退回「請先轉成 Excel / CSV」的提示。
export async function parseLegacyDocTables(file: File): Promise<CandidateTable[]> {
  const text = decodeDocBytes(await file.arrayBuffer())
  const lines = extractDocTextLines(text)
  return tablesFromTextLines(lines, file.name, { idPrefix: 'doc', sheetName: 'Word（.doc）名單' })
}

export function decodeDocBytes(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  const utf16 = new TextDecoder('utf-16le', { fatal: false }).decode(bytes)
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
  return countCjk(utf16) >= countCjk(utf8) ? utf16 : utf8
}

const REPLACEMENT_CODE = 0xfffd

// .doc 段落結尾為 CR、表格儲存格標記為控制字元。逐字元判斷字碼：換行字元轉為斷行、
// 其他控制字元轉成 tab 欄位分隔，再過濾出含中文或數字的可讀列（避免在原始碼放控制字元）。
export function extractDocTextLines(text: string): string[] {
  let normalized = ''
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0
    if (char === '\r' || char === '\n') {
      normalized += '\n'
    } else if (code === REPLACEMENT_CODE) {
      normalized += ' '
    } else if (code < 0x20 && char !== '\t') {
      normalized += '\t'
    } else {
      normalized += char
    }
  }

  return normalized
    .split('\n')
    .map((line) => line.replace(/\t+/g, '\t').replace(/[　 ]+/g, ' ').trim())
    .filter((line) => /[一-鿿\d]/.test(line))
}

function countCjk(text: string) {
  return (text.match(/[一-鿿]/g) ?? []).length
}

export function tablesFromHtml(html: string, sourceName: string): CandidateTable[] {
  const tableCandidates = tablesFromTableHtml(html, sourceName)
  const paragraphCandidates = tablesFromParagraphs(html, sourceName)
  return [...tableCandidates, ...paragraphCandidates]
}

function tablesFromTableHtml(html: string, sourceName: string): CandidateTable[] {
  const tableMatches = [...html.matchAll(/<table[\s\S]*?<\/table>/gi)]

  return tableMatches
    .map((match, index): CandidateTable | null => {
      const grid = parseTableGrid(match[0]).filter((row) => row.some((cell) => cell !== ''))
      if (grid.length === 0) return null

      const headerIndex = findHeaderRow(grid)
      const headers = normalizeHeaders(grid[headerIndex] ?? [])
      const dataRows = grid
        .slice(headerIndex + 1)
        .map((row, rowIndex) => toRecord(row, headers, headerIndex + rowIndex + 2))
        .filter((row) =>
          Object.entries(row)
            .filter(([key]) => !key.startsWith('__'))
            .some(([, value]) => toText(value) !== ''),
        )

      return {
        id: `word-table-${index + 1}`,
        sourceName,
        sheetName: `Word 表格 ${index + 1}`,
        headerRow: headerIndex + 1,
        headers,
        rows: dataRows,
        rowCount: dataRows.length,
      }
    })
    .filter((table): table is CandidateTable => table !== null)
}

// 段落型名單：移除表格後，把每個段落當成一列文字，交給共用文字表格抽取器處理。
function tablesFromParagraphs(html: string, sourceName: string): CandidateTable[] {
  const withoutTables = html.replace(/<table[\s\S]*?<\/table>/gi, '\n')
  const paragraphs = [...withoutTables.matchAll(/<(?:p|li)[^>]*>([\s\S]*?)<\/(?:p|li)>/gi)]
    .map((match) => cleanHtmlCell(match[1]))
    .filter(Boolean)

  return tablesFromTextLines(paragraphs, sourceName, {
    idPrefix: 'word-paragraph',
    sheetName: 'Word 段落名單',
  })
}

// 將含 colspan / rowspan 的 HTML 表格還原成對齊的網格，避免合併儲存格造成欄位錯位。
export function parseTableGrid(tableHtml: string): string[][] {
  const rowMatches = [...tableHtml.matchAll(/<tr[\s\S]*?<\/tr>/gi)]
  const grid: string[][] = []
  const carry: Array<{ text: string; remaining: number } | null> = []

  rowMatches.forEach(() => grid.push([]))

  rowMatches.forEach((rowMatch, rowIndex) => {
    const row = grid[rowIndex]
    const cells = [...rowMatch[0].matchAll(/<t[dh]([^>]*)>([\s\S]*?)<\/t[dh]>/gi)].map((cell) => ({
      attrs: cell[1],
      text: cleanHtmlCell(cell[2]),
    }))

    let col = 0
    const fillCarried = () => {
      while (carry[col]) {
        const carried = carry[col]
        if (!carried) break
        row[col] = carried.text
        carried.remaining -= 1
        if (carried.remaining <= 0) carry[col] = null
        col += 1
      }
    }

    fillCarried()
    cells.forEach((cell) => {
      fillCarried()
      const colspan = Math.max(1, readSpan(cell.attrs, 'colspan'))
      const rowspan = Math.max(1, readSpan(cell.attrs, 'rowspan'))
      for (let offset = 0; offset < colspan; offset += 1) {
        const text = offset === 0 ? cell.text : ''
        row[col] = text
        if (rowspan > 1) carry[col] = { text, remaining: rowspan - 1 }
        col += 1
      }
      fillCarried()
    })
  })

  return grid.map((row) => Array.from(row, (cell) => cell ?? ''))
}

function readSpan(attrs: string, name: string): number {
  const match = attrs.match(new RegExp(`${name}\\s*=\\s*["']?(\\d+)`, 'i'))
  return match ? Number(match[1]) : 1
}

function cleanHtmlCell(value: string) {
  return decodeHtmlEntities(value.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
}
