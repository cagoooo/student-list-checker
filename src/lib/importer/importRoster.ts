import { detectRosterFields } from './fieldDetection'
import { parseExcelTables } from './excel'
import { buildImportedRows, parseStudentsFromTable } from './studentSource'
import type { CandidateTable, FieldDetection, ImportDetectionResult, SourceFileKind } from './types'

const EMPTY_DETECTION: FieldDetection = {
  columnMap: {},
  confidence: 0,
  reasons: [],
  warnings: [],
}

export async function importRosterFile(file: File): Promise<ImportDetectionResult> {
  const fileKind = detectFileKind(file.name)

  if (fileKind !== 'excel' && fileKind !== 'csv') {
    return buildUnsupportedResult(file.name, fileKind)
  }

  const buffer = await file.arrayBuffer()
  const tables = parseExcelTables(buffer, file.name)
  return buildDetectionResultFromTables(file.name, fileKind, tables)
}

export function buildDetectionResultFromTables(
  fileName: string,
  fileKind: SourceFileKind,
  candidates: CandidateTable[],
): ImportDetectionResult {
  const ranked = candidates
    .map((candidate) => {
      const fieldDetection = detectRosterFields(candidate)
      return {
        candidate,
        fieldDetection,
        score: fieldDetection.confidence + Math.min(candidate.rowCount, 50),
      }
    })
    .sort((a, b) => b.score - a.score)

  const selected = ranked[0]
  if (!selected) {
    return {
      fileName,
      fileKind,
      selectedTable: null,
      candidates,
      fieldDetection: {
        ...EMPTY_DETECTION,
        warnings: ['找不到可辨識的名單表格，請確認檔案內含班級、座號與姓名欄位。'],
      },
      importedRows: [],
      sourceStudents: [],
      isOfficialStudentSource: false,
    }
  }

  const importedRows = buildImportedRows(selected.candidate.rows, selected.fieldDetection.columnMap)
  const parsedStudents = parseStudentsFromTable(selected.candidate, selected.fieldDetection.columnMap)
  const isOfficialStudentSource = isOfficialStudentSourceTable(selected.candidate, parsedStudents.length)

  return {
    fileName,
    fileKind,
    selectedTable: selected.candidate,
    candidates,
    fieldDetection: selected.fieldDetection,
    importedRows,
    sourceStudents: isOfficialStudentSource ? parsedStudents : [],
    isOfficialStudentSource,
  }
}

export function buildUnsupportedResult(fileName: string, fileKind: SourceFileKind): ImportDetectionResult {
  const label =
    fileKind === 'pdf'
      ? 'PDF'
      : fileKind === 'word'
        ? 'Word'
        : '此檔案格式'
  const nextStep =
    fileKind === 'pdf'
      ? 'PDF 文字表格抽取'
      : fileKind === 'word'
        ? 'Word 表格抽取'
        : '更多格式辨識'

  return {
    fileName,
    fileKind,
    selectedTable: null,
    candidates: [],
    fieldDetection: {
      ...EMPTY_DETECTION,
      warnings: [`${label} 名單辨識尚未啟用，請先轉成 Excel / CSV，或等待下一階段 ${nextStep}。`],
    },
    importedRows: [],
    sourceStudents: [],
    isOfficialStudentSource: false,
  }
}

export function detectFileKind(fileName: string): SourceFileKind {
  if (/\.csv$/i.test(fileName)) return 'csv'
  if (/\.(xlsx|xls)$/i.test(fileName)) return 'excel'
  if (/\.pdf$/i.test(fileName)) return 'pdf'
  if (/\.(doc|docx)$/i.test(fileName)) return 'word'
  return 'unsupported'
}

function isOfficialStudentSourceTable(table: CandidateTable, parsedStudentCount: number) {
  return (
    parsedStudentCount > 0 &&
    parsedStudentCount === table.rowCount &&
    hasHeader(table.headers, /學號/) &&
    hasHeader(table.headers, /性別/)
  )
}

function hasHeader(headers: string[], pattern: RegExp) {
  return headers.some((header) => pattern.test(header))
}
