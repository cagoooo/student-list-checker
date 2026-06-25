import { describe, expect, it } from 'vitest'
import { SOURCE_LOCATION_KEY } from '../normalize'
import { splitCells, tablesFromTextRows } from '../textTable'

describe('splitCells', () => {
  it('keeps single-spaced names intact when columns use wide gaps', () => {
    expect(splitCells('101\t1\t陳 大文')).toEqual(['101', '1', '陳 大文'])
    expect(splitCells('101   1   陳 大文')).toEqual(['101', '1', '陳 大文'])
  })

  it('falls back to single-space split when no wide gaps exist', () => {
    expect(splitCells('101 1 邱紘睿')).toEqual(['101', '1', '邱紘睿'])
  })
})

describe('tablesFromTextRows', () => {
  it('tags each data row with its source page', () => {
    const tables = tablesFromTextRows(
      [
        { text: '班級 座號 姓名', page: 1 },
        { text: '101 1 邱紘睿', page: 1 },
        { text: '102 2 黃宥寧', page: 3 },
      ],
      '名單.pdf',
      { idPrefix: 'pdf', sheetName: 'PDF 文字表格' },
    )

    expect(tables[0].rows[0][SOURCE_LOCATION_KEY]).toBe('第 1 頁')
    expect(tables[0].rows[1][SOURCE_LOCATION_KEY]).toBe('第 3 頁')
  })

  it('keeps every row when the source has no header line', () => {
    const tables = tablesFromTextRows(
      [
        { text: '101 1 邱紘睿' },
        { text: '101 2 黃宥寧' },
      ],
      '無標題.pdf',
      { idPrefix: 'pdf', sheetName: 'PDF 文字表格' },
    )

    expect(tables[0].headerRow).toBe(0)
    expect(tables[0].headers).toEqual(['欄位1', '欄位2', '欄位3'])
    expect(tables[0].rowCount).toBe(2)
  })
})
