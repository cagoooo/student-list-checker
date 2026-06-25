import type { ColumnMap } from '../../types'
import { detectColumns } from './excel'
import { toText } from './normalize'
import type { CandidateTable, FieldDetection } from './types'

type ColumnScore = {
  header: string
  classScore: number
  seatScore: number
  nameScore: number
}

function sampleValues(table: CandidateTable, header: string) {
  return table.rows
    .slice(0, 30)
    .map((row) => toText(row[header]))
    .filter(Boolean)
}

function ratio(values: string[], predicate: (value: string) => boolean) {
  if (values.length === 0) return 0
  return values.filter(predicate).length / values.length
}

function scoreSeat(values: string[]) {
  return ratio(values, (value) => /^\d{1,2}$/.test(value) && Number(value) >= 1 && Number(value) <= 40)
}

function scoreClass(values: string[]) {
  return ratio(values, (value) => {
    const compact = value.replace(/\s/g, '')
    return /^(\d{3}|\d年\d班|[一二三四五六]年[一二三四五六七八九]班?)$/.test(compact)
  })
}

function scoreName(values: string[]) {
  return ratio(values, (value) => /^[\u4e00-\u9fff]{2,5}$/.test(value.replace(/\s/g, '')))
}

function best(scores: ColumnScore[], key: 'classScore' | 'seatScore' | 'nameScore') {
  const sorted = scores.slice().sort((a, b) => b[key] - a[key])
  return sorted[0]?.[key] > 0 ? sorted[0] : undefined
}

export function detectRosterFields(table: CandidateTable): FieldDetection {
  const headerMap = detectColumns(table.headers)
  const scores = table.headers.map((header) => {
    const values = sampleValues(table, header)
    return {
      header,
      classScore: scoreClass(values),
      seatScore: scoreSeat(values),
      nameScore: scoreName(values),
    }
  })

  const bestClass = best(scores, 'classScore')
  const bestSeat = best(scores, 'seatScore')
  const bestName = best(scores, 'nameScore')
  const columnMap: ColumnMap = {
    classKey: headerMap.classKey ?? bestClass?.header,
    gradeKey: headerMap.gradeKey,
    seatKey: headerMap.seatKey ?? bestSeat?.header,
    nameKey: headerMap.nameKey ?? bestName?.header,
  }

  const reasons: string[] = [`欄位列：第 ${table.headerRow} 列`, `資料筆數：${table.rowCount} 筆`]
  const warnings: string[] = []
  let confidence = 0

  if (columnMap.nameKey) confidence += headerMap.nameKey ? 30 : Math.round((bestName?.nameScore ?? 0) * 25)
  if (columnMap.seatKey) confidence += headerMap.seatKey ? 30 : Math.round((bestSeat?.seatScore ?? 0) * 25)
  if (columnMap.classKey) confidence += headerMap.classKey ? 25 : Math.round((bestClass?.classScore ?? 0) * 20)
  if (columnMap.gradeKey) confidence += 10

  if (!columnMap.nameKey) warnings.push('找不到姓名欄位')
  if (!columnMap.seatKey) warnings.push('找不到座號欄位')
  if (!columnMap.classKey && !columnMap.gradeKey) warnings.push('找不到班級或年級欄位')
  if (confidence < 85 && warnings.length === 0) warnings.push('欄位由內容推測，建議老師確認後再套用結果')

  return {
    columnMap,
    confidence: Math.min(100, confidence),
    reasons,
    warnings,
  }
}
