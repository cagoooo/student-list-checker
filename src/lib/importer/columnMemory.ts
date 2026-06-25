import type { ColumnMap } from '../../types'

const STORAGE_KEY = 'roster-column-mappings'

// 以表頭內容當簽章：同樣欄名組合（含無標題列的合成欄名）就視為同一種檔案結構。
export function headerSignature(headers: string[]): string {
  return headers.map((header) => header.trim()).join('|')
}

function readStore(): Record<string, ColumnMap> {
  if (typeof localStorage === 'undefined') return {}
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, ColumnMap>) : {}
  } catch {
    return {}
  }
}

export function rememberColumnMap(headers: string[], map: ColumnMap) {
  const signature = headerSignature(headers)
  if (!signature || typeof localStorage === 'undefined') return
  const store = readStore()
  store[signature] = map
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch {
    // localStorage 容量已滿或被停用時略過，不影響校對流程。
  }
}

export function recallColumnMap(headers: string[]): ColumnMap | undefined {
  const signature = headerSignature(headers)
  if (!signature) return undefined
  return readStore()[signature]
}
