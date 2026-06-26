# 學生名單校對平台進度表

更新日期：2026-06-26

## 專案目標

建立一套給桃園市龍潭區石門國民小學使用的學生名單校對平台，讓行政人員或老師上傳名單後，系統能自動在後端辨識檔案內容，並用正式學生資料庫比對班級、座號、姓名。前端只需要清楚回報「整份名單是否正確」以及「哪些學生姓名可能 KEY 錯或資料不符」，降低獎狀、報名表、活動名冊等行政資料誤植機率。正式主線不要求老師下載修正版再處理一次文件。

---

## 目前完成進度

### 前端 / UI

| 模組 | 狀態 | 完成內容 | 備註 |
|---|---|---|---|
| 專案骨架 | ✅ 已完成 | Vite + React + TypeScript 前端專案 | `npm run dev` 啟動 |
| 基礎 UI | ✅ 已完成 | 學生名單校對平台主畫面，支援桌機與手機版 | — |
| 校對結果回報頁 | ✅ 已完成 | 整份名單狀態 + 需確認問題清單，不再以修正版下載為主線 | — |
| 名單上傳 | ✅ 已完成 | 支援 `.xlsx`、`.xls`、`.csv`、`.pdf`、`.docx`、`.doc` | — |
| PDF 名單解析（文字型） | ✅ 已完成 | 抽取文字層、保留頁碼、依寬度切分多欄版面 | `src/lib/importer/pdf.ts` |
| PDF 影像 OCR（前端） | ✅ 已完成 | 文字層為空時，用 tesseract.js（chi_tra+eng）對頁面影像辨識；動態載入、附逐頁進度與離線後援 | `src/lib/importer/ocr.ts` |
| Word 名單解析 | ✅ 已完成 | `.docx` 表格（含合併儲存格還原）與段落 / 條列名單 | `src/lib/importer/word.ts` |
| 舊版 .doc 後援 | ✅ 已完成 | best-effort 從 `.doc` 二進位還原文字（UTF-16LE、儲存格標記） | 失敗時提示轉 Excel / CSV |
| 來源位置標註 | ✅ 已完成 | 校對結果顯示「來源」欄（PDF 頁碼 / Word 段落） | — |
| 統一匯入管線 | ✅ 已完成 | Excel / CSV / PDF / Word 共用同一套解析、欄位偵測、信心評分 | `src/lib/importer/importRoster.ts` |
| 匯入診斷 | ✅ 已完成 | 偵測表格、欄位對應、信心分數；失敗時提供診斷訊息可複製 | `src/lib/importer/diagnostics.ts` |
| 欄位辨識 | ✅ 已完成 | 自動偵測班級、座號、姓名欄位並計算偵測信心，可手動調整 | — |
| 無標題列韌性 | ✅ 已完成 | 無欄名檔案不吃掉第一位學生，整份視為資料並推測欄位 | `resolveHeader` |
| 記住欄位對應 | ✅ 已完成 | 以表頭簽章記住老師手動調整，同結構檔案自動套用 | `src/lib/importer/columnMemory.ts` |
| 標題列逃生口 | ✅ 已完成 | 可手動重指定標題列或標記無標題列，附每列預覽下拉 | — |
| OCR 進度 UI（前端） | ✅ 已補強 | `OcrJobProgress` 加入等待秒數計時、超過 180 秒顯示超時提示（amber）、失敗或超時後顯示「重新上傳其他檔案」按鈕 | — |
| 修正版 Word 輸出 | ✅ 已完成（輔助） | 一鍵輸出校對後名單成 `.docx` | `src/lib/importer/exportWord.ts` |
| 批次校正 | ✅ 已完成（輔助） | 單列套用建議或一鍵全部套用 | 非主線流程 |
| 結果下載 | ✅ 已完成（輔助） | 匯出校對結果 Excel | 非主線流程 |
| PWA / 版本更新 | ✅ 已完成 | Service Worker + 版本標記，有新版時自動提示更新 | `scripts/finalize-build.mjs` |

### 後端 / Firebase

| 模組 | 狀態 | 完成內容 | 備註 |
|---|---|---|---|
| Firebase SDK | ✅ 已完成 | 初始化、Google 登入、Firestore 讀寫；未設定 env 退回示範模式 | — |
| Firestore 資料模型 | ✅ 已完成 | `students`、`studentDatabaseMeta`、`admins`、`validations`、`ocrJobs` | 詳見 `FIREBASE_SETUP.md` |
| Firestore 安全規則 | ✅ 已完成 | 預設拒絕；`admins/{uid}` 可讀寫學生資料 | 需部署至 Firebase project |
| Storage 安全規則 | ✅ 已完成 | 前端預設不能讀寫 Storage；OCR PDF 只由 Functions Admin SDK 處理 | — |
| Firebase Functions 骨架 | ✅ 已完成 | `validateRosterRows`、`validateRosterFile`、`createOcrJob`、`processOcrJob` | 尚待部署 |
| 後端檔案校對 | ✅ 已完成 | `.xlsx` / `.csv` / `.docx` / 文字型 PDF 後端解析與比對 | 尚待部署 |
| 後端 OCR 背景工作 | ✅ 已完成第二版 | `createOcrJob` 暫存 PDF 至 Storage；`processOcrJob` 先試文字抽取，為空時自動切換 tesseract.js（`chi_tra+eng`，語言資料打包進 `functions/lang/`）；進度訊息細化至 25%→75%→100% | 尚待部署 |
| 校對紀錄 | ✅ 已完成 | 後端校對寫入 `validations` 摘要（不保存原始檔或完整名單） | 尚待部署 |
| OCR Job 即時追蹤 | ✅ 已完成 | 前端監聽 `ocrJobs/{jobId}` Firestore snapshot，即時更新進度 | — |
| 學生資料庫種子 | ✅ 已完成 | 795 位學生，公開版已匿名化 | `src/data/students.json` |
| 學生資料庫更新 | ✅ 已完成 | 前端上傳 `.xls` 更新本機資料庫；admin 可推至 Firebase | — |
| 資料庫匯入腳本 | ✅ 已完成 | `scripts/import-students.mjs` | `npm run import:students` |
| GitHub Actions 串接 | ✅ 已完成 | 接收 `VITE_FIREBASE_*` secrets | 尚待填入正式 Firebase config |

