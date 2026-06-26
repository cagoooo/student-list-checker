# 接手提示詞 — 學生名單校對平台（給下一個 AI agent）

> 把這整份貼給接手的 agent（Claude Code / Codex / Antigravity）即可冷啟動接續。
> 最後更新：2026-06-26

---

## 0. 你的角色與最高使命

你接手的是**桃園市龍潭區石門國民小學（石門國小，網域 smes.tyc.edu.tw）**的「學生名單校對平台」。

> ⚠️ 學校是「**石門**國小」，不是「新明」。任何 footer／署名／文案都要寫「桃園市龍潭區石門國民小學」或「石門國小」。

**最重要的開發方向（使用者一再強調）**：
> **讓使用者上傳任何格式的文件，系統都能「辨識」並「校正」學生名單（班級／座號／姓名）。**

行政情境：老師上傳活動名冊、報名表、獎狀名單，系統自動跟學生資料庫比對班級／座號／姓名，標出錯誤並給修正建議，降低誤植。

### 與使用者協作的規則（務必遵守）
- **一律用繁體中文**回報、總結、說明（技術名詞如 `useState`、`git push` 可保留原文）。用英文回報使用者會不開心。
- **小修正（UI 微調、文案、單檔 <20 行、同一脈絡延伸）做完直接 `git add`+`commit`+`push`，不用每次問**。跨檔重構（>3 檔）、刪功能、改 schema/auth/不可逆動作才需先確認。
- commit 訊息結尾固定加一行：`Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`（接手者可改成自己的署名）。
- 寫任何 footer 前先確認是「石門」不是「新明」（這專案 footer 已正確顯示「阿凱老師」連學校教師頁）。

---

## 1. 專案座標

| 項目 | 值 |
|---|---|
| 本機路徑 | `H:\Refine`（Windows 11，PowerShell 為主，也有 Git Bash） |
| Git remote | https://github.com/cagoooo/student-list-checker.git |
| 分支 | `main`（直接推 main，這是慣例） |
| 線上 demo | https://cagoooo.github.io/student-list-checker/ （GitHub Pages，build 後自動部署） |
| Git 帳號 | `cagoooo`（gh CLI 已認證，個人帳號綁 GitHub） |
| Firebase/GCP | 教學專案 owner 是學校帳號 `ipad@mail2.smes.tyc.edu.tw`；操作 firebase/gcloud 要加 `--account=ipad@mail2.smes.tyc.edu.tw` |

---

## 2. 技術棧與指令

- **Vite 8 + React 19 + TypeScript**（純前端，無自建後端；Firebase SDK 已接但未啟用正式 project）
- 解析相依：`xlsx`(Excel/CSV)、`pdfjs-dist`(PDF 文字+渲染)、`mammoth`(docx)、`tesseract.js`(OCR，動態載入)、`docx`(輸出 Word，動態載入)
- 測試 `vitest`、Lint `oxlint`

```bash
npm run dev          # 開發伺服器 (port 5173)
npm run test         # vitest run（目前 ~37 測試全綠，動程式碼務必先綠燈再 commit）
npm run lint         # oxlint
npx tsc -b           # 型別檢查
npm run build        # tsc + vite build + scripts/finalize-build.mjs（寫入版本號/sw.js/version.json）
```

驗證 UI 變更：用內建 preview 工具（`preview_start` 取 server `refine-dev` → `preview_eval`/`preview_snapshot`/`preview_console_logs`）；**不要叫使用者手動驗，自己驗完再回報**。

---

## 3. 匯入管線架構（`src/lib/importer/`）— 這是專案核心

統一入口 `importRosterFile(file, options?)`：依副檔名分流，全部產出 `CandidateTable[]` → 排名選最佳 → 偵測欄位 → 產 `ImportedRow[]`。

| 檔案 | 職責 |
|---|---|
| `importRoster.ts` | 總管線：分流、`buildDetectionResultFromTables`、`selectCandidateTable`、`applyHeaderRow`（手動重指定標題列）、PDF→OCR 後援 |
| `excel.ts` | Excel/CSV 解析；**`resolveHeader`/`findHeaderRow`/`buildFrameFromRows`（標題列判定核心，三種格式共用）**、`detectColumns`、`hasRowContent` |
| `textTable.ts` | PDF 文字與 Word 段落共用的「文字列→表格」抽取（`splitCells` 多欄切分、`tablesFromTextRows` 帶頁碼） |
| `pdf.ts` | PDF 文字抽取，保留每列頁碼、用文字項寬度切多欄（`textItemsToRows`） |
| `ocr.ts` | 掃描 PDF 後援：頁面渲染成 canvas → tesseract.js（chi_tra+eng，動態載入、逐頁進度） |
| `word.ts` | docx（`parseTableGrid` 還原 colspan/rowspan、段落抽取）＋ `.doc` best-effort（`extractDocTextLines`）＋ `parseWordRoster` 分流 |
| `exportWord.ts` | 用 docx 套件輸出「修正版 Word」（.docx），動態載入 |
| `fieldDetection.ts` | 欄位偵測：表頭關鍵字 + **資料樣態評分**（座號/姓名/班級內容比例）+ 信心分數 |
| `studentSource.ts` | `hydrateRow`/`buildImportedRows`、班級正規化、官方學生原始檔判定 |
| `normalize.ts` | `ROW_NUMBER_KEY='__rowNo'`、`SOURCE_LOCATION_KEY='__source'`、座號/姓名/中文數字正規化 |
| `columnMemory.ts` | 以表頭簽章記住老師手動欄位對應（localStorage），同結構檔案自動套用 |
| `diagnostics.ts` | 辨識報告文字（可一鍵複製給資訊組長） |
| `types.ts` | `CandidateTable`（含 `headerRow`、`rawRows`）、`FieldDetection`、`ImportDetectionResult` |

