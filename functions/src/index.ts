import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/https'
import { setGlobalOptions } from 'firebase-functions/options'

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
  summary: {
    total: number
    pass: number
    warning: number
    error: number
    usable: boolean
  }
  issues: ValidationIssue[]
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
  const email = request.auth?.token.email
  if (!email || !isSchoolEmail(email)) {
    throw new HttpsError('permission-denied', '請使用石門國小 Google 帳號登入後再校對名單。')
  }

  const rows = Array.isArray(request.data?.rows) ? request.data.rows : []
  if (rows.length === 0) {
    throw new HttpsError('invalid-argument', '缺少可校對的名單資料。')
  }
  if (rows.length > 2000) {
    throw new HttpsError('invalid-argument', '單次校對最多支援 2000 筆資料。')
  }

  const students = await loadStudents()
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
})

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
