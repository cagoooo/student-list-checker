import { describe, expect, it } from 'vitest'
import { decodeDocBytes, extractDocTextLines, tablesFromHtml } from '../word'

const CELL = String.fromCharCode(7) // .doc 表格儲存格標記
const NOISE = '�' // 解碼失敗的雜訊字元

function utf16le(text: string): ArrayBuffer {
  const buffer = new ArrayBuffer(text.length * 2)
  const view = new DataView(buffer)
  for (let i = 0; i < text.length; i += 1) view.setUint16(i * 2, text.charCodeAt(i), true)
  return buffer
}

describe('legacy .doc text recovery', () => {
  it('decodes utf-16le doc bytes back to text', () => {
    const decoded = decodeDocBytes(utf16le('班級座號姓名\r1011邱紘睿\r'))
    expect(decoded).toContain('邱紘睿')
  })

  it('turns cell marks into tab columns and drops binary noise', () => {
    const raw = `班級${CELL}座號${CELL}姓名\r${NOISE}${NOISE}101${CELL}1${CELL}邱紘睿\r`
    const lines = extractDocTextLines(raw)

    expect(lines).toEqual(['班級\t座號\t姓名', '101\t1\t邱紘睿'])
  })
})

describe('docx still imports after parseWordRoster split', () => {
  it('keeps parsing docx html tables', () => {
    const tables = tablesFromHtml(
      '<table><tr><td>班級</td><td>座號</td><td>姓名</td></tr><tr><td>101</td><td>1</td><td>邱紘睿</td></tr></table>',
      '名單.docx',
    )
    expect(tables[0].rows[0].姓名).toBe('邱紘睿')
  })
})