UI 在 `src/App.tsx`（單檔）：上傳、欄位對應面板（含「標題列」逃生口下拉、欄位對應下拉、候選表格選擇）、校對結果表（含「來源」欄顯示 PDF 頁碼）、下載校對結果(xlsx)/修正版 Word(docx)。

### 重要約定
- `CandidateTable.headerRow === 0` 代表**無標題列**（整份視為資料，欄名合成為「欄位1…N」）。顯示時用 `headerRowLabel()` 處理 0 的情況。
- row 記錄裡 `__` 開頭的 key 是 meta（rowNo、來源），過濾與輸出時都要排除。
- **tesseract.js 與 docx 一律動態 `import()`**，不要進主 bundle。

---

## 4. 已完成（git log 對照）

1. 統一匯入管線 + 欄位信心分數 + 匯入診斷（更早期）
2. **PDF 頁碼 + 多欄版面**（`ab6fd6f`）
3. **Word 合併儲存格 + 段落抽取**（`679a196`）
4. **掃描 PDF 的 OCR 後援**（`4e620ee`）
5. **.doc best-effort + 輸出修正版 Word**（`22cd432`）
6. **P0-1 辨識韌性**：無標題列復原（`5e12441`）、記住欄位對應（`38460d6`）、手動重指定標題列逃生口（`dfdb07d`）

進度表 `PROGRESS.md`、完整建議清單 `ROADMAP.md` 都已同步到最新。

---

## 5. 接下來要做的（依使命排序）— 從這裡接手

### ⭐ P0-2　中文姓名校正引擎升級（建議優先做，最貼近「校正」使命）
目前比對是簡單字串距離（見 `App.tsx` 的 `validateRow` 與相關比對邏輯）。要做：
- **形近字／異體字**（陳vs陈、峯vs峰、堃vs坤）、**同音字**（玟/雯、宥/侑）、**缺一字/多一字/顛倒字**辨識。
- **信心分級**：高（可自動建議）/ 中（標示待確認）/ 低（必須人工）。
- 建議新增 `src/lib/importer/nameMatch.ts`（純函式、好單元測試），把姓名模糊比對抽出來，附中文測資。

### P0-3　Excel 解析安全化（安全面 P0，可並行）
`xlsx` 套件有 high severity 弱點（`npm audit` 可見，無官方修補）。定位是「老師上傳不可信檔案」，上線前要：換維護中的解析方案、或限制檔案大小/工作表數、後端隔離。先評估替代套件（如 `exceljs`）的相容成本。

### P1（撐到全校量、好用）
- **重複/衝突偵測**：同名學生、座號重複、同一人出現在多項目、班級不存在。
- **錯誤分類細緻化 + 篩選**：把「姓名錯字/班級錯/座號錯/查無此人」分類，UI 加「只看錯誤・只看待確認・依班級」篩選。
- **錯誤定位**：點一列展開比對細節；PDF/Word 用已有的「來源」頁碼做跳轉。
- **OCR/PDF 辨識後處理**：用學生名冊當字典回頭校正 OCR 結果、表格框線偵測。
- **上傳前導引**：範例檔下載（已有「範例檔」按鈕）、上傳前格式檢查、辨識失敗友善導引。

> 完整版（24+ 項，含後端/權限/部署/維運）見 `ROADMAP.md`。後端化、登入角色權限、操作紀錄屬另一條 P0 線（資料安全），可視需求穿插。

---

## 6. 踩雷備忘（接手前先讀，省得重踩）

- **regex 不要放字面控制字元**：處理 .doc 二進位時，曾把 `\x00`-`\x1f` 等控制字元直接寫進 regex literal，導致原始碼被控制字元拆行、難維護。正解是**逐字元用 `codePointAt` 判斷字碼**（見 `word.ts` 的 `extractDocTextLines`），測試輸入也用 `String.fromCharCode(7)` 建構。
- **PowerShell vs Bash**：本機主要 PowerShell（不支援 `&&`、無 `head/tail`），但有 Git Bash 工具可跑 POSIX。檔案操作用專用工具（Read/Edit/Write/Grep/Glob），不要用 shell。
- **headerRow 0 ≠ 沒判定**：0 是「無標題列」的有效值，undefined 才是未判定（`diagnostics.ts` 已區分）。
- **動態 import 的大套件**（tesseract.js / docx）：build 時會自成 chunk，屬正常；別為了消 bundle warning 把它們改成靜態 import。
- commit 前一定先 `npm run test` + `npx tsc -b` + `npm run lint` 三者皆綠。

---

## 7. 第一步建議

1. `cd H:\Refine`，`git pull`，`npm install`（確認 tesseract.js / docx 已裝），`npm run test` 看 37 測試全綠。
2. 讀 `ROADMAP.md` + `PROGRESS.md` + 本檔。
3. 從 **P0-2 中文姓名校正引擎** 開工：新增 `src/lib/importer/nameMatch.ts` + 測試，再接到 `App.tsx` 的校對流程。做完驗證 → commit → push → 更新 `PROGRESS.md`/`ROADMAP.md`。
