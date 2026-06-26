# 學生名單校對平台　未來優化改良與可開發功能建議

更新日期：2026-06-26

---

## 閱讀說明

- **P0** — 馬上做，影響核心功能可用性
- **P1** — 近期重要，影響正式上線品質
- **P2** — 中期優化，提升準確度與體驗
- **P3** — 長期擴充，非核心但有價值

每項建議標示：`[難度]` 小 / 中 / 大、`[需要]` 說明前置條件。

---

## 一、部署與基礎建設

### P0｜正式部署 Firebase Functions

**[難度] 中　[需要] 學校 Firebase project 建立、帳號權限**

目前所有後端程式碼已完成，唯一缺口是正式 Firebase project 尚未建立。

步驟：
1. 以學校帳號（`ipad@mail2.smes.tyc.edu.tw`）在 Firebase Console 建立 project
2. 啟用 Cloud Functions、Firestore、Storage、Authentication（Google 登入）
3. 把 Firebase Web App config 填入 GitHub Secrets（`VITE_FIREBASE_*`）
4. 部署指令：
   ```bash
   firebase --account=ipad@mail2.smes.tyc.edu.tw deploy --only functions,firestore:rules,storage
   ```
5. 確認 `functions/lang/` 語言資料未被 `firebase.json` 的 `ignore` 排除

完成後整個後端（自動文字辨識、OCR 背景工作、校對紀錄）即可正式上線。

---

### P0｜Storage Lifecycle 自動清理 OCR 暫存檔

**[難度] 小　[需要] Firebase project 已建立**

目前 OCR PDF 暫存在 `ocr-jobs/{uid}/{jobId}/source.pdf`，worker 成功或失敗都會主動刪除，但若 worker 異常退出（例如 OOM），暫存檔會殘留。

建議在 GCS 設定 lifecycle rule：
```json
{
  "rule": [{
    "action": { "type": "Delete" },
    "condition": {
      "age": 1,
      "matchesPrefix": ["ocr-jobs/"]
    }
  }]
}
```

這樣即使 worker 異常，暫存檔最多 24 小時後自動清除，符合安全原則。

---

### P1｜GitHub Actions 自動部署流程

**[難度] 中　[需要] Firebase project、Service Account Key**

目前每次部署需要手動下指令。可在 GitHub Actions 加入自動部署：
- `push to main` → 自動執行 `npm run build` + `firebase deploy`
- 分開設定 Firebase preview channel（PR 預覽）與正式 channel（main 合併）

---

## 二、OCR 辨識品質提升

### P1｜評估換用 Google Cloud Vision API

**[難度] 中　[需要] GCP project、API 啟用、費用評估**

目前後端 OCR 引擎為 tesseract.js（離線，語言資料打包）。優點是免費、無網路依賴；缺點是對低品質掃描或手寫字準確度有限。

Google Cloud Vision Document AI 的優勢：
- 中文手寫辨識準確度遠高於 tesseract
- 自動偵測表格結構，不需要自己切行列
- 有 1,000 頁/月免費額度（小型學校足夠）

評估建議：先用 tesseract 上線，如果老師回報 OCR 結果太差，再引入 Cloud Vision。切換方式：在 `parseOcrPdf()` 改呼叫 Vision API，行為介面不變，前端完全不用改。

---

### P2｜OCR 後處理：常見辨識錯誤修正

**[難度] 中　[需要] 無**

tesseract 常見辨識錯誤（可建立映射表自動修正）：
- `0` / `O`、`1` / `I`（數字與字母混淆）
- `己` / `已` / `巳`（形近字）
- 座號被辨識成日期格式（如 `01` → `1月`）
- 班級格式破碎（如 `1 年 2 班` 已可正規化，但可再強化）

建議在 `pdfImageOcr()` 產出的文字行後面，套一層「OCR 後修正過濾器」，依常見錯誤 pattern 做 replace，再交給 `splitTextLine()`。

---

### P2｜逐頁進度回報（OCR worker → 前端）

**[難度] 中　[需要] Firebase project 已部署**

