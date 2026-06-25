import { describe, expect, it } from 'vitest'
import { tablesFromTextLines } from '../pdf'

describe('PDF text line roster extraction', () => {
  it('extracts roster-like rows from whitespace separated lines', () => {
    const lines = ['班級 座號 姓名', '101 1 邱紘睿', '101 2 黃宥寧']

    const tables = tablesFromTextLines(lines, '名單.pdf')

    expect(tables[0].headers).toEqual(['班級', '座號', '姓名'])
    expect(tables[0].rowCount).toBe(2)
    expect(tables[0].rows[1].姓名).toBe('黃宥寧')
  })

  it('returns no candidates when no text rows are table-like', () => {
    const tables = tablesFromTextLines(['這是一段沒有欄位的說明文字'], '掃描檔.pdf')

    expect(tables).toHaveLength(0)
  })
})
