import { initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import ExcelJS from 'exceljs'
import mammoth from 'mammoth'
import { HttpsError, onCall } from 'firebase-functions/https'
import { setGlobalOptions } from 'firebase-functions/options'
import { onObjectFinalized } from 'firebase-functions/storage'

type Student = {
  id: string
  grade: number
  classNo?: number
  className: string
  classCode: string
  seatNo: string
  name: string
  studentNo?: string
  gender?: string
}

type RosterRowInput = {
  id?: string
  rowNo?: number
  sourceLabel?: string
  classValue?: string
  seatNo?: string
  name?: string
}

type PdfTextItem = {
  str: string
  transform: number[]
  width?: number
}

type PositionedPdfItem = {
  text: string
  x: number
  y: number
  width: number
}

type ValidationStatus = 'pass' | 'warning' | 'error'

type ValidationIssue = {
  rowNo: number
  sourceLabel?: string
  status: Exclude<ValidationStatus, 'pass'>
  issue: string
  original: {
    classValue: string
    seatNo: string
    name: string
  }
  suggestion?: {
    className: string
    seatNo: string
    name: string
  }
  confidence: number
}

type ValidationResponse = {
  validationId?: string
  summary: {
    total: number
    pass: number
    warning: number
    error: number
    usable: boolean
  }
  issues: ValidationIssue[]
}

type FileValidationRequest = {
  fileName: string
  contentBase64: string
}

type OcrJobRequest = {
  fileName: string
  contentBase64: string
}

type OcrJobResponse = {
  jobId: string
  status: 'queued'
  message: string
}

type Caller = {
  uid: string
  email: string
}

type ValidationRecordInput = {
  source: 'rows' | 'file' | 'ocr'
  fileName?: string
  fileKind?: string
  rowCount: number
  parserConfidence?: number
  parserWarnings?: string[]
  summary: ValidationResponse['summary']
  issues: ValidationIssue[]
}

type FileValidationResponse = ValidationResponse & {
  rows: RosterRowInput[]
  parser: {
    fileKind: 'xlsx' | 'csv' | 'docx' | 'pdf'
    rowCount: number
    confidence: number
    warnings: string[]
  }
}

const digitAliases: Record<string, string> = {
  一: '1',
  二: '2',
  三: '3',
  四: '4',
  五: '5',
  六: '6',
  七: '7',
  八: '8',
  九: '9',
}

const classOrder: Record<string, string> = {
  甲: '01',
  乙: '02',
  丙: '03',
  丁: '04',
  戊: '05',
}

const variantGroups = ['陳陈', '峯峰', '堃坤', '臺台', '羣群', '祐佑', '杰傑', '彦彥', '黃黄', '劉刘', '張张', '鄭郑', '葉叶', '吳吴', '謝谢', '羅罗', '賴赖', '鍾鐘钟']
const similarGroups = ['玟雯', '宥侑佑祐', '萱瑄宣', '瑜榆渝', '晴睛', '廷庭', '恩茵', '睿叡', '喆哲', '妍姸', '穎頴']
const variantMap = buildAliasMap(variantGroups)
const similarMap = buildAliasMap(similarGroups)

initializeApp()
setGlobalOptions({ region: 'asia-east1', maxInstances: 10 })

export const validateRosterRows = onCall<{ rows: RosterRowInput[] }, Promise<ValidationResponse>>(async (request) => {
  const caller = assertSchoolCaller(request.auth?.uid, request.auth?.token.email)
  const rows = assertRows(request.data?.rows)
  const students = await loadStudents()
  const report = validateRows(rows, students)
  const validationId = await saveValidationRecord(caller, {
    source: 'rows',
    rowCount: rows.length,
    summary: report.summary,
    issues: report.issues,
  })
  return { ...report, validationId }
})

export const validateRosterFile = onCall<FileValidationRequest, Promise<FileValidationResponse>>(async (request) => {
  const caller = assertSchoolCaller(request.auth?.uid, request.auth?.token.email)

  const fileName = toText(request.data?.fileName)
  const contentBase64 = toText(request.data?.contentBase64)
  if (!fileName || !contentBase64) {
    throw new HttpsError('invalid-argument', '缺少檔名或檔案內容。')
  }
  if (contentBase64.length > 10 * 1024 * 1024) {
    throw new HttpsError('invalid-argument', '檔案太大，請先拆成較小名單後再上傳。')
  }

  const buffer = Buffer.from(contentBase64, 'base64')
  const parsed = await parseRosterFile(fileName, buffer)
  const rows = assertRows(parsed.rows)
  const students = await loadStudents()
  const report = validateRows(rows, students)
  const validationId = await saveValidationRecord(caller, {
    source: 'file',
    fileName,
    fileKind: parsed.fileKind,
    rowCount: rows.length,
    parserConfidence: parsed.confidence,
    parserWarnings: parsed.warnings,
    summary: report.summary,
    issues: report.issues,
  })
  return {
    ...report,
    validationId,
    rows,
    parser: {
      fileKind: parsed.fileKind,
      rowCount: rows.length,
      confidence: parsed.confidence,
      warnings: parsed.warnings,
    },
  }
})

export const createOcrJob = onCall<OcrJobRequest, Promise<OcrJobResponse>>(async (request) => {
  const caller = assertSchoolCaller(request.auth?.uid, request.auth?.token.email)
  const fileName = toText(request.data?.fileName)
  const contentBase64 = toText(request.data?.contentBase64)
  if (!fileName || !contentBase64) {
    throw new HttpsError('invalid-argument', '缺少檔名或檔案內容。')
  }
  if (!/\.pdf$/i.test(fileName)) {
    throw new HttpsError('invalid-argument', 'OCR 背景辨識目前只接受 PDF。')
  }
  if (contentBase64.length > 14 * 1024 * 1024) {
    throw new HttpsError('invalid-argument', '掃描檔太大，請先拆成較小 PDF 後再上傳。')
  }

  const now = Date.now()
  const expiresAt = new Date(now + 24 * 60 * 60 * 1000)
  const ref = getFirestore().collection('ocrJobs').doc()
  const storagePath = `ocr-jobs/${caller.uid}/${ref.id}/source.pdf`
  const storageBucket = getStorage().bucket().name
  await ref.set({
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    expiresAt,
    createdByUid: caller.uid,
    createdByEmail: caller.email,
    fileName,
    storageBucket,
    storagePath,
    fileSizeBase64: contentBase64.length,
    status: 'queued',
    progress: 0,
    message: 'OCR 背景辨識工作已建立，等待 worker 接手處理。',
    resultValidationId: null,
    errorMessage: null,
    inputStored: false,
  })

  const buffer = Buffer.from(contentBase64, 'base64')
  await getStorage().bucket().file(storagePath).save(buffer, {
    contentType: 'application/pdf',
    resumable: false,
    metadata: {
      metadata: {
        jobId: ref.id,
        createdByUid: caller.uid,
      },
    },
  })
  await ref.update({
    updatedAt: FieldValue.serverTimestamp(),
    inputStored: true,
  })

  return {
    jobId: ref.id,
    status: 'queued',
    message: 'OCR 背景辨識工作已建立，稍後可用紀錄編號追蹤狀態。',
  }
})

export const processOcrJob = onObjectFinalized(
  {
    region: 'asia-east1',
    timeoutSeconds: 540,
    memory: '1GiB',
  },
  async (event) => {
    const object = event.data
    const storagePath = toText(object.name)
    if (!storagePath.startsWith('ocr-jobs/') || !storagePath.endsWith('/source.pdf')) return

    const jobId = toText(object.metadata?.jobId) || storagePath.split('/')[2]
    if (!jobId) return

    const firestore = getFirestore()
    const jobRef = firestore.collection('ocrJobs').doc(jobId)
    const jobSnapshot = await jobRef.get()
    if (!jobSnapshot.exists) return

    const job = jobSnapshot.data() ?? {}
    if (toText(job.status) !== 'queued') return

    const caller: Caller = {
      uid: toText(job.createdByUid),
      email: toText(job.createdByEmail),
    }
    const fileName = toText(job.fileName) || '掃描名單.pdf'
    const bucketName = toText(object.bucket)
    const file = getStorage().bucket(bucketName).file(storagePath)

    try {
      await jobRef.update({
        updatedAt: FieldValue.serverTimestamp(),
        status: 'processing',
        progress: 10,
        message: 'OCR worker 已開始處理檔案。',
        errorMessage: null,
      })

      const [buffer] = await file.download()
      await jobRef.update({
        updatedAt: FieldValue.serverTimestamp(),
        progress: 35,
        message: 'OCR worker 已讀取暫存 PDF，正在辨識名單資料。',
      })

      const parsed = await parseOcrPdf(buffer)
      const rows = assertRows(parsed.rows)
      await jobRef.update({
        updatedAt: FieldValue.serverTimestamp(),
        progress: 70,
        message: 'OCR worker 已取得名單列資料，正在進行學生資料庫校對。',
      })

      const students = await loadStudents()
      const report = validateRows(rows, students)
      const validationId = await saveValidationRecord(caller, {
        source: 'ocr',
        fileName,
        fileKind: parsed.fileKind,
        rowCount: rows.length,
        parserConfidence: parsed.confidence,
        parserWarnings: parsed.warnings,
        summary: report.summary,
        issues: report.issues,
      })

      await file.delete({ ignoreNotFound: true })
      await jobRef.update({
        updatedAt: FieldValue.serverTimestamp(),
        completedAt: FieldValue.serverTimestamp(),
        inputDeletedAt: FieldValue.serverTimestamp(),
        status: 'completed',
        progress: 100,
        message: 'OCR 背景辨識與校對已完成。',
        resultValidationId: validationId,
        resultSummary: report.summary,
        resultIssueCount: report.issues.length,
        resultIssues: report.issues,
        errorMessage: null,
      })
    } catch (error) {
      await file.delete({ ignoreNotFound: true }).catch(() => undefined)
      await jobRef.update({
        updatedAt: FieldValue.serverTimestamp(),
        inputDeletedAt: FieldValue.serverTimestamp(),
        status: 'failed',
        progress: 100,
        message: 'OCR 背景辨識失敗。',
        errorMessage: errorToMessage(error),
      })
    }
  },
)

async function loadStudents(): Promise<Student[]> {
  const snapshot = await getFirestore().collection('students').get()
  return snapshot.docs.map((doc) => {
    const data = doc.data()
    return {
      id: doc.id,
      studentNo: toText(data.studentNo),
      grade: Number(data.grade ?? 0),
      classNo: Number(data.classNo ?? 0),
      className: toText(data.className),
      classCode: toText(data.classCode),
      seatNo: normalizeSeat(toText(data.seatNo)),
      name: normalizeName(toText(data.name)),
      gender: toText(data.gender),
    }
  })
}

async function saveValidationRecord(caller: Caller, input: ValidationRecordInput) {
  const ref = getFirestore().collection('validations').doc()
  await ref.set({
    createdAt: FieldValue.serverTimestamp(),
    createdByUid: caller.uid,
    createdByEmail: caller.email,
    source: input.source,
    fileName: input.fileName ?? null,
    fileKind: input.fileKind ?? null,
    rowCount: input.rowCount,
    parserConfidence: input.parserConfidence ?? null,
    parserWarnings: input.parserWarnings ?? [],
    summary: input.summary,
    issueCount: input.issues.length,
    issueStatusCounts: input.issues.reduce(
      (sum, issueItem) => {
        sum[issueItem.status] += 1
        return sum
      },
      { warning: 0, error: 0 },
    ),
    // 只保存定位與分類摘要，不保存完整原始檔或整份學生名單。
    issuePreview: input.issues.slice(0, 20).map((issueItem) => ({
      rowNo: issueItem.rowNo,
      sourceLabel: issueItem.sourceLabel ?? null,
      status: issueItem.status,
      issue: issueItem.issue,
      confidence: issueItem.confidence,
    })),
  })
  return ref.id
}

function validateRows(rows: RosterRowInput[], students: Student[]): ValidationResponse {
  const results = rows.map((row) => validateRow(row, students))
  const summary = results.reduce(
    (sum, result) => {
      sum[result.status] += 1
      return sum
    },
    { pass: 0, warning: 0, error: 0 },
  )

  return {
    summary: {
      total: rows.length,
      ...summary,
      usable: summary.error === 0 && summary.warning === 0,
    },
    issues: results.filter((result): result is ValidationIssue => result.status !== 'pass'),
  }
}

async function parseRosterFile(fileName: string, buffer: Buffer) {
  if (/\.csv$/i.test(fileName)) {
    return rowsToRosterRows(parseCsv(buffer.toString('utf8')), 'csv' as const)
  }
  if (/\.xlsx$/i.test(fileName)) {
    const workbook = new ExcelJS.Workbook()
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer
    await workbook.xlsx.load(arrayBuffer)
    const worksheet = workbook.worksheets
      .map((sheet) => ({
        sheet,
        rowCount: sheet.actualRowCount,
      }))
      .sort((a, b) => b.rowCount - a.rowCount)[0]?.sheet
    if (!worksheet) {
      throw new HttpsError('invalid-argument', 'Excel 檔案中找不到可讀取的工作表。')
    }

    const rows: string[][] = []
    worksheet.eachRow((row) => {
      const values = Array.isArray(row.values) ? row.values.slice(1) : []
      rows.push(values.map((value) => cellToText(value)))
    })
    return rowsToRosterRows(rows, 'xlsx' as const)
  }
  if (/\.docx$/i.test(fileName)) {
    const tableRows = await docxTableRows(buffer)
    if (tableRows.length > 0) return rowsToRosterRows(tableRows, 'docx' as const)

    const textRows = await docxTextRows(buffer)
    return rowsToRosterRows(textRows, 'docx' as const)
  }
  if (/\.pdf$/i.test(fileName)) {
    const rows = await pdfTextRows(buffer)
    return rowsToRosterRows(rows, 'pdf' as const)
  }

  throw new HttpsError('invalid-argument', '後端目前先支援 .xlsx、.csv、.docx 與文字型 PDF，其他格式會由前端既有管線處理。')
}

async function parseOcrPdf(buffer: Buffer) {
  const rows = await pdfTextRows(buffer)
  if (rows.length === 0) {
    throw new Error('OCR worker 管線已建立，但目前尚未接入影像 OCR 引擎；這份 PDF 沒有可抽取的文字。')
  }

  return rowsToRosterRows(rows, 'pdf' as const)
}

async function docxTableRows(buffer: Buffer) {
  const result = await mammoth.convertToHtml({ buffer })
  return tablesFromHtml(result.value)
}

async function docxTextRows(buffer: Buffer) {
  const result = await mammoth.extractRawText({ buffer })
  return result.value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(splitTextLine)
}

async function pdfTextRows(buffer: Buffer) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const pdf = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
  }).promise
  const rows: string[][] = []

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber)
    const content = await page.getTextContent()
    const items = content.items.flatMap((item) => isPdfTextItem(item) ? [item] : [])
    rows.push(...pdfItemsToRows(items))
  }

  return rows
}

