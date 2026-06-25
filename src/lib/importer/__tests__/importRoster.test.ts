import { describe, expect, it } from 'vitest'
import { buildDetectionResultFromTables, buildUnsupportedResult, selectCandidateTable } from '../importRoster'
import type { CandidateTable } from '../types'

describe('buildDetectionResultFromTables', () => {
  it('marks official student source when headers include student id and gender', () => {
    const tables: CandidateTable[] = [
      {
        id: '學生概況資料-3',
        sourceName: '學生資料概況.xls',
        sheetName: '學生概況資料',
        headerRow: 3,
        headers: ['學生姓名', '學號', '年級', '性別', '班級', '座號'],
        rows: [{ 學生姓名: '邱紘睿', 學號: '1140006', 年級: '1', 性別: '男', 班級: '1', 座號: '1' }],
        rowCount: 1,
      },
    ]

    const result = buildDetectionResultFromTables('學生資料概況.xls', 'excel', tables)

    expect(result.isOfficialStudentSource).toBe(true)
    expect(result.sourceStudents).toHaveLength(1)
    expect(result.importedRows).toHaveLength(1)
  })

  it('does not mark ordinary roster as official source', () => {
    const tables: CandidateTable[] = [
      {
        id: 'Sheet1-1',
        sourceName: '活動報名.xlsx',
        sheetName: 'Sheet1',
        headerRow: 1,
        headers: ['班級', '座號', '姓名'],
        rows: [{ 班級: '1年1班', 座號: '1', 姓名: '邱紘睿' }],
        rowCount: 1,
      },
    ]

    const result = buildDetectionResultFromTables('活動報名.xlsx', 'excel', tables)

    expect(result.isOfficialStudentSource).toBe(false)
    expect(result.sourceStudents).toHaveLength(0)
    expect(result.importedRows).toHaveLength(1)
  })

  it('selects candidate with the best roster signal', () => {
    const result = buildDetectionResultFromTables('多工作表.xlsx', 'excel', [
      {
        id: '說明-1',
        sourceName: '多工作表.xlsx',
        sheetName: '說明',
        headerRow: 1,
        headers: ['說明'],
        rows: [{ 說明: '請填寫資料' }],
        rowCount: 1,
      },
      {
        id: '名單-1',
        sourceName: '多工作表.xlsx',
        sheetName: '名單',
        headerRow: 1,
        headers: ['班級', '座號', '姓名'],
        rows: [
          { 班級: '101', 座號: '1', 姓名: '邱紘睿' },
          { 班級: '101', 座號: '2', 姓名: '黃宥寧' },
        ],
        rowCount: 2,
      },
    ])

    expect(result.selectedTable?.sheetName).toBe('名單')
  })

  it('rebuilds rows and field detection when selecting another candidate', () => {
    const result = buildDetectionResultFromTables('多工作表.xlsx', 'excel', [
      {
        id: '名單-1',
        sourceName: '多工作表.xlsx',
        sheetName: '名單',
        headerRow: 1,
        headers: ['班級', '座號', '姓名'],
        rows: [{ 班級: '101', 座號: '1', 姓名: '邱紘睿' }],
        rowCount: 1,
      },
      {
        id: '候補-1',
        sourceName: '多工作表.xlsx',
        sheetName: '候補',
        headerRow: 1,
        headers: ['班別', '座次', '學生姓名'],
        rows: [
          { 班別: '102', 座次: '3', 學生姓名: '林小華' },
          { 班別: '102', 座次: '4', 學生姓名: '陳小明' },
        ],
        rowCount: 2,
      },
    ])

    const selected = selectCandidateTable(result, '候補-1')

    expect(selected.selectedTable?.sheetName).toBe('候補')
    expect(selected.importedRows).toHaveLength(2)
    expect(selected.fieldDetection.columnMap.nameKey).toBe('學生姓名')
  })
})

describe('buildUnsupportedResult', () => {
  it('returns a teacher-facing message for PDF', () => {
    const result = buildUnsupportedResult('活動名單.pdf', 'pdf')
    expect(result.fieldDetection.warnings[0]).toContain('PDF')
  })

  it('returns a teacher-facing message for Word', () => {
    const result = buildUnsupportedResult('活動名單.docx', 'word')
    expect(result.fieldDetection.warnings[0]).toContain('Word')
  })
})
