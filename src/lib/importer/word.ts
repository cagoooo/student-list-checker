import type { CandidateTable } from './types'
import { findHeaderRow, normalizeHeaders, toRecord } from './excel'
import { toText } from './normalize'

export async function parseWordTables(file: File): Promise<CandidateTable[]> {
  const mammoth = await import('mammoth')
  const result = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() })
  return tablesFromHtml(result.value, file.name)
}

export function tablesFromHtml(html: string, sourceName: string): CandidateTable[] {
  const tableMatches = [...html.matchAll(/<table[\s\S]*?<\/table>/gi)]

  return tableMatches
    .map((match, index): CandidateTable | null => {
      const extractedRows = [...match[0].matchAll(/<tr[\s\S]*?<\/tr>/gi)]
        .map((rowMatch) =>
          [...rowMatch[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
            .map((cell) => cleanHtmlCell(cell[1]))
            .filter((cell) => cell !== ''),
        )
        .filter((row) => row.length > 0)

      if (extractedRows.length === 0) return null

      const headerIndex = findHeaderRow(extractedRows)
      const headers = normalizeHeaders(extractedRows[headerIndex] ?? [])
      const dataRows = extractedRows
        .slice(headerIndex + 1)
        .map((row, rowIndex) => toRecord(row, headers, headerIndex + rowIndex + 2))
        .filter((row) =>
          Object.entries(row)
            .filter(([key]) => !key.startsWith('__'))
            .some(([, value]) => toText(value) !== ''),
        )

      return {
        id: `word-table-${index + 1}`,
        sourceName,
        sheetName: `Word 表格 ${index + 1}`,
        headerRow: headerIndex + 1,
        headers,
        rows: dataRows,
        rowCount: dataRows.length,
      }
    })
    .filter((table): table is CandidateTable => table !== null)
}

function cleanHtmlCell(value: string) {
  return decodeHtmlEntities(value.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
}