function rowsToRosterRows(rows: string[][], fileKind: 'xlsx' | 'csv' | 'docx' | 'pdf') {
  const nonEmptyRows = rows.filter((row) => row.some((cell) => toText(cell)))
  if (nonEmptyRows.length < 1) {
    throw new HttpsError('invalid-argument', '檔案中沒有可校對的名單資料。')
  }

  const headerIndex = findHeaderRow(nonEmptyRows)
  const headers = headerIndex >= 0 ? normalizeHeaders(nonEmptyRows[headerIndex]) : synthesizeHeaders(nonEmptyRows)
  const dataRows = headerIndex >= 0 ? nonEmptyRows.slice(headerIndex + 1) : nonEmptyRows
  const columnMap = detectColumnMap(headers, dataRows)
  const warnings = [
    columnMap.classIndex < 0 ? '找不到班級欄位' : '',
    columnMap.seatIndex < 0 ? '找不到座號欄位' : '',
    columnMap.nameIndex < 0 ? '找不到姓名欄位' : '',
  ].filter(Boolean)

  const rosterRows = dataRows
    .map((row, index) => ({
      id: `backend-${index + 1}`,
      rowNo: (headerIndex >= 0 ? headerIndex + 2 : 1) + index,
      classValue: columnValue(row, columnMap.classIndex),
      seatNo: columnValue(row, columnMap.seatIndex),
      name: columnValue(row, columnMap.nameIndex),
    }))
    .filter((row) => row.classValue || row.seatNo || row.name)

  if (rosterRows.length === 0) {
    throw new HttpsError('invalid-argument', '檔案中沒有可校對的班級、座號與姓名資料。')
  }

  const confidence = Math.max(0, 100 - warnings.length * 28 - (headerIndex < 0 ? 12 : 0))
  return {
    fileKind,
    rows: rosterRows,
    confidence,
    warnings,
  }
}

