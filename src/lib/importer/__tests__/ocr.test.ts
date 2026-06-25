import { describe, expect, it } from 'vitest'
import { ocrTextToRows } from '../ocr'

describe('ocrTextToRows', () => {
  it('splits recognized text into trimmed page-tagged rows', () => {
    const rows = ocrTextToRows('班級 座號 姓名\n101 1 邱紘睿\n\n  102 2 黃宥寧  \n', 4)

    expect(rows).toEqual([
      { text: '班級 座號 姓名', page: 4 },
      { text: '101 1 邱紘睿', page: 4 },
      { text: '102 2 黃宥寧', page: 4 },
    ])
  })
})
