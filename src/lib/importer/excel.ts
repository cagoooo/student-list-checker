import * as XLSX from 'xlsx'
import type { ColumnMap } from '../../types'
import type { CandidateTable } from './types'
import { ROW_NUMBER_KEY, normalizeHeaders, toText } from './normalize'

export { normalizeHeaders }

export function detectColumns(headers: string[]): ColumnMap {
  const pick = (patterns: RegExp[]) => headers.find((header) => patterns.some((pattern) => pattern.test(header)))

  return {
    classSeatKey: pick([/^班級座號$/, /班.*座號|座號.*班/]),
    classKey: pick([/^班級$/, /班別|班序|班級名稱|class/i]),
    gradeKey: pick([/^年級$/, /就讀年級|grade/i]),
    seatKey: pick([/^座號$/, /座號碼|座次|seat/i]),
    nameKey: pick([/^學生姓名$/, /^姓名$/, /\*?姓名|\*?學生.*姓名|name/i]),
  }
}

// 找出最像「標題列」的列；若前 30 列都沒有任何可辨識欄名（score 全為 0），回傳 -1
// 代表這份檔案沒有可辨識的標題列。
export function findHeaderRow(rows: unknown[][]) {
  let bestIndex = 0
  let bestScore = 0

  rows.slice(0, 30).forEach((row, index) => {
    const headers = normalizeHeaders(row)
    const detected = detectColumns(headers)
    const score =
      (detected.nameKey ? 3 : 0) +
      (detected.seatKey ? 3 : 0) +
      (detected.classKey ? 2 : 0) +
      (detected.gradeKey ? 2 : 0)

    if (score > bestScore) {
      bestIndex = index
      bestScore = score
    }
  })

  return bestScore > 0 ? bestIndex : -1
}

// 一列若同時出現「中文姓名樣態」與「合理座號樣態」，就把它當成資料列而非標題列。
function looksLikeDataRow(row: unknown[]) {
  const values = row.map((cell) => toText(cell)).filter(Boolean)
  const hasName = values.some((value) => /^[一-鿿]{2,5}$/.test(value.replace(/\s/g, '')))
  const hasSeat = values.some((value) => /^\d{1,2}$/.test(value) && Number(value) >= 1 && Number(value) <= 40)
  return hasName && hasSeat
}

export type ResolvedHeader = {
  headerIndex: number
  headers: string[]
  headerless: boolean
}

// 統一決定標題列：找得到→用該列當標題；找不到但首列像資料→視為無標題列、合成欄名（欄位1…N）
// 並把整份都當資料；找不到且首列不像資料→仍把首列當標題（只是欄名我們不認得）。
export function resolveHeader(rows: unknown[][]): ResolvedHeader {
  const headerIndex = findHeaderRow(rows)

  if (headerIndex < 0 && rows.length > 0 && looksLikeDataRow(rows[0])) {
    const width = rows.reduce((max, row) => Math.max(max, row.length), 0)
    const headers = normalizeHeaders(new Array(width).fill(''))
    return { headerIndex: -1, headers, headerless: true }
  }

  const index = headerIndex < 0 ? 0 : headerIndex
  return { headerIndex: index, headers: normalizeHeaders(rows[index] ?? []), headerless: false }
}

export function hasRowContent(row: Record<string, unknown>) {
  return Object.entries(row)
    .filter(([key]) => !key.startsWith('__'))
    .some(([, value]) => toText(value) !== '')
}

// 依指定的標題列（1-based；0 或負數代表無標題列）重建欄名與資料列。headerRow 省略時走自動判定。
export function buildFrameFromRows(rawRows: unknown[][], headerRowOverride?: number) {
  let headers: string[]
  let dataStart: number
  let headerRow: number

  if (headerRowOverride === undefined) {
    const resolved = resolveHeader(rawRows)
    headers = resolved.headers
    dataStart = resolved.headerless ? 0 : resolved.headerIndex + 1
    headerRow = resolved.headerless ? 0 : resolved.headerIndex + 1
  } else if (headerRowOverride <= 0) {
    const width = rawRows.reduce((max, row) => Math.max(max, row.length), 0)
    headers = normalizeHeaders(new Array(width).fill(''))
    dataStart = 0
    headerRow = 0
  } else {
    const index = headerRowOverride - 1
    headers = normalizeHeaders(rawRows[index] ?? [])
    dataStart = index + 1
    headerRow = headerRowOverride
  }

  const rows = rawRows
    .slice(dataStart)
    .map((row, index) => toRecord(row, headers, dataStart + index + 1))
    .filter(hasRowContent)

  return { headerRow, headers, rows, rowCount: rows.length }
}

export function toRecord(row: unknown[], headers: string[], rowNo: number): Record<string, unknown> {
  const record: Record<string, unknown> = { [ROW_NUMBER_KEY]: rowNo }
  headers.forEach((header, index) => {
    record[header] = row[index] ?? ''
  })
  return record
}

export function parseExcelTables(buffer: ArrayBuffer, sourceName: string): CandidateTable[] {
  const workbook = XLSX.read(buffer, { type: 'array' })
  return workbook.SheetNames.map((sheetName) => {
    const sheet = workbook.Sheets[sheetName]
    const sheetRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: '',
      raw: false,
    })
    const { headers, headerless, headerIndex } = resolveHeader(sheetRows)
    const dataStart = headerless ? 0 : headerIndex + 1
    const headerRow = headerless ? 0 : headerIndex + 1
    const rows = sheetRows
      .slice(dataStart)
      .map((row, index) => toRecord(row, headers, dataStart + index + 1))
      .filter((row) =>
        Object.entries(row)
          .filter(([key]) => !key.startsWith('__'))
          .some(([, value]) => toText(value) !== ''),
      )

    return {
      id: `${sheetName}-${headerRow}`,
      sourceName,
      sheetName,
      headerRow,
      headers,
      rows,
      rowCount: rows.length,
      rawRows: sheetRows.map((row) => row.map((cell) => toText(cell))),
    }
  })
}
