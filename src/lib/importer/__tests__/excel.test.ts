import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { buildDetectionResultFromTables } from '../importRoster'
import { buildFrameFromRows, detectColumns, findHeaderRow, normalizeHeaders, parseExcelTables, resolveHeader } from '../excel'

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

describe('manual header row override', () => {
  const rawRows = [
    ['活動報名表'],
    ['班級', '座號', '姓名'],
    ['101', '1', '邱紘睿'],
    ['101', '2', '黃宥寧'],
  ]

  it('rebuilds headers and data from a chosen header row', () => {
    const frame = buildFrameFromRows(rawRows, 2)

    expect(frame.headerRow).toBe(2)
    expect(frame.headers).toEqual(['班級', '座號', '姓名'])
    expect(frame.rowCount).toBe(2)
    expect(frame.rows[0].姓名).toBe('邱紘睿')
  })

  it('treats header row 0 as headerless and keeps all rows', () => {
    const frame = buildFrameFromRows(rawRows, 0)

    expect(frame.headerRow).toBe(0)
    expect(frame.headers[0]).toBe('欄位1')
    expect(frame.rowCount).toBe(4)
  })
})

describe('class-coded sheets', () => {
  it('combines class sheets and fills class value from the sheet name', () => {
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        ['座號', '顯示名稱(最多16個字元)', 'Email', '組別'],
        ['1', '石爵綸', '1100150@mail2.smes.tyc.edu.tw', '1'],
        ['2', '', '', '2'],
        ['3', '楊祐軒', '1100136@mail2.smes.tyc.edu.tw', '3'],
      ]),
      '501',
    )
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        ['座號', '顯示名稱(最多16個字元)', 'Email', '組別'],
        ['1', '林宗葳', '1100164@mail2.smes.tyc.edu.tw', '1'],
        ['2', '林宗誼', '1100165@mail2.smes.tyc.edu.tw', '2'],
      ]),
      '502',
    )

    const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xls' }) as ArrayBuffer
    const tables = parseExcelTables(buffer, '五年級各班名單.xls')
    const result = buildDetectionResultFromTables('五年級各班名單.xls', 'excel', tables)

    expect(result.selectedTable?.id).toBe('combined-class-sheets-2')
    expect(result.importedRows).toHaveLength(4)
    expect(result.importedRows[0]).toMatchObject({
      classValue: '501',
      seatNo: '01',
      name: '石爵綸',
      sourceLabel: '501',
    })
    expect(result.importedRows[1]).toMatchObject({
      classValue: '501',
      seatNo: '03',
      name: '楊祐軒',
      sourceLabel: '501',
    })
    expect(result.importedRows[2]).toMatchObject({
      classValue: '502',
      seatNo: '01',
      name: '林宗葳',
      sourceLabel: '502',
    })
  })
})

describe('horizontal multi-column sheet flattening', () => {
  it('detects and flattens horizontal side-by-side student sections', () => {
    const workbook = XLSX.utils.book_new()
    const aoa = [
      ['學校活動名單', '', '', '', '', '', '', ''],
      ['', '', '', '', '', '', '', ''],
      ['', '班級：', '1年1班', '', '', '班級：', '1年2班', ''],
      ['', '', '', '', '', '', '', ''],
      ['編號', '座號', '姓名', '', '編號', '座號', '姓名', ''],
      ['1', '1', '邱紘睿', '', '1', '4', '石書懿', ''],
      ['2', '2', '黃宥寧', '', '2', '5', '陳楷澄', ''],
    ]

    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(aoa), '工作表1')
    const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
    const tables = parseExcelTables(buffer, '一年級.xlsx')
    
    expect(tables).toHaveLength(1)
    const table = tables[0]
    expect(table.headers).toEqual(['班級', '座號', '姓名'])
    expect(table.rows).toHaveLength(4)
    expect(table.rows[0]).toMatchObject({
      '班級': '1年1班',
      '座號': '1',
      '姓名': '邱紘睿',
    })
    expect(table.rows[1]).toMatchObject({
      '班級': '1年2班',
      '座號': '4',
      '姓名': '石書懿',
    })
    expect(table.rows[2]).toMatchObject({
      '班級': '1年1班',
      '座號': '2',
      '姓名': '黃宥寧',
    })
  })
})
