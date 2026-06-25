import type { CandidateTable } from './types'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url'
import { tablesFromTextRows, type TextRow } from './textTable'

export type OcrProgress = { page: number; total: number }

const OCR_TABLE_OPTIONS = { idPrefix: 'pdf-ocr', sheetName: 'PDF 影像辨識' }
const OCR_LANGS = 'chi_tra+eng'
const OCR_SCALE = 2

// 影像 / 掃描型 PDF 沒有文字層，先把每頁渲染成點陣圖再用 tesseract.js 做 OCR。
// tesseract.js 與語言資料採動態載入，不會進入主要 bundle。
export async function ocrPdfTables(
  file: File,
  onProgress?: (info: OcrProgress) => void,
): Promise<CandidateTable[]> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
  const { createWorker } = await import('tesseract.js')

  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  const worker = await createWorker(OCR_LANGS)

  try {
    const rows: TextRow[] = []
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      onProgress?.({ page: pageNumber, total: pdf.numPages })
      const page = await pdf.getPage(pageNumber)
      const viewport = page.getViewport({ scale: OCR_SCALE })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      const context = canvas.getContext('2d')
      if (!context) continue

      await page.render({ canvasContext: context, viewport, canvas }).promise
      const { data } = await worker.recognize(canvas)
      rows.push(...ocrTextToRows(data.text, pageNumber))
    }
    return tablesFromTextRows(rows, file.name, OCR_TABLE_OPTIONS)
  } finally {
    await worker.terminate()
  }
}

export function ocrTextToRows(text: string, page: number): TextRow[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({ text: line, page }))
}

