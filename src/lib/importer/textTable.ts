import type { CandidateTable } from './types'
import { resolveHeader, toRecord } from './excel'
import { SOURCE_LOCATION_KEY, toText } from './normalize'

export type TextRow = { text: string; page?: number }

export type TextTableOptions = {
  idPrefix?: string
  sheetName?: string
}

// 切欄策略：若一列存在 tab 或 2 格以上空白（代表欄位間距較大），優先用它切欄，
// 避免把含單一空白的姓名（例如複姓或外籍生）誤切；否則退回單一空白切分。
export function splitCells(line: string): string[] {
  const source = line.trim()
  if (!source) return []
  const pattern = /\t|\s{2,}/.test(source) ? /\t|\s{2,}/ : /\s+/
  return source
    .split(pattern)
    .map((cell) => cell.trim())
    .filter(Boolean)
}

export function tablesFromTextRows(
  rows: TextRow[],
  sourceName: string,
  options: TextTableOptions = {},
): CandidateTable[] {
  const { idPrefix = 'text', sheetName = '文字表格' } = options
  const parsed = rows
    .map((row) => ({ cells: splitCells(row.text), page: row.page }))
    .filter((row) => row.cells.length >= 3)

  if (parsed.length === 0) return []

  const cellRows = parsed.map((row) => row.cells)
  const { headers, headerless, headerIndex } = resolveHeader(cellRows)
  const dataStart = headerless ? 0 : headerIndex + 1
  const headerRow = headerless ? 0 : headerIndex + 1
  const dataRows = parsed
    .slice(dataStart)
    .map((row, index) => {
      const record = toRecord(row.cells, headers, dataStart + index + 1)
      if (row.page) record[SOURCE_LOCATION_KEY] = `第 ${row.page} 頁`
      return record
    })
    .filter((row) =>
      Object.entries(row)
        .filter(([key]) => !key.startsWith('__'))
        .some(([, value]) => toText(value) !== ''),
    )

  return [
    {
      id: `${idPrefix}-text-table-1`,
      sourceName,
      sheetName,
      headerRow,
      headers,
      rows: dataRows,
      rowCount: dataRows.length,
      rawRows: cellRows,
    },
  ]
}

export function tablesFromTextLines(
  lines: string[],
  sourceName: string,
  options: TextTableOptions = {},
): CandidateTable[] {
  return tablesFromTextRows(
    lines.map((text) => ({ text })),
    sourceName,
    options,
  )
}
