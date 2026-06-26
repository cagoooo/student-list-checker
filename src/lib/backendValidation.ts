import { doc, onSnapshot } from 'firebase/firestore'
import { getFunctions, httpsCallable } from 'firebase/functions'
import type { Student, ValidationStatus } from '../types'
import { getFirebaseRuntime } from './firebase'

export type BackendRosterRow = {
  id?: string
  rowNo?: number
  sourceLabel?: string
  classValue?: string
  seatNo?: string
  name?: string
}

export type BackendValidationIssue = {
  rowNo: number
  sourceLabel?: string
  status: Exclude<ValidationStatus, 'pass'>
  issue: string
  original: {
    classValue: string
    seatNo: string
    name: string
  }
  suggestion?: Pick<Student, 'className' | 'seatNo' | 'name'>
  confidence: number
}

export type BackendValidationReport = {
  validationId?: string
  summary: {
    total: number
    pass: number
    warning: number
    error: number
    usable: boolean
  }
  issues: BackendValidationIssue[]
}

export type BackendFileValidationReport = BackendValidationReport & {
  rows: BackendRosterRow[]
  parser: {
    fileKind: 'xlsx' | 'csv' | 'docx' | 'pdf'
    rowCount: number
    confidence: number
    warnings: string[]
  }
}

export type BackendOcrJob = {
  jobId: string
  status: 'queued'
  message: string
}

export type BackendOcrJobStatus = {
  jobId: string
  fileName: string
  status: 'queued' | 'processing' | 'completed' | 'failed'
  progress: number
  message: string
  resultValidationId?: string
  resultSummary?: BackendValidationReport['summary']
  resultIssueCount?: number
  resultIssues?: BackendValidationIssue[]
  errorMessage?: string
}

export async function validateRosterRowsOnBackend(rows: BackendRosterRow[]) {
  const runtime = getFirebaseRuntime()
  if (!runtime) return null

  const region = import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION || 'asia-east1'
  const functions = getFunctions(runtime.app, region)
  const validateRosterRows = httpsCallable<{ rows: BackendRosterRow[] }, BackendValidationReport>(
    functions,
    'validateRosterRows',
  )
  const result = await validateRosterRows({ rows })
  return result.data
}

export async function validateRosterFileOnBackend(file: File) {
  const runtime = getFirebaseRuntime()
  if (!runtime) return null

  const region = import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION || 'asia-east1'
  const functions = getFunctions(runtime.app, region)
  const validateRosterFile = httpsCallable<
    { fileName: string; contentBase64: string },
    BackendFileValidationReport
  >(functions, 'validateRosterFile')

  const contentBase64 = await fileToBase64(file)
  const result = await validateRosterFile({ fileName: file.name, contentBase64 })
  return result.data
}

export async function createOcrJobOnBackend(file: File) {
  const runtime = getFirebaseRuntime()
  if (!runtime) return null

  const region = import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION || 'asia-east1'
  const functions = getFunctions(runtime.app, region)
  const createOcrJob = httpsCallable<{ fileName: string; contentBase64: string }, BackendOcrJob>(
    functions,
    'createOcrJob',
  )
  const contentBase64 = await fileToBase64(file)
  const result = await createOcrJob({ fileName: file.name, contentBase64 })
  return result.data
}

export function subscribeOcrJobStatus(jobId: string, callback: (job: BackendOcrJobStatus | null) => void) {
  const runtime = getFirebaseRuntime()
  if (!runtime) {
    callback(null)
    return () => undefined
  }

  return onSnapshot(
    doc(runtime.db, 'ocrJobs', jobId),
    (snapshot) => {
      if (!snapshot.exists()) {
        callback(null)
        return
      }

      const data = snapshot.data()
      callback({
        jobId: snapshot.id,
        fileName: String(data.fileName ?? ''),
        status: normalizeOcrStatus(data.status),
        progress: clampProgress(data.progress),
        message: String(data.message ?? ''),
        resultValidationId: optionalText(data.resultValidationId),
        resultSummary: isSummary(data.resultSummary) ? data.resultSummary : undefined,
        resultIssueCount: typeof data.resultIssueCount === 'number' ? data.resultIssueCount : undefined,
        resultIssues: parseIssues(data.resultIssues),
        errorMessage: optionalText(data.errorMessage),
      })
    },
    () => callback(null),
  )
}

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result ?? '')
      resolve(result.replace(/^data:.*;base64,/, ''))
    }
    reader.onerror = () => reject(reader.error ?? new Error('File read failed'))
    reader.readAsDataURL(file)
  })
}

function normalizeOcrStatus(value: unknown): BackendOcrJobStatus['status'] {
  return value === 'processing' || value === 'completed' || value === 'failed' ? value : 'queued'
}

function clampProgress(value: unknown) {
  const progress = typeof value === 'number' ? value : 0
  return Math.max(0, Math.min(100, Math.round(progress)))
}

function optionalText(value: unknown) {
  const text = String(value ?? '').trim()
  return text || undefined
}

function isSummary(value: unknown): value is BackendValidationReport['summary'] {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return ['total', 'pass', 'warning', 'error'].every((key) => typeof record[key] === 'number')
    && typeof record.usable === 'boolean'
}

function parseIssues(value: unknown): BackendValidationIssue[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value.map(parseIssue).filter((issue): issue is BackendValidationIssue => issue !== null)
}

function parseIssue(value: unknown): BackendValidationIssue | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const original = record.original && typeof record.original === 'object'
    ? record.original as Record<string, unknown>
    : {}
  if (record.status !== 'warning' && record.status !== 'error') return null

  return {
    rowNo: typeof record.rowNo === 'number' ? record.rowNo : 0,
    sourceLabel: optionalText(record.sourceLabel),
    status: record.status,
    issue: String(record.issue ?? ''),
    original: {
      classValue: String(original.classValue ?? ''),
      seatNo: String(original.seatNo ?? ''),
      name: String(original.name ?? ''),
    },
    suggestion: parseSuggestion(record.suggestion),
    confidence: typeof record.confidence === 'number' ? record.confidence : 0,
  }
}

function parseSuggestion(value: unknown): BackendValidationIssue['suggestion'] {
  if (!value || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  return {
    className: String(record.className ?? ''),
    seatNo: String(record.seatNo ?? ''),
    name: String(record.name ?? ''),
  }
}
