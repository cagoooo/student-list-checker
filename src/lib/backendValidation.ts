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
  summary: {
    total: number
    pass: number
    warning: number
    error: number
    usable: boolean
  }
  issues: BackendValidationIssue[]
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