目前 `processOcrJob` 的進度是粗粒度的（25% / 75% / 100%）。對多頁 PDF，老師看不出目前到第幾頁。

改善：每辨識完一頁就寫一次 Firestore 更新：
```typescript
await jobRef.update({ progress: 25 + Math.floor((pageNumber / totalPages) * 50) })
```

前端已有即時 snapshot 監聽，不需改前端，只要後端多寫幾次即可。

---

### P2｜OCR Job 超時自動標記 Failed

**[難度] 小　[需要] Firebase project 已部署**

目前 Cloud Functions timeout 設 540 秒，若 worker 超時，Firestore 的 job status 可能停在 `processing`，前端永遠等待。

改善：在 `createOcrJob` 建立 job 時同時記錄 `expiresAt = now + 600s`；可用 Cloud Scheduler 每 10 分鐘掃描 `ocrJobs`，把過期且非 `completed`/`failed` 的 job 標記為 `failed`（附原因：「處理逾時，請重新上傳」）。

---

## 三、登入與權限系統

### P1｜教師 Google 登入與角色區分

**[難度] 中　[需要] Firebase Auth 已設定、學校 GSuite domain**

建議正式上線後的角色設計：

| 角色 | 條件 | 可做的事 |
|---|---|---|
| 訪客 | 未登入 | 只能用前端示範模式（匿名資料） |
| 教師 | `@mail2.smes.tyc.edu.tw` 登入 | 上傳名單、後端校對、查自己的校對紀錄 |
| 行政 | `admins/{uid}` 存在 | 上述 + 查全校歷史、更新學生資料庫 |
| 資訊組長 | `admins/{uid}` 存在 | 上述 + 管理 admin 名單 |

`assertSchoolCaller()` 已驗證 email domain，只需在 Firestore 建立 `admins` 集合即可啟用角色分流。

---

### P1｜前端顯示目前使用者的校對歷史

**[難度] 中　[需要] Firebase 已部署**

每次後端校對都已寫入 `validations/{id}`，包含上傳者 uid、檔名、摘要、問題清單預覽。

可在前端加入「我的校對紀錄」頁面：
- 列出最近 10 次
- 點開可看問題清單預覽
- 顯示上傳時間、檔名、通過 / 錯誤筆數

---

## 四、校對準確度提升

### P1｜擴充中文姓名校正字典

**[難度] 小　[需要] 實際誤植案例回饋**

目前 `variantGroups`（異體字）和 `similarGroups`（形近同音字）已有基礎字組，但石門國小實際名冊可能有特殊罕見字。

建議建立回饋機制：
1. 老師發現系統「沒有幫他找出應該很像的名字」時，可提交回饋
2. 由資訊組長定期匯整，更新 `variantGroups` / `similarGroups`
3. 可加入注音 / 拼音相似度（兼顧同音字更廣的覆蓋）

---

### P2｜後端支援 `.xls` 舊格式

**[難度] 小　[需要] 無**

目前後端 `parseRosterFile()` 支援 `.xlsx`（ExcelJS），但不支援舊版 `.xls`。前端有走 `xlsx` 套件的 fallback，但前端解析安全性有疑慮。

改善：在 functions 加入 `xlsjs`，或把 `.xls` 轉 buffer 後用 ExcelJS 處理，讓 `.xls` 也完整走後端管線。

---

### P2｜姓名相似度說明更友善

**[難度] 小　[需要] 無**

目前「提示」欄顯示術語（異體字、形近字），對老師較難理解。

建議改成白話說明：
- 「異體字」→「這兩個字意思相同，但寫法不同，可能是字型問題」
- 「形近字」→「這兩個字長得很像，可能是 KEY 錯」
- 「缺一字」→「姓名少了一個字，請回原檔確認」

---

### P3｜全校名冊跨班搜尋模式

**[難度] 中　[需要] 無**

進階需求（行政常見情境）：
- 上傳只有姓名（無班級座號）的得獎名單
- 系統跨班找出所有相符或相近的學生讓老師確認

