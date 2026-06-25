import { describe, expect, it } from 'vitest'
import { detectRosterFields } from '../fieldDetection'
import type { CandidateTable } from '../types'

describe('detectRosterFields', () => {
  it('returns high confidence for explicit headers', () => {
    const table: CandidateTable = {
      id: 'sheet-3',
      sourceName: '名單.xlsx',
      sheetName: 'Sheet1',
      headerRow: 3,
      headers: ['學生姓名', '學號', '年級', '性別', '班級', '座號'],
      rows: [
        { 學生姓名: '邱紘睿', 年級: '1', 班級: '1', 座號: '1' },
        { 學生姓名: '黃宥寧', 年級: '1', 班級: '1', 座號: '2' },
      ],
      rowCount: 2,
    }

    const result = detectRosterFields(table)
    expect(result.confidence).toBeGreaterThanOrEqual(90)
    expect(result.columnMap).toMatchObject({
      nameKey: '學生姓名',
      gradeKey: '年級',
      classKey: '班級',
      seatKey: '座號',
    })
  })

  it('uses content patterns when headers are generic', () => {
    const table: CandidateTable = {
      id: 'sheet-1',
      sourceName: '活動名單.xlsx',
      sheetName: 'Sheet1',
      headerRow: 1,
      headers: ['欄位1', '欄位2', '欄位3'],
      rows: [
        { 欄位1: '101', 欄位2: '08', 欄位3: '王小安' },
        { 欄位1: '一年一班', 欄位2: '12', 欄位3: '陳小琪' },
      ],
      rowCount: 2,
    }

    const result = detectRosterFields(table)
    expect(result.confidence).toBeGreaterThanOrEqual(60)
    expect(result.columnMap.classKey).toBe('欄位1')
    expect(result.columnMap.seatKey).toBe('欄位2')
    expect(result.columnMap.nameKey).toBe('欄位3')
  })
})