### 校對引擎

| 模組 | 狀態 | 完成內容 |
|---|---|---|
| 班級正規化 | ✅ 已完成 | 中文數字、年班格式、天干班碼統一轉三碼（如 `102`） |
| 座號正規化 | ✅ 已完成 | 補零、過濾非數字、範圍合理性 |
| 中文姓名校正引擎 | ✅ 已完成 | 異體字、形近同音字、缺字多字、顛倒字；高 / 中 / 低信心分級；含單元測試 |
| 模糊比對流程 | ✅ 已完成 | 精確→班+座→同名→全庫模糊，逐層回退 |
| 修正建議 | ✅ 已完成 | 依班+座找正確姓名；依姓名找疑似學生；標示信心與原因 |

---

## 2026-06-26 實測成功案例：ClassSwift / 分班檔交叉查核

這次用石門國小實際名單來回測試後，已確認系統不只會找出 KEY 錯，也能協助判斷「名單版本差異、正式資料庫缺漏、轉學空號」等行政資料問題。

| 測試檔案 | 結論 | 根本原因 | 對應修正 / 判讀方式 |
|---|---|---|---|
| `五年級各班名單.xls` | 解析修正成功 | 活頁簿以 `501`～`506` 工作表表示班級，但每列沒有班級欄，原本只吃到單一工作表且班級空白 | 已修正匯入器：從工作表名稱推班級，並合併多個班級工作表 |
| `三年級各班名單.xls` | 系統判讀正確 | `305` 班 12 號 `林定緯`、18 號 `林佳韻` 在 ClassSwift 名單中存在，但 Firestore 正式資料庫沒有 | 判定為正式資料庫缺漏或資料版本未更新，不是解析錯 |
| `二年級各班名單.xls` | 系統判讀正確 | `201` 班 Firestore 缺部分學生，造成後續座號錯位；以學號交叉查可看出多位學生存在但座號不同 | 判定為資料版本差異 / 正式資料庫座號資料需更新 |
| `205.xlsx` | 系統判讀正確，並釐清資料脈絡 | 新版分班檔 `205.xlsx` 與 Firestore 一致，`20510`、`20522` 是轉學後刻意空出的座號；較舊的二年級總表仍保留已轉學生 | 判定為新版資料正確；未來可把「姓名與信箱皆空白的班級座號列」標示為轉學空號或自動略過 |

### 已沉澱成全域技能

已新增全域 skill：`student-roster-crosscheck`。

用途：未來遇到學生名單校對結果異常時，快速套用這次成功流程，交叉查核 Excel / ClassSwift / Firestore / 不同版本來源，判斷是解析問題、正式資料缺漏、座號錯位、轉學空號，或舊檔版本差異。

技能已同步至三家工具的全域技能區：

- Antigravity (Gemini)：`C:\Users\smes\.gemini\config\skills\student-roster-crosscheck\`
- Codex：`C:\Users\smes\.Codex\skills\student-roster-crosscheck\`
- Codex：`C:\Users\smes\.agents\skills\student-roster-crosscheck\`

---

## 已知限制與待辦

| 項目 | 狀態 | 說明 |
|---|---|---|
| Firebase 正式部署 | ⏳ 待辦 | 需學校 Firebase project、secrets 與 `--account=ipad@mail2.smes.tyc.edu.tw` 部署 |
| OCR 辨識品質 | 需留意 | tesseract.js 對低品質掃描或手寫字準確度有限；建議優先用 Excel / CSV |
| 正式登入與角色權限 | ⏳ 未實作 | 目前單機前端工具，尚無教師 / 行政 / admin 角色區分 |
| 操作紀錄完整性 | 部分完成 | 後端校對已保存摘要；下載紀錄與任務流程尚未實作 |
| Excel 解析安全性 | 需改善 | 前端使用 `xlsx` 套件有 high severity audit 警告，暫無官方修補版 |
| `.xls` 後端解析 | ⏳ 未實作 | 後端目前僅支援 `.xlsx`，舊版 `.xls` 仍走前端 |
| Storage TTL 清理 | ⏳ 未實作 | OCR 暫存 PDF 應設 GCS lifecycle rule 自動清理（建議 1 天） |
| 大量名單效能 | 未壓測 | 第一版足以處理一般班級名單；全校大量上傳尚未壓測 |

---

## 未來優化改良與可開發功能建議

詳見下方 `ROADMAP.md` 或本文件末尾的建議清單。