function assertSchoolCaller(uid: unknown, email: unknown): Caller {
  const uidText = toText(uid)
  const text = toText(email)
  if (!uidText || !text || !isSchoolEmail(text)) {
    throw new HttpsError('permission-denied', '請使用石門國小 Google 帳號登入後再校對名單。')
  }
  return { uid: uidText, email: text }
}

function assertRows(value: unknown): RosterRowInput[] {
  const rows = Array.isArray(value) ? value : []
  if (rows.length === 0) {
    throw new HttpsError('invalid-argument', '缺少可校對的名單資料。')
  }
  if (rows.length > 2000) {
    throw new HttpsError('invalid-argument', '單次校對最多支援 2000 筆資料。')
  }
  return rows.map((row, index) => {
    const record = row && typeof row === 'object' ? row as Record<string, unknown> : {}
    return {
      id: toText(record.id) || `row-${index + 1}`,
      rowNo: Number(record.rowNo ?? index + 1),
      sourceLabel: toText(record.sourceLabel) || undefined,
      classValue: toText(record.classValue),
      seatNo: toText(record.seatNo),
      name: toText(record.name),
    }
  })
}

function findHeaderRow(rows: string[][]) {
  return rows.findIndex((row) => {
    const headers = normalizeHeaders(row)
    const map = detectHeaderMap(headers)
    return [map.classIndex, map.seatIndex, map.nameIndex].filter((index) => index >= 0).length >= 2
  })
}

