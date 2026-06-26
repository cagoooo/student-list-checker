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
