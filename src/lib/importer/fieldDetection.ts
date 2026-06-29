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

// 偵測「班級座號」合併欄位，如 60501 = 班級605 + 座號01
function scoreCombinedClassSeat(values: string[]) {
  return ratio(values, (value) => {
    if (!/^\d{5}$/.test(value)) return false
    const seat = Number(value.slice(3))
    return seat >= 1 && seat <= 45
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
      combinedScore: scoreCombinedClassSeat(values),
    }
  })

  const bestClass = best(
    scores.filter((score) => score.header !== headerMap.seatKey && score.header !== headerMap.nameKey),
    'classScore',
  )
  const bestSeat = best(
    scores.filter((score) => score.header !== headerMap.classKey && score.header !== headerMap.gradeKey && score.header !== headerMap.nameKey),
    'seatScore',
  )
  const bestName = best(
    scores.filter((score) => score.header !== headerMap.classKey && score.header !== headerMap.gradeKey && score.header !== headerMap.seatKey),
    'nameScore',
  )

  // 偵測「班級座號」合併欄位（關鍵字或內容推測）
  const bestCombined = scores.slice().sort((a, b) => b.combinedScore - a.combinedScore)[0]
  const combinedByContent = !headerMap.classSeatKey && (bestCombined?.combinedScore ?? 0) > 0
    ? bestCombined?.header
    : undefined
  const resolvedClassSeatKey = headerMap.classSeatKey ?? combinedByContent

  const columnMap: ColumnMap = {
    classSeatKey: resolvedClassSeatKey,
    classKey: resolvedClassSeatKey ? undefined : (headerMap.classKey ?? bestClass?.header),
    gradeKey: headerMap.gradeKey,
    seatKey: resolvedClassSeatKey ? undefined : (headerMap.seatKey ?? bestSeat?.header),
    nameKey: headerMap.nameKey ?? bestName?.header,
  }

  const headerReason = table.headerRow > 0 ? `欄位列：第 ${table.headerRow} 列` : '欄位列：無標題列，由內容推測欄位'
  const reasons: string[] = [headerReason, `資料筆數：${table.rowCount} 筆`]
  const warnings: string[] = []
  let confidence = 0

  if (columnMap.nameKey) confidence += headerMap.nameKey ? 30 : Math.round((bestName?.nameScore ?? 0) * 25)
  if (columnMap.classSeatKey) {
    confidence += headerMap.classSeatKey ? 55 : Math.round((bestCombined?.combinedScore ?? 0) * 45)
  } else {
    if (columnMap.seatKey) confidence += headerMap.seatKey ? 30 : Math.round((bestSeat?.seatScore ?? 0) * 25)
    if (columnMap.classKey) confidence += headerMap.classKey ? 25 : Math.round((bestClass?.classScore ?? 0) * 20)
  }
  if (columnMap.gradeKey) confidence += 10

  if (!columnMap.nameKey) warnings.push('找不到姓名欄位')
  if (!columnMap.classSeatKey && !columnMap.seatKey) warnings.push('找不到座號欄位')
  if (!columnMap.classSeatKey && !columnMap.classKey && !columnMap.gradeKey) warnings.push('找不到班級或年級欄位')
  if (confidence < 85 && warnings.length === 0) warnings.push('欄位由內容推測，建議老師確認後再套用結果')

  return {
    columnMap,
    confidence: Math.min(100, confidence),
    reasons,
    warnings,
  }
}
