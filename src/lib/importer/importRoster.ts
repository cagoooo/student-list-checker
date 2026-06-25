import { detectRosterFields } from './fieldDetection'
import { parseExcelTables } from './excel'
import { ocrPdfTables, type OcrProgress } from './ocr'
import { parsePdfTables } from './pdf'
import { buildImportedRows, parseStudentsFromTable } from './studentSource'
import type { CandidateTable, FieldDetection, ImportDetectionResult, SourceFileKind } from './types'
import { parseWordTables } from './word'

export type ImportRosterOptions = {
  onOcrProgress?: (info: OcrProgress) => void
}

const EMPTY_DETECTION: FieldDetection = {
  columnMap: {},
  confidence: 0,
  reasons: [],
  warnings: [],
}

export async function importRosterFile(
  file: File,
  options: ImportRosterOptions = {},
): Promise<ImportDetectionResult> {
  const fileKind = detectFileKind(file.name)

  if (fileKind === 'excel' || fileKind === 'csv') {
    const buffer = await file.arrayBuffer()
    const tables = parseExcelTables(buffer, file.name)
    return buildDetectionResultFromTables(file.name, fileKind, tables)
  }

  if (fileKind === 'pdf') {
    const tables = await parsePdfTables(file)
    if (tables.length > 0) return buildDetectionResultFromTables(file.name, fileKind, tables)

    const ocrTables = await runPdfOcr(file, options.onOcrProgress)
    return ocrTables.length > 0
      ? buildDetectionResultFromTables(file.name, fileKind, ocrTables)
      : buildUnsupportedResult(file.name, fileKind)
  }

  if (fileKind === 'word') {
    const tables = await parseWordTables(file)
    return tables.length > 0 ? buildDetectionResultFromTables(file.name, fileKind, tables) : buildUnsupportedResult(file.name, fileKind)
  }

  return buildUnsupportedResult(file.name, fileKind)
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

  return {
    fileName,
    fileKind,
    selectedTable: selected.candidate,
    candidates,
    ...buildSelectedTablePayload(selected.candidate, selected.fieldDetection, importedRows),
  }
}

export function selectCandidateTable(result: ImportDetectionResult, candidateId: string): ImportDetectionResult {
  const selectedTable = result.candidates.find((candidate) => candidate.id === candidateId)
  if (!selectedTable) return result

  const fieldDetection = detectRosterFields(selectedTable)
  const importedRows = buildImportedRows(selectedTable.rows, fieldDetection.columnMap)

  return {
    ...result,
    selectedTable,
    ...buildSelectedTablePayload(selectedTable, fieldDetection, importedRows),
  }
}

export function buildUnsupportedResult(fileName: string, fileKind: SourceFileKind): ImportDetectionResult {
  const label =
    fileKind === 'pdf'
      ? 'PDF'
      : fileKind === 'word'
        ? 'Word'
        : '此檔案格式'
  const warning =
    fileKind === 'pdf'
      ? '無法從這份 PDF 取得名單（文字抽取與影像 OCR 都沒有找到班級、座號、姓名）。若為掃描檔請確認影像清晰，或先轉成 Excel / CSV。'
      : fileKind === 'word'
        ? '無法從這份 Word 取得名單，請確認檔內含班級、座號、姓名的表格或段落，或先轉成 Excel / CSV。'
        : `${label} 名單辨識尚未啟用，請先轉成 Excel / CSV。`

  return {
    fileName,
    fileKind,
    selectedTable: null,
    candidates: [],
    fieldDetection: {
      ...EMPTY_DETECTION,
      warnings: [warning],
    },
    importedRows: [],
    sourceStudents: [],
    isOfficialStudentSource: false,
  }
}

async function runPdfOcr(file: File, onProgress?: (info: OcrProgress) => void): Promise<CandidateTable[]> {
  try {
    return await ocrPdfTables(file, onProgress)
  } catch {
    // OCR 需下載語言資料，離線或環境受限時會失敗，退回提示由使用者轉檔。
    return []
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

function buildSelectedTablePayload(
  selectedTable: CandidateTable,
  fieldDetection: FieldDetection,
  importedRows: ReturnType<typeof buildImportedRows>,
) {
  const parsedStudents = parseStudentsFromTable(selectedTable, fieldDetection.columnMap)
  const isOfficialStudentSource = isOfficialStudentSourceTable(selectedTable, parsedStudents.length)

  return {
    fieldDetection,
    importedRows,
    sourceStudents: isOfficialStudentSource ? parsedStudents : [],
    isOfficialStudentSource,
  }
}