這個模式比現有流程更寬鬆，對行政處名冊整合很有幫助。

---

## 五、使用者體驗改善

### P1｜問題表格篩選 + 分頁

**[難度] 小　[需要] 無**

若一份名單有數十筆問題，目前表格是一長頁。

建議：
- 問題數 > 20 時顯示「顯示前 20 筆 / 共 N 筆」，附「載入全部」按鈕
- 加入問題類型篩選（只看「錯誤」/ 只看「待確認」）
- 表格加上 sticky 表頭，方便對照欄位

---

### P1｜問題清單一鍵複製成純文字報告

**[難度] 小　[需要] 無**

老師常需要把問題清單貼到 Line 群組或 email 通知。

建議加一個「複製問題清單」按鈕，輸出格式如：
```
📋 名單校對結果（2026-06-26）
檔名：106年校慶得獎名冊.xlsx
共 45 筆，通過 42 筆，需確認 2 筆，錯誤 1 筆

【待確認】第 12 列：3年1班 05號 王曉明
  → 系統建議：王小明（高信心，字形相似）

【錯誤】第 28 列：5年3班 99號 李大華
  → 座號不存在，請確認
```

---

### P2｜拖曳上傳 / 複製貼上支援

**[難度] 小　[需要] 無**

目前只支援點按「上傳名單」按鈕。

建議加入：
1. 拖曳檔案到上傳區（drag & drop）
2. 從 Excel 複製一段資料後，直接貼上到系統自動解析（clipboard paste）

這對習慣用滑鼠操作 Excel 的老師特別方便。

---

### P2｜行動版體驗優化

**[難度] 中　[需要] 無**

目前有基礎 RWD，但在手機上問題表格欄位太多、欄位對應區佔版面。

建議：
- 手機版預設隱藏欄位對應區，改用展開按鈕
- 問題表格改為卡片式清單
- 上傳區增大點擊面積

---

### P2｜黑暗模式

**[難度] 小　[需要] 無**

使用 `prefers-color-scheme: dark` media query + CSS 變數切換，對夜間在辦公室操作的行政人員友善。

---

### P3｜無障礙改善（WCAG 2.1 AA）

**[難度] 中　[需要] 無**

目前已有基礎 ARIA 標記，可再加強：
- 螢幕閱讀器能正確讀出校對結果摘要
- 鍵盤完整導覽（Tab 順序、Enter 送出）
- 顏色對比度確認（部分淺色文字可能不足 4.5:1）

---

## 六、安全性改善

### P1｜替換前端 xlsx 套件

**[難度] 中　[需要] 無**

`xlsx`（SheetJS）套件有 high severity security audit 警告，官方社群版長期未修補。

替換選項：
- **ExcelJS**：後端已使用，前端可引入（但體積較大）
- **SheetJS Pro**：官方付費版有修補，但費用需評估
- **✅ 建議：改走後端解析**（登入後全部走 `validateRosterFileOnBackend()`，移除前端 `xlsx` 依賴；未登入的示範模式不上傳真實資料，風險可接受）

---

### P1｜Firestore 安全規則補強

**[難度] 小　[需要] Firebase project 已部署**

目前預設拒絕，上線前建議補充：
- `validations`：只有 `createdByUid == request.auth.uid` 可讀自己的紀錄；admin 可讀全部
- `ocrJobs`：同上
- Functions 層加上 uid 寫入頻率保護（防止惡意大量送工作）

---

### P2｜後端輸入驗證強化

**[難度] 小　[需要] 無**

目前已限制 row 數量上限（2000）。可再加：
- 每個 cell 長度上限（防止超長字串）
- 姓名欄位只允許 CJK + 空白 + 少數符號
- 檔名只允許合法副檔名（已部分實作，可再補全）

---

## 七、管理功能

### P2｜學生資料庫版本管理

**[難度] 中　[需要] Firebase project 已部署**

目前每次更新學生資料庫會直接覆蓋 Firestore。建議改為有版本記錄：
- `studentDatabaseVersions/{versionId}`：儲存上傳者、時間、來源檔名、學生數
- 可回退到上一版（匯錯資料時）
- 前端顯示目前版本、最後更新時間

