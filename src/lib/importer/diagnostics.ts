export function summarizeImportDiagnostics(input: {
  fileName: string
  confidence: number
  headerRow?: number
  rowCount: number
  warnings: string[]
}) {
  const headerLine =
    input.headerRow === undefined
      ? '欄位列：未判定'
      : input.headerRow > 0
        ? `欄位列：第 ${input.headerRow} 列`
        : '欄位列：無標題列，由內容推測欄位'
  const lines = [
    `檔案：${input.fileName}`,
    `辨識信心：${input.confidence}%`,
    headerLine,
    `資料筆數：${input.rowCount}`,
  ]

  return [...lines, ...input.warnings.map((warning) => `提醒：${warning}`)].join('\n')
}
