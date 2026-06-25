import type { ColumnMap, ImportedRow, Student } from '../../types'
import type { CandidateTable } from './types'
import { ROW_NUMBER_KEY, SOURCE_LOCATION_KEY, classOrder, normalizeName, normalizeSeat, toDigit, toText } from './normalize'

export function buildImportedRows(data: Record<string, unknown>[], map?: ColumnMap): ImportedRow[] {
  const detected = map ?? {}
  return data.map((raw, index) => hydrateRow(raw, Number(raw[ROW_NUMBER_KEY]) || index + 2, detected))
}

export function hydrateRow(raw: Record<string, unknown>, rowNo: number, map: ColumnMap): ImportedRow {
  const gradeValue = toText(raw[map.gradeKey ?? ''])
  const classValue = toText(raw[map.classKey ?? ''])
  const sourceLabel = toText(raw[SOURCE_LOCATION_KEY]) || undefined
  return {
    id: `${rowNo}-${JSON.stringify(raw)}`,
    rowNo,
    sourceLabel,
    raw,
    classValue: gradeValue && classValue ? `${gradeValue}年${classValue}班` : classValue,
    seatNo: normalizeSeat(toText(raw[map.seatKey ?? ''])),
    name: normalizeName(toText(raw[map.nameKey ?? ''])),
  }
}

export function applyStudentToRaw(raw: Record<string, unknown>, student: Student, map: ColumnMap) {
  return {
    ...raw,
    [map.classKey || '班級']: student.className,
    [map.seatKey || '座號']: student.seatNo,
    [map.nameKey || '姓名']: student.name,
  }
}

export function parseStudentsFromTable(table: CandidateTable, columnMap: ColumnMap): Student[] {
  return table.rows
    .map((row): Student | null => {
      const name = normalizeName(toText(row[columnMap.nameKey ?? '']))
      const classParts = parseClassParts(toText(row[columnMap.classKey ?? '']), toText(row[columnMap.gradeKey ?? '']))
      const seatNumber = Number(toText(row[columnMap.seatKey ?? '']))
      const studentNo = toText(row['學號'])
      const gender = toText(row['性別'])

      if (!name || !classParts || !Number.isFinite(seatNumber)) {
        return null
      }

      const { grade, classNo } = classParts
      const seatNo = String(seatNumber).padStart(2, '0')
      const classCode = `${grade}${String(classNo).padStart(2, '0')}`
      return {
        id: studentNo || `${classCode}-${seatNo}`,
        studentNo,
        grade,
        classNo,
        className: `${grade}年${classNo}班`,
        classCode,
        seatNo,
        name,
        gender,
      } satisfies Student
    })
    .filter((student): student is Student => student !== null)
}

export function normalizeClass(value: string) {
  const compact = value.replace(/\s/g, '').replace(/班$/, '')
  if (/^\d{3}$/.test(compact)) return compact

  const numericMatch = compact.match(/^([一二三四五六七八九\d])年?([一二三四五六七八九\d]+)$/)
  if (numericMatch) {
    const grade = toDigit(numericMatch[1])
    const classNo = toDigit(numericMatch[2])
    return `${grade}${classNo.padStart(2, '0')}`
  }

  const orderMatch = compact.match(/^([一二三四五六七八九\d])年?([甲乙丙丁戊])$/)
  if (orderMatch) {
    const grade = toDigit(orderMatch[1])
    return `${grade}${classOrder[orderMatch[2]]}`
  }

  return compact
}

export function parseClassParts(classValue: string, gradeValue?: string) {
  const grade = Number(toDigit(toText(gradeValue ?? '').replace(/[^\d一二三四五六七八九]/g, '')))
  const classNo = Number(toDigit(classValue.replace(/[^\d一二三四五六七八九]/g, '')))
  if (Number.isFinite(grade) && grade > 0 && Number.isFinite(classNo) && classNo > 0) {
    return { grade, classNo }
  }

  const classCode = normalizeClass(classValue)
  if (/^\d{3}$/.test(classCode)) {
    return {
      grade: Number(classCode.slice(0, 1)),
      classNo: Number(classCode.slice(1)),
    }
  }

  return null
}

export { normalizeName, normalizeSeat }
