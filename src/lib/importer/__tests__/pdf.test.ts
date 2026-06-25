import { describe, expect, it } from 'vitest'
import { tablesFromTextLines, textItemsToRows } from '../pdf'

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

describe('PDF positioned item joining', () => {
  // x 座標單位為 PDF point，欄位之間留大間距，列內姓名的字元彼此緊鄰。
  const item = (str: string, x: number, width: number) => ({ str, transform: [1, 0, 0, 1, x, 700], width })

  it('inserts column gaps for wide-spaced columns and keeps tight names together', () => {
    const rows = textItemsToRows(
      [item('101', 40, 18), item('1', 120, 6), item('邱', 200, 12), item('紘睿', 212, 24)],
      2,
    )

    expect(rows).toHaveLength(1)
    expect(rows[0].page).toBe(2)
    expect(rows[0].text.split(/\t|\s{2,}/)).toEqual(['101', '1', '邱 紘睿'])
  })
})
