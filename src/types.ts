export type Student = {
  id: string
  studentNo?: string
  grade: number
  classNo?: number
  className: string
  classCode: string
  seatNo: string
  name: string
  gender?: string
  updatedAt?: string
}

export type ImportedRow = {
  id: string
  rowNo: number
  sourceLabel?: string
  raw: Record<string, unknown>
  classValue: string
  seatNo: string
  name: string
}

export type ValidationStatus = 'pass' | 'warning' | 'error'

export type ValidationResult = ImportedRow & {
  status: ValidationStatus
  issue: string
  suggestion?: Student
  confidence: number
}

export type ColumnMap = {
  classKey?: string
  gradeKey?: string
  seatKey?: string
  nameKey?: string
  classSeatKey?: string  // 班級座號合併欄位，如 60501 = 班級605 + 座號01
}

export type DatabaseMode = 'demo' | 'local' | 'firebase'
