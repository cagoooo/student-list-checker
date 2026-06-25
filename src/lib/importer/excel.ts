import * as XLSX from 'xlsx'
import type { ColumnMap } from '../../types'
import type { CandidateTable } from './types'
import { ROW_NUMBER_KEY, normalizeHeaders, toText } from './normalize'

export { normalizeHeaders }

export function detectColumns(headers: string[]): ColumnMap {
  const pick = (patterns: RegExp[]) => headers.find((header) => patterns.some((pattern) => pattern.test(header)))

  return {
    classKey: pick([/^班級$/, /班別|班序|班級名稱|class/i]),
    gradeKey: pick([/^年級$/, /就讀年級|grade/i]),
    seatKey: pick([/^座號$/, /座號碼|座次|seat/i]),
    nameKey: pick([/^學生姓名$/, /^姓名$/, /學生.*姓名|姓名|name/i]),
  }
}

export function findHeaderRow(rows: unknown[][]) {
  let bestIndex = 0
  let bestScore = -1

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

  return bestIndex
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
    const headerIndex = findHeaderRow(sheetRows)
    const headers = normalizeHeaders(sheetRows[headerIndex] ?? [])
    const rows = sheetRows
      .slice(headerIndex + 1)
      .map((row, index) => toRecord(row, headers, headerIndex + index + 2))
      .filter((row) =>
        Object.entries(row)
          .filter(([key]) => !key.startsWith('__'))
          .some(([, value]) => toText(value) !== ''),
      )

    return {
      id: `${sheetName}-${headerIndex + 1}`,
      sourceName,
      sheetName,
      headerRow: headerIndex + 1,
      headers,
      rows,
      rowCount: rows.length,
    }
  })
}