function normalizeHeaders(row: string[]) {
  const used = new Map<string, number>()
  return row.map((cell, index) => {
    const base = toText(cell).replace(/\s+/g, '') || `欄位${index + 1}`
    const count = used.get(base) ?? 0
    used.set(base, count + 1)
    return count === 0 ? base : `${base}_${count + 1}`
  })
}

function synthesizeHeaders(rows: string[][]) {
  const width = Math.max(...rows.map((row) => row.length), 0)
  return Array.from({ length: width }, (_, index) => `欄位${index + 1}`)
}

function detectColumnMap(headers: string[], rows: string[][]) {
  const headerMap = detectHeaderMap(headers)
  return {
    classIndex: headerMap.classIndex >= 0 ? headerMap.classIndex : bestColumn(rows, scoreClassValue),
    seatIndex: headerMap.seatIndex >= 0 ? headerMap.seatIndex : bestColumn(rows, scoreSeatValue),
    nameIndex: headerMap.nameIndex >= 0 ? headerMap.nameIndex : bestColumn(rows, scoreNameValue),
  }
}

function detectHeaderMap(headers: string[]) {
  return {
    classIndex: headers.findIndex((header) => /^(班級|班別|班|年班|class)$/i.test(header)),
    seatIndex: headers.findIndex((header) => /^(座號|座次|號碼|編號|座位|seat|number)$/i.test(header)),
    nameIndex: headers.findIndex((header) => /^(姓名|學生姓名|名字|學生|name)$/i.test(header)),
  }
}

