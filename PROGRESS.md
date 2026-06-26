# 學生名單校對平台進度表

更新日期：2026-06-26

## 專案目標

建立一套給桃園市龍潭區石門國民小學使用的學生名單校對平台，讓行政人員或老師上傳名單後，系統能自動與學生資料庫比對班級、座號、姓名，標示錯誤並提供修正建議，降低獎狀、報名表、活動名冊等行政資料誤植機率。

## 目前完成進度

| 模組 | 目前狀態 | 完成內容 | 備註 |
|---|---|---|---|
| 專案骨架 | 已完成 | 建立 Vite + React + TypeScript 前端專案 | 可用 `npm run dev` 啟動 |
| 基礎 UI | 已完成 | 建立學生名單校對平台主畫面 | 支援桌機與手機版檢查 |
| 名單上傳 | 已完成 | 支援 `.xlsx`、`.xls`、`.csv` 老師名單上傳 | PDF / Word 已可解析（見下） |
| PDF 名單解析 | 已完成 | 抽取 PDF 文字、保留每列頁碼、依文字項寬度切分多欄版面 | 透過 `src/lib/importer/pdf.ts` |
| PDF 影像 OCR 後援 | 已完成 | 文字抽取失敗時用 tesseract.js（chi_tra+eng）對頁面影像辨識 | `src/lib/importer/ocr.ts`，動態載入、附逐頁進度與離線後援 |
| Word 名單解析 | 已完成 | 讀取 `.docx` 表格（含合併儲存格還原）與段落 / 條列名單 | 透過 `src/lib/importer/word.ts` |
| 舊版 .doc 後援 | 已完成 | best-effort 從 .doc 二進位還原文字（UTF-16LE、儲存格標記轉欄位） | 失敗時提示轉成 Excel / CSV |
| 來源位置標註 | 已完成 | 校對結果列顯示「來源」欄（PDF 頁碼 / Word 段落） | 一路帶到下載輸出 |
| 修正版 Word 輸出 | 已完成 | 一鍵把校對後名單輸出成 `.docx` | `src/lib/importer/exportWord.ts`，docx 套件動態載入 |
| 統一匯入管線 | 已完成 | Excel / CSV / PDF / Word 共用同一套解析、欄位偵測、信心評分流程 | `src/lib/importer/importRoster.ts` |
| 匯入診斷 | 已完成 | 顯示偵測到的表格、欄位對應與信心分數，匯入失敗時提供診斷訊息 | `src/lib/importer/diagnostics.ts` |
| 欄位辨識 | 已完成 | 自動偵測班級、座號、姓名欄位並計算偵測信心 | 可手動調整欄位對應 |
| 無標題列韌性 | 已完成 | 沒有欄名的檔案不再吃掉第一位學生，整份視為資料並用內容推測欄位 | `resolveHeader`，三種解析器共用 |
| 記住欄位對應 | 已完成 | 以表頭簽章記住老師手動調整的欄位對應，同結構檔案自動套用 | `src/lib/importer/columnMemory.ts` |
| 標題列逃生口 | 已完成 | 自動判斷錯誤時可手動重指定標題列或標記為無標題列 | 欄位對應區「標題列」下拉，附每列預覽 |
| 學生資料庫種子 | 已完成 | 已從本機學務系統匯出檔匯入 795 位學生，公開版已匿名化 | 輸出至 `src/data/students.json` |
| 學生資料庫更新 | 已完成 | 前端可上傳新的學生資料概況 `.xls` 更新本機資料庫 | 目前暫存於瀏覽器 `localStorage` |
| Firebase SDK | 已完成 | 已加入 Firebase 初始化、Google 登入、Firestore 讀寫服務 | 未設定 env 時會退回匿名示範模式 |
| Firestore 資料模型 | 已完成 | 已定義 `students`、`studentDatabaseMeta`、`admins` | 詳見 `FIREBASE_SETUP.md` |
| Firestore 安全規則 | 已完成 | 預設拒絕；僅 `admins/{uid}` 可讀寫學生資料 | 需部署到 Firebase project |
| GitHub Secrets 串接 | 已完成 | GitHub Actions 已可接收 `VITE_FIREBASE_*` secrets | 尚待填入正式 Firebase Web App config |
| 資料庫匯入腳本 | 已完成 | 新增 `scripts/import-students.mjs` | 可用 `npm run import:students -- "<檔案路徑>"` 重建種子資料 |
| 校對邏輯 | 已完成 | 比對班級、座號、姓名，產生通過、待確認、錯誤狀態 | 支援班級格式正規化、座號補零與中文姓名模糊校正 |
| 中文姓名校正 | 已完成 | 新增 `nameMatch.ts`，支援異體字 / 形近同音字 / 缺字多字 / 顛倒字與高、中、低信心分級 | 已補單元測試，接入校對流程 |
| 修正建議 | 已完成 | 可依班級 + 座號找到正確姓名，也可依姓名提示疑似學生 | 中文姓名校正引擎會標示建議信心與原因 |
| 批次校正 | 已完成 | 可單列套用建議或一鍵套用全部建議 | 系統仍保留人員確認流程 |
| 結果下載 | 已完成 | 匯出校對結果 Excel | 包含校對狀態、錯誤提示、建議班級、座號、姓名、信心分數 |
| 建置版本標記 | 已完成 | `scripts/finalize-build.mjs` 自動寫入 app 版本、`sw.js` 版本與 `version.json` | 用於 PWA 更新通知與快取破壞 |
| 建置 git 強化 | 已完成 | finalize-build 取版號的 git 呼叫加上 `safe.directory` 與明確 stdio | 避免 CI / 不同擁有者目錄下 git 報 dubious ownership 而拿不到 SHA |
| 文件 | 已完成 | 補 README、進度表、未來優化建議 | 供後續開發追蹤 |
| 驗證 | 已完成 | `npm run lint`、`npm run build`、匯入器單元測試、Playwright 畫面檢查通過 | 桌機與手機版皆已檢查 |

