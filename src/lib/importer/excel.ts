import * as XLSX from 'xlsx'
import type { ColumnMap } from '../../types'
import type { CandidateTable } from './types'
import { ROW_NUMBER_KEY, SOURCE_LOCATION_KEY, normalizeHeaders, toText } from './normalize'

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

const SHEET_CLASS_KEY = '班級'

function sheetNameClassCode(sheetName: string) {
  const compact = sheetName.replace(/\s/g, '')
  return /^\d{3}$/.test(compact) ? compact : ''
}

export function parseExcelTables(buffer: ArrayBuffer, sourceName: string): CandidateTable[] {
  const workbook = XLSX.read(buffer, { type: 'array' })
  const tables = workbook.SheetNames.map((sheetName) => {
    const sheet = workbook.Sheets[sheetName]
    const sheetRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: '',
      raw: false,
    })
    const { headers, headerless, headerIndex } = resolveHeader(sheetRows)
    const dataStart = headerless ? 0 : headerIndex + 1
    const headerRow = headerless ? 0 : headerIndex + 1
    const classCode = sheetNameClassCode(sheetName)
    const resolvedHeaders = classCode && !headers.includes(SHEET_CLASS_KEY) ? [...headers, SHEET_CLASS_KEY] : headers
    const rows = sheetRows
      .slice(dataStart)
      .map((row, index) => {
        const record = toRecord(row, headers, dataStart + index + 1)
        record[SOURCE_LOCATION_KEY] = sheetName
        if (classCode) record[SHEET_CLASS_KEY] = classCode
        return record
      })
      .filter((row) =>
        Object.entries(row)
          .filter(([key]) => !key.startsWith('__') && key !== SHEET_CLASS_KEY)
          .some(([, value]) => toText(value) !== ''),
      )

    const parsedTable = {
      id: `${sheetName}-${headerRow}`,
      sourceName,
      sheetName,
      headerRow,
      headers: resolvedHeaders,
      rows,
      rowCount: rows.length,
      rawRows: sheetRows.map((row) => row.map((cell) => toText(cell))),
    }

    return tryFlattenCertificationMatrix(tryFlattenHorizontalTable(parsedTable))
  })

  return addCombinedCertificationMatrixTable(addCombinedClassSheetTable(tables, sourceName), sourceName)
}

function isClassCode(value: string) {
  return /^\d{3}$/.test(value)
}

function isSeatNo(value: string) {
  if (!/^\d{1,2}$/.test(value)) return false
  const seat = Number(value)
  return seat >= 1 && seat <= 45
}

function isChineseName(value: string) {
  return /^[\u4e00-\u9fff]{2,5}$/.test(value.replace(/\s/g, ''))
}

function tryFlattenCertificationMatrix(table: CandidateTable): CandidateTable {
  const rawRows = table.rawRows || []
  if (rawRows.length === 0) return table

  let headerIndex = -1
  let classColumns: { col: number; classCode: string }[] = []

  rawRows.slice(0, 20).some((row, index) => {
    const columns = row
      .map((cell, col) => ({ col, classCode: cell.trim() }))
      .filter(({ col, classCode }) => col > 0 && isClassCode(classCode))

    if (columns.length < 3) return false

    const followingRows = rawRows.slice(index + 1, index + 11)
    const seatRows = followingRows.filter((dataRow) => isSeatNo(dataRow[0]?.trim() || '')).length
    const nameCells = followingRows.reduce(
      (count, dataRow) => count + columns.filter(({ col }) => isChineseName(dataRow[col]?.trim() || '')).length,
      0,
    )

    if (seatRows < 2 || nameCells < 3) return false

    headerIndex = index
    classColumns = columns
    return true
  })

  if (headerIndex < 0) return table

  const certificationName = toText(rawRows[headerIndex][0]) || table.sheetName || ''
  const flattenedRows: Record<string, unknown>[] = []

  rawRows.slice(headerIndex + 1).forEach((row, rowOffset) => {
    const seatVal = row[0]?.trim() || ''
    if (!isSeatNo(seatVal)) return

    classColumns.forEach(({ col, classCode }) => {
      const nameVal = row[col]?.trim() || ''
      if (!isChineseName(nameVal)) return

      flattenedRows.push({
        [ROW_NUMBER_KEY]: headerIndex + rowOffset + 2,
        [SOURCE_LOCATION_KEY]: table.sheetName,
        '班級': classCode,
        '座號': seatVal,
        '姓名': nameVal,
        '認證': certificationName,
      })
    })
  })

  if (flattenedRows.length === 0) return table

  return {
    ...table,
    id: `${table.sheetName}-certification-matrix`,
    headerRow: headerIndex + 1,
    headers: ['班級', '座號', '姓名', '認證'],
    rows: flattenedRows,
    rowCount: flattenedRows.length,
  }
}