function bestColumn(rows: string[][], scorer: (value: string) => number) {
  const width = Math.max(...rows.map((row) => row.length), 0)
  let bestIndex = -1
  let bestScore = 0
  for (let index = 0; index < width; index += 1) {
    const values = rows.map((row) => columnValue(row, index)).filter(Boolean)
    if (values.length === 0) continue
    const score = values.reduce((sum, value) => sum + scorer(value), 0) / values.length
    if (score > bestScore) {
      bestIndex = index
      bestScore = score
    }
  }
  return bestScore >= 0.45 ? bestIndex : -1
}

function scoreClassValue(value: string) {
  const text = toText(value)
  if (/^\d{3}$/.test(text)) return 1
  if (/^[一二三四五六七八九\d]年?[一二三四五六七八九\d甲乙丙丁戊]+班?$/.test(text)) return 1
  return 0
}

function scoreSeatValue(value: string) {
  const text = toText(value)
  if (!/^\d{1,2}$/.test(text)) return 0
  const number = Number(text)
  return number >= 1 && number <= 40 ? 1 : 0
}

function scoreNameValue(value: string) {
  const text = normalizeName(value)
  if (/^[\u4e00-\u9fff]{2,5}$/.test(text)) return 1
  return 0
}

function columnValue(row: string[], index: number) {
  return index >= 0 ? toText(row[index]) : ''
}

