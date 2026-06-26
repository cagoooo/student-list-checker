# Firebase 後台設定計畫

更新日期：2026-06-25

## 目標

將學生資料庫從前端匿名示範資料與瀏覽器本機暫存，升級為 Firebase Firestore 雲端資料庫。正式版由學校帳號登入後管理學生資料，GitHub Pages 仍負責提供前端網站。

## 目前已完成的 Firebase 架構

- 已安裝 Firebase Web SDK
- 已新增 Firebase 初始化與服務層：`src/lib/firebase.ts`
- 已新增 Google 登入按鈕與登出流程
- 已支援登入後從 Firestore 載入學生資料
- 已新增 Firebase Functions 後端校對函式：`validateRosterRows`
- 前端已支援登入後優先呼叫後端校對；若 Functions 尚未部署或失敗，會自動退回本機校對
- 已支援上傳學務系統 `.xls` 後同步寫入 Firestore
- 已支援超過 500 筆學生資料分批寫入
- 已新增 Firestore Rules：`firestore.rules`
- 已新增 Firebase 設定檔：`firebase.json`
- 已新增 GitHub Actions Firebase secrets 對應
- 已保留無 Firebase 設定時的匿名示範模式

## Firestore 資料模型

### `students/{studentId}`

```ts
{
  id: string
  studentNo: string
  grade: number
  classNo: number
  className: string
  classCode: string
  seatNo: string
  name: string
  gender: string
  sourceFile: string
  updatedAt: Timestamp
}
```

### `studentDatabaseMeta/current`

```ts
{
  sourceFile: string
  studentCount: number
  updatedAt: Timestamp
}
```

### `admins/{uid}`

用來判斷誰可以讀寫學生資料。第一位管理員需要手動從 Firebase Console 建立。

```ts
{
  email: "ipad@mail2.smes.tyc.edu.tw",
  role: "admin",
  createdAt: Timestamp
}
```

## Firebase Functions

後端程式位於：

```txt
functions/src/index.ts
```

目前已建立 callable functions：

```txt
validateRosterRows
validateRosterFile
```

職責：

- 驗證呼叫者必須是石門國小學校帳號
- 從 Firestore `students` collection 讀取正式學生資料庫
- `validateRosterRows`：接收前端已辨識出的列資料（班級、座號、姓名、來源列號）
- `validateRosterFile`：接收 `.xlsx` / `.csv` / `.docx` / 文字型 PDF 檔案內容，在後端解析欄位與資料列
- 在後端完成學生資料比對與中文姓名模糊校正
- 回傳 `summary` 與 `issues`，讓前端只呈現整份名單是否正確與問題清單

本機編譯：

```bash
cd functions
npm install
npm run build
```

部署時請使用學校帳號：

```bash
firebase --account=ipad@mail2.smes.tyc.edu.tw deploy --only functions
```

## 安全規則摘要

目前規則採保守設計：

- 未登入：不能讀寫任何學生資料
- 已登入但不是管理員：不能讀寫學生資料
- 管理員：可以讀取學生資料
- 管理員且為 `smes.tyc.edu.tw` 或 `mail2.smes.tyc.edu.tw` 帳號：可以更新學生資料
- 其他未知 collection：全部拒絕

## Firebase 專案建立步驟

教學專案請使用學校帳號：

```bash
firebase --account=ipad@mail2.smes.tyc.edu.tw projects:list
```

建議建立或選擇一個 Firebase project，例如：

```txt
student-list-checker
```

若需要登入，請用互動視窗：

```powershell
Start-Process cmd.exe -ArgumentList '/k','firebase login:add'
```

## 必要 Firebase Console 設定

1. 建立 Firebase Web App
2. 啟用 Firestore Database
3. 啟用 Authentication
4. 啟用 Google 登入供應商
5. Authentication Authorized domains 加入：

```txt
cagoooo.github.io
localhost
127.0.0.1
```

6. Firestore Console 手動新增第一位管理員：

```txt
collection: admins
document id: 第一位管理員登入後的 Firebase Auth uid
fields:
  email: ipad@mail2.smes.tyc.edu.tw
  role: admin
```

## 本機 `.env`

複製 `.env.example` 為 `.env`，填入 Firebase Web App config：

```bash
cp .env.example .env
```

```txt
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_FUNCTIONS_REGION=asia-east1
```

## GitHub Secrets

GitHub Pages 需要以下 secrets：

```txt
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
VITE_FIREBASE_FUNCTIONS_REGION
```

設定後 GitHub Actions 會把這些值注入前端 build。

## 部署 Firestore Rules

確認 `.firebaserc` 或 CLI 指定 project 後執行：

```bash
firebase --account=ipad@mail2.smes.tyc.edu.tw deploy --only firestore:rules
```

## API Key 限制建議

正式上線後，請到 GCP Console 限制 Firebase Browser key：

Allowed referrers 建議：

```txt
https://cagoooo.github.io/*
http://localhost:*
http://127.0.0.1:*
```

API targets 至少包含：

```txt
firestore.googleapis.com
identitytoolkit.googleapis.com
securetoken.googleapis.com
firebaseinstallations.googleapis.com
```

## 下一步

1. 建立 Firebase project 或指定現有 project
2. 提供 Web App config
3. 設定 GitHub Secrets
4. 部署 Firestore Rules 與 Functions
5. 第一次登入後取得 Auth UID
6. 在 Firestore 建立 `admins/{uid}`
7. 用「更新學生資料庫」上傳學務系統匯出檔