function tryFlattenHorizontalTable(table: CandidateTable): CandidateTable {
  const rawRows = table.rawRows || []
  if (rawRows.length === 0) return table

  const nameCols: { col: number; key: string }[] = []
  const seatCols: { col: number; key: string }[] = []
  table.headers.forEach((header, colIdx) => {
    const cleanHeader = header.replace(/_\d+$/, '') // 移除重複字尾
    if (/^姓名$/.test(cleanHeader) || /^學生姓名$/.test(cleanHeader)) {
      nameCols.push({ col: colIdx, key: header })
    }
    if (/^座號$/.test(cleanHeader) || /^座次$/.test(cleanHeader)) {
      seatCols.push({ col: colIdx, key: header })
    }
  })

  // 如果姓名欄位不多於 1 個，不進行展開
  if (nameCols.length <= 1) return table

  // 尋找工作表前幾行中所有包含班級標籤的 cells
  const classLocators: { col: number; className: string }[] = []
  rawRows.slice(0, 10).forEach((row) => {
    row.forEach((cell, colIdx) => {
      const val = cell.trim()
      // 匹配 1年1班, 一年甲班, 101 等
      if (/^\d年\d班$/.test(val) || /^[一二三四五六]年[一二三四五六七八九十]+班$/.test(val) || /^\d{3}$/.test(val)) {
        classLocators.push({ col: colIdx, className: val })
      }
    })
  })

  const flattenedRows: Record<string, unknown>[] = []
  const headerRow = table.headerRow || 1
  const dataRows = rawRows.slice(headerRow)

  dataRows.forEach((row, index) => {
    const rowNo = headerRow + index + 1 // 1-based row number
    nameCols.forEach(({ col: nameCol }) => {
      const nameVal = row[nameCol]?.trim() || ''
      if (!nameVal || nameVal === '姓名' || nameVal === '學生姓名') return

      // 找最近的座號
      let bestSeatCol = -1
      let minSeatDist = Infinity
      seatCols.forEach(({ col: seatCol }) => {
        const dist = Math.abs(seatCol - nameCol)
        if (dist < minSeatDist) {
          minSeatDist = dist
          bestSeatCol = seatCol
        }
      })
      const seatVal = bestSeatCol !== -1 ? row[bestSeatCol]?.trim() || '' : ''

      // 找最近的班級
      let bestClassName = ''
      let minClassDist = Infinity
      classLocators.forEach((loc) => {
        const dist = Math.abs(loc.col - nameCol)
        if (dist < minClassDist) {
          minClassDist = dist
          bestClassName = loc.className
        }
      })

      const record: Record<string, unknown> = {
        [ROW_NUMBER_KEY]: rowNo,
        [SOURCE_LOCATION_KEY]: table.sheetName,
        '班級': bestClassName,
        '座號': seatVal,
        '姓名': nameVal,
      }
      flattenedRows.push(record)
    })
  })

  return {
    ...table,
    headers: ['班級', '座號', '姓名'],
    rows: flattenedRows,
    rowCount: flattenedRows.length,
  }
}

function addCombinedClassSheetTable(tables: CandidateTable[], sourceName: string) {
  const classSheetTables = tables.filter((table) => table.sheetName && sheetNameClassCode(table.sheetName))
  if (classSheetTables.length < 2) return tables

  const firstHeaders = classSheetTables[0].headers
  const sameHeaders = classSheetTables.every((table) => table.headers.join('\u0000') === firstHeaders.join('\u0000'))
  if (!sameHeaders) return tables

  const combinedRows = classSheetTables.flatMap((table) => table.rows)
  const combinedTable: CandidateTable = {
    id: `combined-class-sheets-${classSheetTables.length}`,
    sourceName,
    sheetName: classSheetTables.map((table) => table.sheetName).join('、'),
    headerRow: classSheetTables[0].headerRow,
    headers: firstHeaders,
    rows: combinedRows,
    rowCount: combinedRows.length,
  }

  return [combinedTable, ...tables]
}

function addCombinedCertificationMatrixTable(tables: CandidateTable[], sourceName: string) {
  const certificationTables = tables.filter((table) => table.id.endsWith('-certification-matrix'))
  if (certificationTables.length < 2) return tables

  const combinedRows = certificationTables.flatMap((table) => table.rows)
  const combinedTable: CandidateTable = {
    id: `combined-certification-matrix-${certificationTables.length}`,
    sourceName,
    sheetName: certificationTables.map((table) => table.sheetName).join('、'),
    headerRow: certificationTables[0].headerRow,
    headers: ['班級', '座號', '姓名', '認證'],
    rows: combinedRows,
    rowCount: combinedRows.length,
  }

  return [combinedTable, ...tables]
}
