import { describe, expect, it } from 'vitest'
import { summarizeImportDiagnostics } from '../diagnostics'

describe('summarizeImportDiagnostics', () => {
  it('creates teacher-readable diagnostics', () => {
    const summary = summarizeImportDiagnostics({
      fileName: '活動名單.xlsx',
      confidence: 72,
      headerRow: 2,
      rowCount: 30,
      warnings: ['找不到年級欄位'],
    })

    expect(summary).toContain('活動名單.xlsx')
    expect(summary).toContain('72%')
    expect(summary).toContain('第 2 列')
    expect(summary).toContain('提醒：找不到年級欄位')
  })
})
