export const ROW_NUMBER_KEY = '__rowNo'
export const SOURCE_LOCATION_KEY = '__source'

export const digitAliases: Record<string, string> = {
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

export const classOrder: Record<string, string> = {
  甲: '01',
  乙: '02',
  丙: '03',
  丁: '04',
  戊: '05',
}

export function toText(value: unknown) {
  return value === null || value === undefined ? '' : String(value).trim()
}

export function normalizeHeaders(row: unknown[]) {
  const used = new Map<string, number>()
  return row.map((cell, index) => {
    const base = toText(cell).replace(/\s+/g, '') || `欄位${index + 1}`
    const count = used.get(base) ?? 0
    used.set(base, count + 1)
    return count === 0 ? base : `${base}_${count + 1}`
  })
}

export function toDigit(value: string) {
  return value
    .split('')
    .map((char) => digitAliases[char] ?? char)
    .join('')
}

export function normalizeSeat(value: string) {
  const number = Number(value.replace(/[^\d]/g, ''))
  return Number.isFinite(number) && number > 0 ? String(number).padStart(2, '0') : ''
}

export function normalizeName(value: string) {
  return value.replace(/\s/g, '').trim()
}
