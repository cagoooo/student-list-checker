import { describe, expect, it } from 'vitest'
import { detectColumns, findHeaderRow, normalizeHeaders } from '../excel'

describe('excel roster detection', () => {
  const rows = [
    ['產製時間：2026/06/25 15:28:31  產製人：石門國小 黃凱揚', '', '', '', '', ''],
    ['', '', '', '', '', ''],
    ['學生姓名      ', '學號                ', '年級   ', '性別   ', '班級   ', '座號   '],
    ['邱紘睿', '1140006', '1', '男', '1', '1'],
  ]

  it('finds the real header row after report metadata', () => {
    expect(findHeaderRow(rows)).toBe(2)
  })

  it('normalizes spaced headers', () => {
    expect(normalizeHeaders(rows[2])).toEqual(['學生姓名', '學號', '年級', '性別', '班級', '座號'])
  })

  it('detects grade class seat and name columns', () => {
    const headers = normalizeHeaders(rows[2])
    expect(detectColumns(headers)).toEqual({
      nameKey: '學生姓名',
      gradeKey: '年級',
      classKey: '班級',
      seatKey: '座號',
    })
  })
})