function cellToText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value === 'object') {
    const record = value as { text?: unknown; result?: unknown; richText?: Array<{ text?: unknown }> }
    if (record.text !== undefined) return toText(record.text)
    if (record.result !== undefined) return toText(record.result)
    if (Array.isArray(record.richText)) return record.richText.map((part) => toText(part.text)).join('')
  }
  return toText(value)
}

function tablesFromHtml(html: string) {
  const rows: string[][] = []
  const tableMatches = html.match(/<table[\s\S]*?<\/table>/gi) ?? []
  for (const tableHtml of tableMatches) {
    const rowMatches = tableHtml.match(/<tr[\s\S]*?<\/tr>/gi) ?? []
    for (const rowHtml of rowMatches) {
      const cells = [...rowHtml.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
        .map((match) => decodeHtml(stripTags(match[1])))
        .map((cell) => cell.trim())
      if (cells.some(Boolean)) rows.push(cells)
    }
    if (rows.length > 0) break
  }
  return rows
}

function splitTextLine(line: string) {
  const tabCells = line.split(/\t+/).map((cell) => cell.trim()).filter(Boolean)
  if (tabCells.length >= 3) return tabCells
  const wideCells = line.split(/\s{2,}/).map((cell) => cell.trim()).filter(Boolean)
  if (wideCells.length >= 3) return wideCells

  const match = line.match(/^([一二三四五六七八九\d]{1,3}(?:年?[一二三四五六七八九\d甲乙丙丁戊]+班?)?)\s*([0-9]{1,2})\s*([\u4e00-\u9fff]{2,5})/)
  return match ? [match[1], match[2], match[3]] : [line]
}

function pdfItemsToRows(items: PdfTextItem[]) {
  const positioned: PositionedPdfItem[] = items
    .map((item) => ({
      text: item.str.trim(),
      x: item.transform[4] ?? 0,
      y: item.transform[5] ?? 0,
      width: item.width ?? 0,
    }))
    .filter((item) => item.text !== '')

  const lines: Array<{ y: number; items: PositionedPdfItem[] }> = []
  positioned
    .sort((a, b) => b.y - a.y || a.x - b.x)
    .forEach((item) => {
      const line = lines.find((current) => Math.abs(current.y - item.y) <= 4)
      if (line) {
        line.items.push(item)
        return
      }
      lines.push({ y: item.y, items: [item] })
    })

  return lines.map((line) => splitTextLine(joinPdfLineItems(line.items))).filter((row) => row.some(Boolean))
}

function joinPdfLineItems(items: PositionedPdfItem[]) {
  const sorted = items.sort((a, b) => a.x - b.x)
  const totalWidth = sorted.reduce((sum, item) => sum + item.width, 0)
  const totalChars = sorted.reduce((sum, item) => sum + Math.max(item.text.length, 1), 0)
  const avgCharWidth = totalChars > 0 ? totalWidth / totalChars : 0

  return sorted.reduce((text, item, index) => {
    if (index === 0) return item.text
    const prev = sorted[index - 1]
    const gap = item.x - (prev.x + prev.width)
    const columnGap = avgCharWidth > 0 ? avgCharWidth * 1.5 : 6
    const separator = gap > columnGap ? '\t' : ' '
    return text + separator + item.text
  }, '')
}

function isPdfTextItem(item: unknown): item is PdfTextItem {
  return (
    typeof item === 'object' &&
    item !== null &&
    'str' in item &&
    'transform' in item &&
    typeof item.str === 'string' &&
    Array.isArray(item.transform)
  )
}

function stripTags(value: string) {
  return value.replace(/<[^>]+>/g, '')
}

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function parseCsv(text: string) {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    const next = text[index + 1]
    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"'
        index += 1
      } else if (char === '"') {
        quoted = false
      } else {
        cell += char
      }
    } else if (char === '"') {
      quoted = true
    } else if (char === ',') {
      row.push(cell)
      cell = ''
    } else if (char === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else if (char !== '\r') {
      cell += char
    }
  }

  row.push(cell)
  if (row.some((value) => value !== '') || rows.length === 0) rows.push(row)
  return rows
}