---

### P2｜校對歷史管理介面（行政用）

**[難度] 中　[需要] Firebase project 已部署**

給資訊組長或行政人員的後台頁面：
- 列出所有老師的校對記錄（日期、檔名、上傳者、問題數）
- 可依日期、班級、上傳者篩選
- 匯出整份 CSV（用於期末審計）

---

### P3｜定期發送問題統計摘要 email

**[難度] 大　[需要] Firebase project、Gmail / SendGrid**

每週自動統計「本週各班上傳名單的常見錯誤類型」，以 email 發給行政主任，讓學校主動追蹤哪些老師常 KEY 錯名字。

---

## 八、進階功能（長期）

### P3｜支援圖片格式上傳（JPG / PNG）

**[難度] 中　[需要] Cloud Vision 或 tesseract.js**

目前 OCR 僅支援 PDF。很多老師可能直接用手機拍照上傳。

改善：允許 `.jpg`、`.png` 上傳，後端用 tesseract.js 或 Cloud Vision 直接辨識，不需要 PDF 包裝層。

---

### P3｜獎狀 / 報名表模板輸出

**[難度] 大　[需要] 無**

校對完成後，讓老師選擇模板，自動套入正確學生資料輸出獎狀或報名表 PDF。

注意：這是全新功能，不在目前主線。建議先把校對準確度做穩再開發。

---

### P3｜多校共用（推廣到龍潭區其他學校）

**[難度] 大　[需要] 架構重構**

若要推廣到其他學校：
- 學生資料庫多租戶隔離（`schools/{schoolId}/students`）
- 登入後根據 email domain 決定讀哪個資料庫
- 管理介面支援跨校

---

## 快速一覽：建議優先順序

| 優先 | 項目 | 難度 | 說明 |
|---|---|---|---|
| **P0** | 正式部署 Firebase Functions | 中 | 最重要，所有後端功能都在等這步 |
| **P0** | Storage OCR 暫存 Lifecycle | 小 | 安全必要，幾分鐘設定完 |
| **P1** | 替換前端 xlsx 套件（改走後端） | 中 | 安全性改善，後端解析管線已完成 |
| **P1** | 教師登入 + 角色區分 | 中 | 正式上線前必要 |
| **P1** | GitHub Actions 自動部署 | 中 | 往後每次 push 自動上線 |
| **P1** | 問題表格篩選 + 分頁 | 小 | 名單大時體驗差 |
| **P1** | 問題清單一鍵複製純文字 | 小 | 老師常需要貼給同事 |
| **P1** | 校對紀錄查看介面 | 中 | 老師可以看自己的歷史紀錄 |
| **P2** | 評估 Cloud Vision API | 中 | OCR 準確度明顯提升 |
| **P2** | OCR 後處理：常見辨識錯誤修正 | 中 | 提升掃描 PDF 準確度 |
| **P2** | 逐頁 OCR 進度回報 | 中 | 讓老師知道 OCR 進行到哪頁 |
| **P2** | OCR Job 超時自動標記 Failed | 小 | 避免前端永遠等待 |
| **P2** | 擴充姓名校正字典 | 小 | 依實際錯誤案例滾動更新 |
| **P2** | 行動版卡片式問題清單 | 中 | 手機體驗明顯改善 |
| **P2** | 學生資料庫版本管理 | 中 | 匯錯可回退 |
| **P2** | Firestore 安全規則補強 | 小 | 上線前要做 |
| **P2** | 拖曳上傳 / 複製貼上 | 小 | 操作便利性 |
| **P3** | 全校跨班搜尋模式 | 中 | 行政進階需求 |
| **P3** | 圖片格式上傳 OCR | 中 | 手機拍照直接上傳 |
| **P3** | 校對歷史管理後台 | 中 | 行政審計需求 |
| **P3** | 獎狀 / 報名表模板輸出 | 大 | 長期目標 |
| **P3** | 多校共用架構 | 大 | 若要推廣到其他學校 |
