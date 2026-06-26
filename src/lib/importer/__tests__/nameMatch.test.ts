import { describe, expect, it } from 'vitest'
import type { Student } from '../../../types'
import { compareChineseNames, findBestNameMatch } from '../nameMatch'

const students: Student[] = [
  student('101', '01', '陳玟萱'),
  student('101', '02', '黃宥寧'),
  student('101', '03', '林堃睿'),
]

describe('compareChineseNames', () => {
  it('treats variant characters as high confidence matches', () => {
    const result = compareChineseNames('陳峯堃', '陈峰坤')
    expect(result.level).toBe('high')
    expect(result.confidence).toBeGreaterThanOrEqual(90)
    expect(result.reasons).toContain('異體字')
  })

  it('recognizes similar or homophone characters', () => {
    const result = compareChineseNames('陳玟萱', '陳雯萱')
    expect(result.level).toBe('high')
    expect(result.reasons).toContain('形近字或同音字')
  })

  it('marks one missing or extra character as medium confidence', () => {
    const result = compareChineseNames('黃宥寧', '黃宥')
    expect(result.level).toBe('medium')
    expect(result.reasons).toContain('缺一字或多一字')
  })

  it('recognizes swapped adjacent characters', () => {
    const result = compareChineseNames('林堃睿', '林睿堃')
    expect(result.level).toBe('high')
    expect(result.reasons).toContain('顛倒字')
  })

  it('keeps unrelated names low confidence', () => {
    const result = compareChineseNames('黃宥寧', '王小明')
    expect(result.level).toBe('low')
    expect(result.confidence).toBeLessThan(65)
  })
})

describe('findBestNameMatch', () => {
  it('returns the strongest Chinese name candidate', () => {
    const result = findBestNameMatch('陳雯萱', students)
    expect(result?.student.name).toBe('陳玟萱')
    expect(result?.level).toBe('high')
  })
})

function student(classCode: string, seatNo: string, name: string): Student {
  return {
    id: `${classCode}-${seatNo}`,
    grade: Number(classCode[0]),
    classNo: Number(classCode.slice(1)),
    className: `${Number(classCode[0])}年${Number(classCode.slice(1))}班`,
    classCode,
    seatNo,
    name,
  }
}
