# 學生名單校對平台

桃園市龍潭區石門國民小學使用的學生名單校對工具。第一版支援老師上傳 Excel / CSV 名單，系統會依班級、座號、姓名與學生資料庫交叉比對，並提供錯誤提示、修正建議與校對結果下載。

## 目前功能

- 讀取 `.xlsx`、`.xls`、`.csv` 名單
- 自動偵測班級、座號、姓名欄位
- 支援手動調整欄位對應
- 與學生資料庫比對
- 顯示通過、待確認、錯誤狀態
- 可單列或批次套用建議修正
- 匯出校對結果 Excel

## 專案文件

- [目前進度表](./PROGRESS.md)
- [未來優化改良與可開發功能建議清單](./ROADMAP.md)

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
