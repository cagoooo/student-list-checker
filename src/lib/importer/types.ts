import type { ColumnMap, ImportedRow, Student } from '../../types'

export type SourceFileKind = 'excel' | 'csv' | 'pdf' | 'word' | 'unsupported'

export type CandidateTable = {
  id: string
  sourceName: string
  sheetName?: string
  headerRow: number
  headers: string[]
  rows: Record<string, unknown>[]
  rowCount: number
  // 解析前的完整列（字串化），保留供使用者手動重指定標題列用。
  rawRows?: string[][]
}

export type FieldDetection = {
  columnMap: ColumnMap
  confidence: number
  reasons: string[]
  warnings: string[]
}

export type ImportDetectionResult = {
  fileName: string
  fileKind: SourceFileKind
  selectedTable: CandidateTable | null
  candidates: CandidateTable[]
  fieldDetection: FieldDetection
  importedRows: ImportedRow[]
  sourceStudents: Student[]
  isOfficialStudentSource: boolean
}