## 已知限制

| 項目 | 狀態 | 說明 |
|---|---|---|
| PDF / Word 解析 | 已完成 | 文字型 PDF（含頁碼 / 多欄）、掃描 PDF OCR、`.docx`（含合併儲存格）/ 段落、舊版 `.doc` best-effort 皆已支援 |
| .doc / OCR 辨識品質 | 需留意 | `.doc` 為 best-effort 文字還原、OCR 需下載語言資料且對低品質掃描準確度有限，建議優先轉成 Excel / CSV |
| 正式登入權限 | 尚未實作 | 目前是單機前端工具，尚無教師 / 行政角色登入 |
| 正式後端資料庫 | 部分完成 | 已加入 Firebase / Firestore 架構，尚待建立 Firebase project 與 secrets |
| 操作紀錄 | 尚未實作 | 尚未保存誰上傳、誰修正、何時下載 |
| Excel 解析安全性 | 需改善 | 目前使用 `xlsx`，`npm audit` 顯示套件有 high severity 且暫無官方修補版 |
| 大量名單效能 | 未壓測 | 第一版足以處理一般班級 / 活動名單，尚未針對全校大量檔案做效能測試 |

## 下一階段建議優先順序

| 優先 | 工作項目 | 原因 |
|---|---|---|
| P0 | 將 Excel 解析移到後端或替換安全套件 | 避免前端直接處理不可信檔案，降低上線風險 |
| P0 | 建立正式後端 API 與資料庫 | 學生資料不應長期只存在前端 JSON |
| P1 | 擴充中文姓名校正字典 | 第一版已支援常見異體 / 形近 / 同音，後續可依石門國小實際名冊誤植回饋擴充 |
| P1 | 增加登入與角色權限 | 區分老師、行政、系統管理員 |
| P1 | 增加校對紀錄與下載紀錄 | 行政流程需要追蹤責任與版本 |
| P1 | 強化錯誤分類與報表 | 讓行政人員快速知道錯在哪裡 |
| P2 | 校正 OCR 辨識結果（中文字典修正、表格框線偵測） | OCR 後援已可用，準確度仍可再提升 |
| P2 | 建立獎狀 / 報名表輸出模板 | 修正版 Word 已能輸出，可再擴成合併列印模板 |
