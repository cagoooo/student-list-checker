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
})
