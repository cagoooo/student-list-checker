import { describe, expect, it } from 'vitest'
import { validateRow } from '../../../App'
import type { Student, ImportedRow } from '../../../types'

const mockStudents: Student[] = [
  {
    id: '101-01',
    grade: 1,
    classNo: 1,
    className: '1年1班',
    classCode: '101',
    seatNo: '01',
    name: '祝裕豐',
  },
  {
    id: '101-02',
    grade: 1,
    classNo: 1,
    className: '1年1班',
    classCode: '101',
    seatNo: '02',
    name: '林小華',
  },
]

describe('validateRow name-priority roster matching logic', () => {
  it('passes and matches student when only name is provided and matches exactly', () => {
    const row: ImportedRow = {
      id: 'row-1',
      rowNo: 1,
      classValue: '未填',
      seatNo: '01',
      name: '祝裕豐',
      raw: {},
    }

    const result = validateRow(row, mockStudents)
    expect(result.status).toBe('pass')
    expect(result.suggestion?.name).toBe('祝裕豐')
    expect(result.issue).toContain('姓名符合。已自動對應班級座號。')
  })

  it('passes and matches student when class is mismatch but name matches exactly', () => {
    const row: ImportedRow = {
      id: 'row-2',
      rowNo: 2,
      classValue: '1年2班',
      seatNo: '01',
      name: '祝裕豐',
      raw: {},
    }

    const result = validateRow(row, mockStudents)
    expect(result.status).toBe('pass')
    expect(result.suggestion?.name).toBe('祝裕豐')
    expect(result.issue).toContain('班級/座號未填或不符已忽略')
  })

  it('passes with exact match when everything matches', () => {
    const row: ImportedRow = {
      id: 'row-3',
      rowNo: 3,
      classValue: '1年1班',
      seatNo: '01',
      name: '祝裕豐',
      raw: {},
    }

    const result = validateRow(row, mockStudents)
    expect(result.status).toBe('pass')
    expect(result.suggestion?.name).toBe('祝裕豐')
    expect(result.issue).toBe('資料完全符合。')
  })

  it('suggests correction using seat number when name is misspelled but class/seat matches', () => {
    const row: ImportedRow = {
      id: 'row-4',
      rowNo: 4,
      classValue: '1年1班',
      seatNo: '01',
      name: '祝裕風', // misspelled
      raw: {},
    }

    const result = validateRow(row, mockStudents)
    expect(result.status).toBe('warning') // depending on homophone confidence
    expect(result.suggestion?.name).toBe('祝裕豐')
    expect(result.issue).toContain('姓名應為「祝裕豐」')
  })

  it('errors when name is completely missing', () => {
    const row: ImportedRow = {
      id: 'row-5',
      rowNo: 5,
      classValue: '1年1班',
      seatNo: '01',
      name: '',
      raw: {},
    }

    const result = validateRow(row, mockStudents)
    expect(result.status).toBe('error')
    expect(result.issue).toBe('缺少姓名，無法比對。')
  })
})
