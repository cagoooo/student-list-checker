import { describe, expect, it } from 'vitest'
import { tablesFromHtml } from '../word'

describe('Word table extraction', () => {
  it('extracts roster table from docx html', () => {
    const html =
      '<table><tr><td>班級</td><td>座號</td><td>姓名</td></tr><tr><td>101</td><td>1</td><td>邱紘睿</td></tr></table>'

    const tables = tablesFromHtml(html, '名單.docx')

    expect(tables[0].headers).toEqual(['班級', '座號', '姓名'])
    expect(tables[0].rowCount).toBe(1)
    expect(tables[0].rows[0].姓名).toBe('邱紘睿')
  })

  it('cleans nested html inside table cells', () => {
    const html =
      '<table><tr><td><strong>班級</strong></td><td>座號</td><td>姓名</td></tr><tr><td>101</td><td>2</td><td>黃&nbsp;宥寧</td></tr></table>'

    const tables = tablesFromHtml(html, '名單.docx')

    expect(tables[0].headers[0]).toBe('班級')
    expect(tables[0].rows[0].姓名).toBe('黃 宥寧')
  })

  it('fills rowspan merged cells down so columns stay aligned', () => {
    const html =
      '<table>' +
      '<tr><td>組別</td><td>班級</td><td>座號</td><td>姓名</td></tr>' +
      '<tr><td rowspan="2">第一組</td><td>101</td><td>1</td><td>邱紘睿</td></tr>' +
      '<tr><td>102</td><td>2</td><td>黃宥寧</td></tr>' +
      '</table>'

    const tables = tablesFromHtml(html, '名單.docx')

    expect(tables[0].headers).toEqual(['組別', '班級', '座號', '姓名'])
    expect(tables[0].rowCount).toBe(2)
    expect(tables[0].rows[0].組別).toBe('第一組')
    expect(tables[0].rows[1].組別).toBe('第一組')
    expect(tables[0].rows[1].姓名).toBe('黃宥寧')
  })

  it('extracts roster rows from paragraphs when there is no table', () => {
    const html = '<p>班級 座號 姓名</p><p>101 1 邱紘睿</p><p>102 2 黃宥寧</p>'

    const tables = tablesFromHtml(html, '名單.docx')

    expect(tables[0].sheetName).toBe('Word 段落名單')
    expect(tables[0].rowCount).toBe(2)
    expect(tables[0].rows[1].姓名).toBe('黃宥寧')
  })
})
