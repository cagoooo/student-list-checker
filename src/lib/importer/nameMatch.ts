import type { Student } from '../../types'
import { normalizeName } from './normalize'

export type NameConfidenceLevel = 'high' | 'medium' | 'low'

export type NameComparison = {
  expected: string
  actual: string
  confidence: number
  level: NameConfidenceLevel
  reasons: string[]
}

export type NameMatch = NameComparison & {
  student: Student
}

const VARIANT_GROUPS = [
  '陳陈',
  '峯峰',
  '堃坤',
  '臺台',
  '羣群',
  '祐佑',
  '杰傑',
  '彦彥',
  '蘇苏',
  '黃黄',
  '劉刘',
  '張张',
  '鄭郑',
  '葉叶',
  '吳吴',
  '謝谢',
  '羅罗',
  '賴赖',
  '鍾鐘钟',
] as const

const SIMILAR_GROUPS = [
  '玟雯',
  '宥侑佑祐',
  '萱瑄宣',
  '瑜榆渝',
  '晴睛',
  '廷庭',
  '恩茵',
  '睿叡',
  '喆哲',
  '妍姸',
  '穎頴',
] as const

const variantMap = buildAliasMap(VARIANT_GROUPS)
const similarMap = buildAliasMap(SIMILAR_GROUPS)

export function compareChineseNames(expectedValue: string, actualValue: string): NameComparison {
  const expected = normalizeForMatch(expectedValue)
  const actual = normalizeForMatch(actualValue)

  if (!expected || !actual) return buildComparison(expected, actual, 0, ['姓名空白'])
  if (expected === actual) return buildComparison(expected, actual, 100, ['姓名完全相同'])

  const reasons = new Set<string>()
  if (canonicalize(expected, variantMap) === canonicalize(actual, variantMap)) {
    reasons.add('異體字')
    return buildComparison(expected, actual, 96, [...reasons])
  }

  if (isTransposed(expected, actual)) {
    reasons.add('顛倒字')
    return buildComparison(expected, actual, 88, [...reasons])
  }

  const lengthDiff = Math.abs([...expected].length - [...actual].length)
  if (isOneCharInsertOrDelete(expected, actual)) reasons.add(lengthDiff > 0 ? '缺一字或多一字' : '單字差異')

  const weightedDistance = nameDistance(expected, actual, reasons)
  const confidence = Math.max(0, Math.min(99, Math.round(100 - weightedDistance * 28 - lengthDiff * 6)))
  if (weightedDistance <= 0.45 && reasons.size === 0) reasons.add('姓名近似')
  if (reasons.size === 0 && confidence >= 55) reasons.add('字串距離接近')

  return buildComparison(expected, actual, confidence, [...reasons])
}

export function findBestNameMatch(actualName: string, students: Student[]): NameMatch | null {
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

function buildComparison(expected: string, actual: string, confidence: number, reasons: string[]): NameComparison {
  return {
    expected,
    actual,
    confidence,
    level: confidence >= 85 ? 'high' : confidence >= 65 ? 'medium' : 'low',
    reasons,
  }
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