function validateRow(row: RosterRowInput, students: Student[]): { status: ValidationStatus } | ValidationIssue {
  const normalized = normalizeRow(row)
  if (!normalized.classValue || !normalized.seatNo || !normalized.name) {
    return issue(row, 'error', '缺少班級、座號或姓名，無法比對。', undefined, 0)
  }

  const classCode = normalizeClass(normalized.classValue)
  const exact = students.find(
    (student) =>
      normalizeClass(student.className) === classCode &&
      student.seatNo === normalized.seatNo &&
      normalizeName(student.name) === normalized.name,
  )
  if (exact) return { status: 'pass' }

  const sameSeat = students.find(
    (student) => normalizeClass(student.className) === classCode && student.seatNo === normalized.seatNo,
  )
  if (sameSeat) {
    const nameMatch = compareChineseNames(sameSeat.name, normalized.name)
    return issue(
      normalized,
      nameMatch.level === 'low' ? 'error' : 'warning',
      `班級與座號吻合，但姓名應為「${sameSeat.name}」（${nameMatchLabel(nameMatch.level)}：${nameMatch.reasons.join('、') || '姓名差異'}）。`,
      sameSeat,
      nameMatch.confidence,
    )
  }

  const sameName = students.find((student) => normalizeName(student.name) === normalized.name)
  if (sameName) {
    return issue(normalized, 'warning', '找到同名學生，但班級或座號不同。', sameName, 76)
  }

  const fuzzy = findBestNameMatch(normalized.name, students)
  if (fuzzy && fuzzy.level !== 'low') {
    return issue(
      normalized,
      'warning',
      `找不到完全相符資料，疑似姓名為「${fuzzy.student.name}」（${nameMatchLabel(fuzzy.level)}：${fuzzy.reasons.join('、') || '姓名近似'}）。`,
      fuzzy.student,
      fuzzy.confidence,
    )
  }

  return issue(normalized, 'error', '查無符合學生，請確認班級、座號與姓名。', undefined, 0)
}

function issue(
  row: RosterRowInput,
  status: Exclude<ValidationStatus, 'pass'>,
  issueText: string,
  suggestion: Student | undefined,
  confidence: number,
): ValidationIssue {
  return {
    rowNo: Number(row.rowNo ?? 0),
    sourceLabel: row.sourceLabel,
    status,
    issue: issueText,
    original: {
      classValue: toText(row.classValue),
      seatNo: normalizeSeat(toText(row.seatNo)),
      name: normalizeName(toText(row.name)),
    },
    suggestion: suggestion
      ? {
          className: suggestion.className,
          seatNo: suggestion.seatNo,
          name: suggestion.name,
        }
      : undefined,
    confidence,
  }
}

function normalizeRow(row: RosterRowInput): RosterRowInput {
  return {
    ...row,
    classValue: toText(row.classValue),
    seatNo: normalizeSeat(toText(row.seatNo)),
    name: normalizeName(toText(row.name)),
  }
}

function isSchoolEmail(email: string) {
  return /@(mail2\.)?smes\.tyc\.edu\.tw$/i.test(email)
}

function toText(value: unknown) {
  return value === null || value === undefined ? '' : String(value).trim()
}

function errorToMessage(error: unknown) {
  if (error instanceof HttpsError) return error.message
  if (error instanceof Error) return error.message
  return 'OCR 背景辨識發生未知錯誤。'
}

function toDigit(value: string) {
  return value
    .split('')
    .map((char) => digitAliases[char] ?? char)
    .join('')
}

function normalizeSeat(value: string) {
  const number = Number(value.replace(/[^\d]/g, ''))
  return Number.isFinite(number) && number > 0 ? String(number).padStart(2, '0') : ''
}

function normalizeName(value: string) {
  return value.replace(/\s/g, '').trim()
}

