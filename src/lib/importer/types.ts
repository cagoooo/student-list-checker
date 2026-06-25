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
