import { describe, expect, it } from 'vitest'
import { buildUnsupportedResult } from '../importRoster'

describe('unsupported document formats', () => {
  it('returns a teacher-facing message for PDF', () => {
    const result = buildUnsupportedResult('活動名單.pdf', 'pdf')
    expect(result.fieldDetection.warnings[0]).toContain('PDF')
  })

  it('returns a teacher-facing message for Word', () => {
    const result = buildUnsupportedResult('活動名單.docx', 'word')
    expect(result.fieldDetection.warnings[0]).toContain('Word')
  })
})
