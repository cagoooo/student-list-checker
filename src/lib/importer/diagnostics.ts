export function summarizeImportDiagnostics(input: {
  fileName: string
  confidence: number
  headerRow?: number
  rowCount: number
  warnings: string[]
}) {
  const lines = [
    `檔案：${input.fileName}`,
    `辨識信心：${input.confidence}%`,
    input.headerRow ? `欄位列：第 ${input.headerRow} 列` : '欄位列：未判定',
    `資料筆數：${input.rowCount}`,
  ]

  return [...lines, ...input.warnings.map((warning) => `提醒：${warning}`)].join('\n')
}
