import { describe, expect, it } from 'vitest'
import { detectColumns, findHeaderRow, normalizeHeaders, resolveHeader } from '../excel'

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

  it('resolves the header row when labels exist', () => {
    expect(resolveHeader(rows)).toMatchObject({ headerIndex: 2, headerless: false })
  })
})

describe('headerless roster detection', () => {
  it('treats a file with no labels as data and synthesizes column names', () => {
    const rows = [
      ['101', '1', '邱紘睿'],
      ['101', '2', '黃宥寧'],
    ]

    const resolved = resolveHeader(rows)

    expect(resolved.headerless).toBe(true)
    expect(resolved.headers).toEqual(['欄位1', '欄位2', '欄位3'])
    expect(findHeaderRow(rows)).toBe(-1)
  })

  it('keeps the first row as header when it does not look like data', () => {
    const rows = [
      ['項目', '備註'],
      ['朗讀', '高年級'],
    ]

    expect(resolveHeader(rows)).toMatchObject({ headerIndex: 0, headerless: false })
  })
})
