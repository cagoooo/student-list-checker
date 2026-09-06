# 學生名單校對平台

桃園市龍潭區石門國民小學使用的學生名單校對工具。核心目標是讓老師上傳名單後，系統自動用正確學生資料庫比對班級、座號、姓名，直接回報「整份名單是否正確」以及「哪些學生姓名可能 KEY 錯」。老師不需要下載修正版再處理一次文件。

**線上 Demo**：[https://cagoooo.github.io/student-list-checker/](https://cagoooo.github.io/student-list-checker/)

> 公開 Demo 內建資料已匿名化。正式學生資料請由使用者在瀏覽器內上傳更新；目前資料只會存在該瀏覽器本機暫存，不會送到 GitHub。

## 目前功能

- 讀取 `.xlsx`、`.xls`、`.csv` 名單
- 自動偵測班級、座號、姓名欄位
- 支援手動調整欄位對應
- 與學生資料庫比對
- 可設定 Firebase Auth / Firestore 作為雲端學生資料庫
- 顯示通過、待確認、錯誤狀態
- 顯示疑似姓名 KEY 錯、班級 / 座號不符、查無學生等問題
- 提供老師可直接閱讀的校對結果摘要
- 只列出需要老師確認的問題項目，避免老師再處理整份表格
- Firebase Functions 後端校對第一版：登入後 `.xlsx` / `.csv` / `.docx` / 文字型 PDF 可先交由後端解析、讀正式學生資料庫並回傳問題清單
- 後端校對會保存摘要紀錄編號，方便老師回報與資訊組長追蹤
- 掃描 PDF 會建立 OCR 背景工作、暫存到短期 Storage path，並由 worker 非同步處理；影像 OCR 引擎仍保留為下一步接入點

## 產品方向

本工具不是文件修正版產生器。正式版應優先走「後端辨識與比對、前端回報結果」：

1. 老師上傳任意格式名單。
2. 後端解析檔案並與正式學生資料庫比對。
3. 前端顯示整份名單是否可放心使用。
4. 若有問題，只列出需要老師確認或回頭修改原檔的項目。

下載修正版 Excel / Word 只保留為輔助功能，不作為主要工作流。

## 專案文件

- [目前進度表](./PROGRESS.md)
- [未來優化改良與可開發功能建議清單](./ROADMAP.md)
- [Firebase 後台設定計畫](./FIREBASE_SETUP.md)

## 更新學生資料庫

目前學生資料庫種子檔位於：

```txt
src/data/students.json
```

若後台匯出新的學生資料概況 `.xls`，可執行：

```bash
npm run import:students -- "H:\Refine\學生資料概況_YYYYMMDDHHMMSS.xls"
```

腳本會將資料轉成系統使用的格式，包含：

- `studentNo`
- `grade`
- `classNo`
- `className`
- `classCode`
- `seatNo`
- `name`
- `gender`

## 開發

```bash
npm install
npm run dev
```

## 驗證

```bash
npm run lint
npm run build
```

---

<!-- BEGIN:PROJECT_GUIDE -->
## 專案導覽

這個 repository 收錄 **student-list-checker** 專案的原始碼與相關資源。以下資訊依目前檔案結構整理；實際行為仍以程式碼與部署設定為準。

- 專案定位：實用工具／自動化原型
- Repository：`cagoooo/student-list-checker`
- 可見性：公開
- 主要技術：TypeScript、React、Vite、Firebase
- 線上入口：<https://cagoooo.github.io/student-list-checker/>

### 可以怎麼應用

- 解決特定工作流程中的重複操作或資訊整理需求
- 作為相近工具的功能原型與程式碼參考
- 串接新的資料來源、服務或介面後延伸到其他情境

這些是依目前專案定位整理的延伸方向，不代表所有情境都已內建完成；實作前請先確認現有功能與資料格式。

### 技術與專案結構

- `README.md`
- `docs`
- `firebase.json`
- `functions`
- `index.html`
- `package.json`
- `public`
- `scripts`
- `src`
- `vite.config.ts`

檔案結構會隨版本演進；若本節與程式碼不一致，以目前預設分支的原始碼為準。

### 本機執行

```bash
npm install
# dev
npm run dev
# build
npm run build
# test
npm run test
# lint
npm run lint
```
請以 `package.json` 的 `scripts` 為準；若專案需要雲端服務，請先建立自己的環境變數與測試專案。

### 給 AI Agent 的接手指南

1. 先閱讀本 README、`AGENTS.md`（若有）、套件腳本與部署設定。
2. 先從入口檔、設定檔與資料流確認真實行為，不要只依 repo 名稱推測。
3. 修改前檢查環境變數、外部服務、檔案格式與失敗處理。
4. 完成後執行既有檢查，並以最小可重現案例驗證主要流程。
5. 不要捏造尚未存在的功能；README 與實作有落差時，應同時更新文件。
6. 提交前只納入本次任務檔案，並記錄實際執行過的驗證。

### 安全與資料注意事項

- 不要提交 `.env`、服務帳號、API 金鑰、token、學生個資或正式環境匯出資料。
- 使用 Firebase、Supabase、Google API 或其他雲端服務時，請建立自己的測試專案並套用最小權限。
- 若要公開衍生作品，請先確認程式碼、圖片、音訊、字型與教材內容的授權。

### 貢獻與客製化

歡迎依教學現場、活動或工作流程需求進行 fork／客製化。建議在變更說明中交代使用情境、主要修改、測試方式，以及是否影響資料格式或部署設定。
<!-- END:PROJECT_GUIDE -->