function normalizeClass(value: string) {
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

function compareChineseNames(expectedValue: string, actualValue: string) {
  const expected = normalizeForMatch(expectedValue)
  const actual = normalizeForMatch(actualValue)
  if (!expected || !actual) return { confidence: 0, level: 'low' as const, reasons: ['姓名空白'] }
  if (expected === actual) return { confidence: 100, level: 'high' as const, reasons: ['姓名完全相同'] }

  const reasons = new Set<string>()
  if (canonicalize(expected, variantMap) === canonicalize(actual, variantMap)) {
    return { confidence: 96, level: 'high' as const, reasons: ['異體字'] }
  }

  if (isTransposed(expected, actual)) {
    return { confidence: 88, level: 'high' as const, reasons: ['顛倒字'] }
  }

  const lengthDiff = Math.abs([...expected].length - [...actual].length)
  if (isOneCharInsertOrDelete(expected, actual)) reasons.add(lengthDiff > 0 ? '缺一字或多一字' : '單字差異')

  const weightedDistance = nameDistance(expected, actual, reasons)
  const confidence = Math.max(0, Math.min(99, Math.round(100 - weightedDistance * 28 - lengthDiff * 6)))
  if (weightedDistance <= 0.45 && reasons.size === 0) reasons.add('姓名近似')
  if (reasons.size === 0 && confidence >= 55) reasons.add('字串距離接近')

  return {
    confidence,
    level: confidence >= 85 ? 'high' as const : confidence >= 65 ? 'medium' as const : 'low' as const,
    reasons: [...reasons],
  }
}

function findBestNameMatch(actualName: string, students: Student[]) {
  return students
    .map((student) => ({
      ...compareChineseNames(student.name, actualName),
      student,
    }))
    .sort((a, b) => b.confidence - a.confidence)[0] ?? null
}

function normalizeForMatch(value: string) {
  return normalizeName(value).replace(/[·．.。\-＿_、,，]/g, '')
}

function nameDistance(a: string, b: string, reasons: Set<string>) {
  const left = [...a]
  const right = [...b]
  const matrix = Array.from({ length: left.length + 1 }, (_, row) =>
    Array.from({ length: right.length + 1 }, (_, column) => {
      if (row === 0) return column * 0.8
      if (column === 0) return row * 0.8
      return 0
    }),
  )

  for (let row = 1; row <= left.length; row += 1) {
    for (let column = 1; column <= right.length; column += 1) {
      const cost = charCost(left[row - 1], right[column - 1], reasons)
      matrix[row][column] = Math.min(
        matrix[row - 1][column] + 0.8,
        matrix[row][column - 1] + 0.8,
        matrix[row - 1][column - 1] + cost,
      )
    }
  }

  return matrix[left.length][right.length]
}

function charCost(a: string, b: string, reasons: Set<string>) {
  if (a === b) return 0
  if (variantMap[a] && variantMap[a] === variantMap[b]) {
    reasons.add('異體字')
    return 0.12
  }
  if (similarMap[a] && similarMap[a] === similarMap[b]) {
    reasons.add('形近字或同音字')
    return 0.35
  }
  return 1
}

function isTransposed(a: string, b: string) {
  const left = [...a]
  const right = [...b]
  if (left.length !== right.length) return false
  const diff = left.flatMap((char, index) => (char === right[index] ? [] : [index]))
  return diff.length === 2 && left[diff[0]] === right[diff[1]] && left[diff[1]] === right[diff[0]]
}

function isOneCharInsertOrDelete(a: string, b: string) {
  const left = [...a]
  const right = [...b]
  if (Math.abs(left.length - right.length) > 1) return false
  if (left.length === right.length) return nameDistance(a, b, new Set()) <= 1

  const [shorter, longer] = left.length < right.length ? [left, right] : [right, left]
  let misses = 0
  for (let shortIndex = 0, longIndex = 0; longIndex < longer.length; longIndex += 1) {
    if (shorter[shortIndex] === longer[longIndex]) {
      shortIndex += 1
    } else {
      misses += 1
    }
  }
  return misses <= 1
}

function canonicalize(value: string, map: Record<string, string>) {
  return [...value].map((char) => map[char] ?? char).join('')
}

function buildAliasMap(groups: readonly string[]) {
  return Object.fromEntries(groups.flatMap((group) => [...group].map((char) => [char, group[0]])))
}

function nameMatchLabel(level: 'high' | 'medium' | 'low') {
  return {
    high: '高信心建議',
    medium: '中信心待確認',
    low: '低信心人工確認',
  }[level]
}
