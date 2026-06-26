---
name: OCR engine in Firebase Functions
description: How the image OCR pipeline is implemented inside processOcrJob / parseOcrPdf
---

## 設計決策

`parseOcrPdf(buffer)` 採雙段策略：
1. 先用 `pdfjs-dist` 文字抽取（文字型 PDF，fast path）
2. 若行數為 0，改呼叫 `pdfImageOcr(buffer)`（tesseract.js + @napi-rs/canvas）

**Why:** 文字型 PDF 不需要 OCR，省時又準；純影像掃描 PDF 才走重型路徑。

**How to apply:**
- `tesseract.js` 和 `@napi-rs/canvas` 已安裝在 `functions/`。
- 語言資料（`chi_tra.traineddata`、`eng.traineddata` — tessdata_fast 版）放在 `functions/lang/`，不在 node_modules，deploy 時要確認這個目錄有被打包進去。
- `pdfImageOcr` 內用 `import.meta.url` 解析語言資料路徑（`../lang` 相對於 `lib/index.js`）。
- `page.render` 需傳 `canvas: null as unknown as HTMLCanvasElement` 繞過 pdfjs-dist v6 的型別要求（Node 環境沒有 HTMLCanvasElement）。
- worker timeout 設 540s、memory 1GiB（在 processOcrJob options）。

**前端 UI 補強（同一 commit）：**
- `OcrJobProgress` 組件加入 `elapsedSeconds`（計時）+ `onReupload`（回調）。
- 等待 ≥ 180 秒顯示超時提示（amber）與「重新上傳其他檔案」按鈕。
- 失敗時也顯示重新上傳按鈕。
- 計時器 useEffect 必須放在 `isOcrJobPending` const 宣告之後，否則 TDZ 報錯。

**尚待完成：**
- Functions 正式部署（需學校 Firebase project + `--account=ipad@mail2.smes.tyc.edu.tw`）。
- 部署前確認 `functions/lang/` 目錄被 firebase deploy 打包（firebase.json 的 functions.ignore 不能排除 lang/）。
