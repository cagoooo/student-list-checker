# Intelligent Roster Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers-subagent-driven` (recommended) or `superpowers-executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓老師上傳 Excel、CSV、PDF、Word 等常見名單檔時，系統能自動抽取候選名單表格，推論班級、座號、姓名欄位，顯示信心分數與可修正的欄位對應，最後用目前學生資料庫完成校對。

**Architecture:** 新增一個 `src/lib/importer/` 匯入辨識層，先把不同檔案轉成共同的 `CandidateTable`，再由欄位推論器產生 `ImportDetectionResult`。React UI 只負責呈現偵測結果、讓老師確認與修正，不直接解析檔案。

**Tech Stack:** Vite + React + TypeScript；Excel/CSV 先沿用 `xlsx`；測試新增 `vitest`；PDF/Word 階段採延後任務，先定義抽取介面與錯誤訊息，再引入合適套件。

---

## Current State

- `src/App.tsx` 已能讀 `.xls/.xlsx/.csv`，並會掃描前 30 列找表頭。
- `ColumnMap` 已支援 `gradeKey/classKey/seatKey/nameKey`。
- 學務系統原始檔 `學生姓名/學號/年級/性別/班級/座號` 可被解析為學生資料。
- 尚未支援 PDF、Word、無表頭欄位推論、多工作表候選、信心分數與老師確認流程。
- 目前沒有測試框架，匯入邏輯混在 `App.tsx`，下一步要先拆出純函式。

## Target User Flow

1. 老師點「上傳名單」。
2. 系統讀取檔案並顯示「偵測中」狀態。
3. 系統列出最可能的表格：工作表名稱、表頭列、資料筆數、欄位對應、信心分數。
4. 若信心高於 85，直接進入校對結果，同時保留左側欄位修正。
5. 若信心 60-84，顯示「請確認欄位」提醒，老師可調整下拉欄位後重算。
6. 若信心低於 60，顯示無法自動判讀原因與可操作建議。
7. 校對結果永遠說明「目前使用哪個資料庫基準」。

## Data Contracts

Create `src/lib/importer/types.ts`:

```ts
import type { ColumnMap, ImportedRow, Student } from '../../types'

export type SourceFileKind = 'excel' | 'csv' | 'pdf' | 'word' | 'unsupported'

export type CandidateTable = {
  id: string
  sourceName: string
  sheetName?: string
  headerRow: number
  headers: string[]
  rows: Record<string, unknown>[]
  rowCount: number
}

export type FieldDetection = {
  columnMap: ColumnMap
  confidence: number
  reasons: string[]
  warnings: string[]
}

export type ImportDetectionResult = {
  fileName: string
  fileKind: SourceFileKind
  selectedTable: CandidateTable | null
  candidates: CandidateTable[]
  fieldDetection: FieldDetection
  importedRows: ImportedRow[]
  sourceStudents: Student[]
  isOfficialStudentSource: boolean
}
```

## Task 1: Add Test Runner

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `vitest.config.ts`
- Create: `src/lib/importer/__tests__/fixtureBuilder.test.ts`

- [ ] **Step 1: Add `vitest` dependency and scripts**

Run:

```powershell
npm install --save-dev vitest
```

Patch `package.json` scripts:

```json
{
  "test": "vitest run",
  "test:watch": "vitest"
}
```

- [ ] **Step 2: Create Vitest config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
```

- [ ] **Step 3: Add a smoke test**

Create `src/lib/importer/__tests__/fixtureBuilder.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

describe('importer test setup', () => {
  it('runs importer unit tests', () => {
    expect(true).toBe(true)
  })
})
```

- [ ] **Step 4: Verify**

Run:

```powershell
npm run test
npm run lint
npm run build
```

Expected: all pass.

- [ ] **Step 5: Commit**

```powershell
git add package.json package-lock.json vitest.config.ts src/lib/importer/__tests__/fixtureBuilder.test.ts
git commit -m "test: add importer test runner"
```

## Task 2: Extract Existing Excel Import Logic

**Files:**
- Create: `src/lib/importer/types.ts`
- Create: `src/lib/importer/normalize.ts`
- Create: `src/lib/importer/excel.ts`
- Create: `src/lib/importer/studentSource.ts`
- Modify: `src/App.tsx`
- Modify: `src/types.ts`
- Test: `src/lib/importer/__tests__/excel.test.ts`

- [ ] **Step 1: Write tests for current official source file shape**

Create `src/lib/importer/__tests__/excel.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { detectColumns, findHeaderRow, normalizeHeaders } from '../excel'

describe('excel roster detection', () => {
  const rows = [
    ['產製時間：2026/06/25 15:28:31  產製人：石門國小 黃凱揚', '', '', '', '', ''],
    ['', '', '', '', '', ''],
    ['學生姓名      ', '學號                ', '年級   ', '性別   ', '班級   ', '座號   '],
    ['邱紘睿', '1140006', '1', '男', '1', '1'],
  ]

  it('finds the real header row after report metadata', () => {
    expect(findHeaderRow(rows)).toBe(2)
  })

  it('normalizes spaced headers', () => {
    expect(normalizeHeaders(rows[2])).toEqual(['學生姓名', '學號', '年級', '性別', '班級', '座號'])
  })

  it('detects grade class seat and name columns', () => {
    const headers = normalizeHeaders(rows[2])
    expect(detectColumns(headers)).toEqual({
      nameKey: '學生姓名',
      gradeKey: '年級',
      classKey: '班級',
      seatKey: '座號',
    })
  })
})
```

- [ ] **Step 2: Run failing tests**

Run:

```powershell
npm run test -- src/lib/importer/__tests__/excel.test.ts
```

Expected: fail because modules do not exist.

- [ ] **Step 3: Implement pure functions**

Create `src/lib/importer/normalize.ts`:

```ts
export const ROW_NUMBER_KEY = '__rowNo'

export function toText(value: unknown) {
  return value === null || value === undefined ? '' : String(value).trim()
}

export function normalizeHeaders(row: unknown[]) {
  const used = new Map<string, number>()
  return row.map((cell, index) => {
    const base = toText(cell).replace(/\s+/g, '') || `欄位${index + 1}`
    const count = used.get(base) ?? 0
    used.set(base, count + 1)
    return count === 0 ? base : `${base}_${count + 1}`
  })
}
```

Create `src/lib/importer/excel.ts`:

```ts
import * as XLSX from 'xlsx'
import type { ColumnMap } from '../../types'
import { ROW_NUMBER_KEY, normalizeHeaders, toText } from './normalize'

export { normalizeHeaders }

export function detectColumns(headers: string[]): ColumnMap {
  const find = (patterns: RegExp[]) => headers.find((header) => patterns.some((pattern) => pattern.test(header)))

  return {
    classKey: find(/^班級$|班別|班序|班級名稱|class/i),
    gradeKey: find(/^年級$|就讀年級|grade/i),
    seatKey: find(/^座號$|座號碼|座次|seat/i),
    nameKey: find(/^學生姓名$|^姓名$|學生.*姓名|姓名|name/i),
  }
}

function find(pattern: RegExp) {
  return [pattern]
}

export function findHeaderRow(rows: unknown[][]) {
  let bestIndex = 0
  let bestScore = -1

  rows.slice(0, 30).forEach((row, index) => {
    const headers = normalizeHeaders(row)
    const detected = detectColumns(headers)
    const score =
      (detected.nameKey ? 3 : 0) +
      (detected.seatKey ? 3 : 0) +
      (detected.classKey ? 2 : 0) +
      (detected.gradeKey ? 2 : 0)

    if (score > bestScore) {
      bestIndex = index
      bestScore = score
    }
  })

  return bestIndex
}

export function toRecord(row: unknown[], headers: string[], rowNo: number): Record<string, unknown> {
  const record: Record<string, unknown> = { [ROW_NUMBER_KEY]: rowNo }
  headers.forEach((header, index) => {
    record[header] = row[index] ?? ''
  })
  return record
}

export function parseExcelTables(buffer: ArrayBuffer, sourceName: string) {
  const workbook = XLSX.read(buffer, { type: 'array' })
  return workbook.SheetNames.map((sheetName) => {
    const sheet = workbook.Sheets[sheetName]
    const sheetRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: false })
    const headerIndex = findHeaderRow(sheetRows)
    const headers = normalizeHeaders(sheetRows[headerIndex] ?? [])
    const rows = sheetRows
      .slice(headerIndex + 1)
      .map((row, index) => toRecord(row, headers, headerIndex + index + 2))
      .filter((row) =>
        Object.entries(row)
          .filter(([key]) => !key.startsWith('__'))
          .some(([, value]) => toText(value) !== ''),
      )

    return {
      id: `${sheetName}-${headerIndex + 1}`,
      sourceName,
      sheetName,
      headerRow: headerIndex + 1,
      headers,
      rows,
      rowCount: rows.length,
    }
  })
}
```

- [ ] **Step 4: Fix the helper bug in `detectColumns`**

Replace the `find` usage in `detectColumns` with this implementation:

```ts
export function detectColumns(headers: string[]): ColumnMap {
  const pick = (patterns: RegExp[]) => headers.find((header) => patterns.some((pattern) => pattern.test(header)))

  return {
    classKey: pick([/^班級$/, /班別|班序|班級名稱|class/i]),
    gradeKey: pick([/^年級$/, /就讀年級|grade/i]),
    seatKey: pick([/^座號$/, /座號碼|座次|seat/i]),
    nameKey: pick([/^學生姓名$/, /^姓名$/, /學生.*姓名|姓名|name/i]),
  }
}
```

- [ ] **Step 5: Run tests**

Run:

```powershell
npm run test -- src/lib/importer/__tests__/excel.test.ts
```

Expected: pass.

- [ ] **Step 6: Move App functions to importer**

In `src/App.tsx`, remove local copies of:

- `ROW_NUMBER_KEY`
- `parseImportedWorkbook`
- `findHeaderRow`
- `normalizeHeaders`
- `toRecord`
- `detectColumns`
- `visibleValues`

Import from `src/lib/importer/excel.ts` and `src/lib/importer/normalize.ts`.

- [ ] **Step 7: Verify existing behavior**

Run:

```powershell
npm run test
npm run lint
npm run build
```

Expected: all pass.

- [ ] **Step 8: Commit**

```powershell
git add src/App.tsx src/types.ts src/lib/importer
git commit -m "refactor: extract roster import parsing"
```

## Task 3: Add Field Confidence Scoring

**Files:**
- Create: `src/lib/importer/fieldDetection.ts`
- Test: `src/lib/importer/__tests__/fieldDetection.test.ts`
- Modify: `src/lib/importer/types.ts`

- [ ] **Step 1: Write tests**

Create `src/lib/importer/__tests__/fieldDetection.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { detectRosterFields } from '../fieldDetection'

describe('detectRosterFields', () => {
  it('returns high confidence for explicit headers', () => {
    const table = {
      id: 'sheet-3',
      sourceName: '名單.xlsx',
      sheetName: 'Sheet1',
      headerRow: 3,
      headers: ['學生姓名', '學號', '年級', '性別', '班級', '座號'],
      rows: [
        { 學生姓名: '邱紘睿', 年級: '1', 班級: '1', 座號: '1' },
        { 學生姓名: '黃宥寧', 年級: '1', 班級: '1', 座號: '2' },
      ],
      rowCount: 2,
    }

    const result = detectRosterFields(table)
    expect(result.confidence).toBeGreaterThanOrEqual(90)
    expect(result.columnMap).toMatchObject({
      nameKey: '學生姓名',
      gradeKey: '年級',
      classKey: '班級',
      seatKey: '座號',
    })
  })

  it('uses content patterns when headers are generic', () => {
    const table = {
      id: 'sheet-1',
      sourceName: '活動名單.xlsx',
      sheetName: 'Sheet1',
      headerRow: 1,
      headers: ['欄位1', '欄位2', '欄位3'],
      rows: [
        { 欄位1: '101', 欄位2: '08', 欄位3: '王小安' },
        { 欄位1: '一 年 一 班', 欄位2: '12', 欄位3: '陳小琪' },
      ],
      rowCount: 2,
    }

    const result = detectRosterFields(table)
    expect(result.confidence).toBeGreaterThanOrEqual(60)
    expect(result.columnMap.classKey).toBe('欄位1')
    expect(result.columnMap.seatKey).toBe('欄位2')
    expect(result.columnMap.nameKey).toBe('欄位3')
  })
})
```

- [ ] **Step 2: Run failing tests**

Run:

```powershell
npm run test -- src/lib/importer/__tests__/fieldDetection.test.ts
```

Expected: fail because module does not exist.

- [ ] **Step 3: Implement scorer**

Create `src/lib/importer/fieldDetection.ts`:

```ts
import type { CandidateTable, FieldDetection } from './types'
import { detectColumns } from './excel'
import { toText } from './normalize'

function sampleValues(table: CandidateTable, header: string) {
  return table.rows.slice(0, 30).map((row) => toText(row[header])).filter(Boolean)
}

function scoreSeat(values: string[]) {
  if (values.length === 0) return 0
  const hits = values.filter((value) => /^\d{1,2}$/.test(value) && Number(value) >= 1 && Number(value) <= 40)
  return hits.length / values.length
}

function scoreClass(values: string[]) {
  if (values.length === 0) return 0
  const hits = values.filter((value) => /^(\d{3}|\d年\d班|[一二三四五六]年[一二三四五六七八九]班?)$/.test(value.replace(/\s/g, '')))
  return hits.length / values.length
}

function scoreName(values: string[]) {
  if (values.length === 0) return 0
  const hits = values.filter((value) => /^[\u4e00-\u9fff]{2,5}$/.test(value.replace(/\s/g, '')))
  return hits.length / values.length
}

export function detectRosterFields(table: CandidateTable): FieldDetection {
  const headerMap = detectColumns(table.headers)
  const scores = table.headers.map((header) => {
    const values = sampleValues(table, header)
    return {
      header,
      classScore: scoreClass(values),
      seatScore: scoreSeat(values),
      nameScore: scoreName(values),
    }
  })

  const best = (key: 'classScore' | 'seatScore' | 'nameScore') =>
    scores.slice().sort((a, b) => b[key] - a[key])[0]

  const columnMap = {
    classKey: headerMap.classKey ?? best('classScore')?.header,
    gradeKey: headerMap.gradeKey,
    seatKey: headerMap.seatKey ?? best('seatScore')?.header,
    nameKey: headerMap.nameKey ?? best('nameScore')?.header,
  }

  const reasons: string[] = []
  const warnings: string[] = []
  let confidence = 0

  if (columnMap.nameKey) confidence += headerMap.nameKey ? 30 : Math.round((best('nameScore')?.nameScore ?? 0) * 25)
  if (columnMap.seatKey) confidence += headerMap.seatKey ? 30 : Math.round((best('seatScore')?.seatScore ?? 0) * 25)
  if (columnMap.classKey) confidence += headerMap.classKey ? 25 : Math.round((best('classScore')?.classScore ?? 0) * 20)
  if (columnMap.gradeKey) confidence += 10

  if (!columnMap.nameKey) warnings.push('找不到姓名欄位')
  if (!columnMap.seatKey) warnings.push('找不到座號欄位')
  if (!columnMap.classKey && !columnMap.gradeKey) warnings.push('找不到班級或年級欄位')

  reasons.push(`欄位列：第 ${table.headerRow} 列`)
  reasons.push(`資料筆數：${table.rowCount} 筆`)

  return {
    columnMap,
    confidence: Math.min(100, confidence),
    reasons,
    warnings,
  }
}
```

- [ ] **Step 4: Run tests and tune thresholds**

Run:

```powershell
npm run test -- src/lib/importer/__tests__/fieldDetection.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/importer
git commit -m "feat: score roster field detection"
```

## Task 4: Build Unified Import Pipeline

**Files:**
- Create: `src/lib/importer/importRoster.ts`
- Test: `src/lib/importer/__tests__/importRoster.test.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: Write tests for official source and normal roster**

Create `src/lib/importer/__tests__/importRoster.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildDetectionResultFromTables } from '../importRoster'

describe('buildDetectionResultFromTables', () => {
  it('marks official student source when headers include student id and gender', () => {
    const result = buildDetectionResultFromTables('學生資料概況.xls', 'excel', [
      {
        id: '學生概況資料-3',
        sourceName: '學生資料概況.xls',
        sheetName: '學生概況資料',
        headerRow: 3,
        headers: ['學生姓名', '學號', '年級', '性別', '班級', '座號'],
        rows: [
          { 學生姓名: '邱紘睿', 學號: '1140006', 年級: '1', 性別: '男', 班級: '1', 座號: '1' },
        ],
        rowCount: 1,
      },
    ])

    expect(result.isOfficialStudentSource).toBe(true)
    expect(result.sourceStudents).toHaveLength(1)
    expect(result.importedRows).toHaveLength(1)
  })

  it('does not mark ordinary roster as official source', () => {
    const result = buildDetectionResultFromTables('活動報名.xlsx', 'excel', [
      {
        id: 'Sheet1-1',
        sourceName: '活動報名.xlsx',
        sheetName: 'Sheet1',
        headerRow: 1,
        headers: ['班級', '座號', '姓名'],
        rows: [{ 班級: '1年1班', 座號: '1', 姓名: '邱紘睿' }],
        rowCount: 1,
      },
    ])

    expect(result.isOfficialStudentSource).toBe(false)
    expect(result.sourceStudents).toHaveLength(0)
    expect(result.importedRows).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Implement pipeline**

Create `src/lib/importer/importRoster.ts`:

```ts
import type { CandidateTable, ImportDetectionResult, SourceFileKind } from './types'
import { detectRosterFields } from './fieldDetection'
import { parseExcelTables } from './excel'
import { buildImportedRows, parseStudentsFromTable } from './studentSource'

export async function importRosterFile(file: File): Promise<ImportDetectionResult> {
  const buffer = await file.arrayBuffer()
  const fileKind = detectFileKind(file.name)

  if (fileKind !== 'excel' && fileKind !== 'csv') {
    return emptyResult(file.name, fileKind, ['目前尚未支援此格式，請先轉成 Excel 或 CSV。'])
  }

  const candidates = parseExcelTables(buffer, file.name)
  return buildDetectionResultFromTables(file.name, fileKind, candidates)
}

export function buildDetectionResultFromTables(
  fileName: string,
  fileKind: SourceFileKind,
  candidates: CandidateTable[],
): ImportDetectionResult {
  const selectedTable = candidates.slice().sort((a, b) => b.rowCount - a.rowCount)[0] ?? null
  const fieldDetection = selectedTable
    ? detectRosterFields(selectedTable)
    : { columnMap: {}, confidence: 0, reasons: [], warnings: ['找不到可判讀表格'] }
  const importedRows = selectedTable ? buildImportedRows(selectedTable.rows, fieldDetection.columnMap) : []
  const sourceStudents = selectedTable ? parseStudentsFromTable(selectedTable, fieldDetection.columnMap) : []
  const isOfficialStudentSource =
    selectedTable !== null &&
    sourceStudents.length > 0 &&
    sourceStudents.length === selectedTable.rowCount &&
    selectedTable.headers.some((header) => /學號/.test(header)) &&
    selectedTable.headers.some((header) => /性別/.test(header))

  return { fileName, fileKind, selectedTable, candidates, fieldDetection, importedRows, sourceStudents, isOfficialStudentSource }
}

function detectFileKind(name: string): SourceFileKind {
  if (/\.(xlsx|xls|csv)$/i.test(name)) return 'excel'
  if (/\.pdf$/i.test(name)) return 'pdf'
  if (/\.(doc|docx)$/i.test(name)) return 'word'
  return 'unsupported'
}

function emptyResult(fileName: string, fileKind: SourceFileKind, warnings: string[]): ImportDetectionResult {
  return {
    fileName,
    fileKind,
    selectedTable: null,
    candidates: [],
    fieldDetection: { columnMap: {}, confidence: 0, reasons: [], warnings },
    importedRows: [],
    sourceStudents: [],
    isOfficialStudentSource: false,
  }
}
```

- [ ] **Step 3: Move student parsing helpers**

Create `src/lib/importer/studentSource.ts` with exported:

- `buildImportedRows(data, map)`
- `hydrateRow(raw, rowNo, map)`
- `parseStudentsFromTable(table, columnMap)`
- `parseClassParts(classValue, gradeValue)`
- `normalizeClass(value)`
- `normalizeSeat(value)`
- `normalizeName(value)`

Move implementations from `src/App.tsx` without changing behavior.

- [ ] **Step 4: Update App to consume pipeline**

In `src/App.tsx`, replace `handleFile` parsing with:

```ts
const result = await importRosterFile(file)
if (!result.selectedTable || result.importedRows.length === 0) {
  setMessage(result.fieldDetection.warnings[0] ?? '檔案沒有可判讀的學生名單。')
  return
}

if (result.isOfficialStudentSource) {
  setStudents(result.sourceStudents)
  localStorage.setItem(STUDENT_STORAGE_KEY, JSON.stringify(result.sourceStudents))
  setDatabaseMode('local')
}

setRows(result.importedRows)
setColumnMap(result.fieldDetection.columnMap)
setFileName(file.name)
setImportDetection(result)
```

Add state:

```ts
const [importDetection, setImportDetection] = useState<ImportDetectionResult | null>(null)
```

- [ ] **Step 5: Verify**

Run:

```powershell
npm run test
npm run lint
npm run build
```

Expected: all pass.

- [ ] **Step 6: Commit**

```powershell
git add src/App.tsx src/lib/importer
git commit -m "feat: add unified roster import pipeline"
```

## Task 5: Add Teacher Confirmation UI

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.css`

- [ ] **Step 1: Add detection summary panel**

In the control panel under "欄位對應", render when `importDetection` exists:

```tsx
<div className={`detection-summary confidence-${confidenceTone(importDetection.fieldDetection.confidence)}`}>
  <strong>自動辨識信心 {importDetection.fieldDetection.confidence}%</strong>
  <span>
    {importDetection.selectedTable?.sheetName
      ? `${importDetection.selectedTable.sheetName}，第 ${importDetection.selectedTable.headerRow} 列作為欄位列`
      : '尚未找到可判讀表格'}
  </span>
  {importDetection.fieldDetection.warnings.map((warning) => (
    <span key={warning}>{warning}</span>
  ))}
</div>
```

Add helper in `App.tsx`:

```ts
function confidenceTone(confidence: number) {
  if (confidence >= 85) return 'high'
  if (confidence >= 60) return 'medium'
  return 'low'
}
```

- [ ] **Step 2: Add CSS**

Add to `src/App.css`:

```css
.detection-summary {
  display: grid;
  gap: 6px;
  padding: 12px;
  border-radius: 8px;
  border: 1px solid #c8d4de;
  background: #f8fafc;
  color: #374151;
  font-size: 13px;
  line-height: 1.45;
}

.detection-summary strong {
  color: #111827;
  font-size: 14px;
}

.confidence-high {
  border-color: #9fd5ba;
  background: #eefaf4;
}

.confidence-medium {
  border-color: #f0cf8b;
  background: #fff9eb;
}

.confidence-low {
  border-color: #efb0aa;
  background: #fff5f4;
}
```

- [ ] **Step 3: Update message copy**

Use these messages:

```ts
const detectionNote =
  result.fieldDetection.confidence >= 85
    ? '系統已自動完成欄位辨識。'
    : '系統已先推測欄位，請確認左側欄位對應後再使用校對結果。'
```

- [ ] **Step 4: Verify UI**

Run:

```powershell
npm run build
npm run lint
```

Open local preview and inspect:

- 1900px: control panel does not overlap result table.
- 768px: control panel appears above table.
- 390px: controls fit viewport without horizontal page scroll.

- [ ] **Step 5: Commit**

```powershell
git add src/App.tsx src/App.css
git commit -m "feat: show roster import confidence"
```

## Task 6: Add Multi-Sheet Candidate Selection

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.css`
- Test: `src/lib/importer/__tests__/importRoster.test.ts`

- [ ] **Step 1: Add test for selecting biggest valid table**

Append to `importRoster.test.ts`:

```ts
it('selects candidate with the most roster-like rows', () => {
  const result = buildDetectionResultFromTables('多工作表.xlsx', 'excel', [
    {
      id: '說明-1',
      sourceName: '多工作表.xlsx',
      sheetName: '說明',
      headerRow: 1,
      headers: ['說明'],
      rows: [{ 說明: '請填寫資料' }],
      rowCount: 1,
    },
    {
      id: '名單-1',
      sourceName: '多工作表.xlsx',
      sheetName: '名單',
      headerRow: 1,
      headers: ['班級', '座號', '姓名'],
      rows: [
        { 班級: '101', 座號: '1', 姓名: '邱紘睿' },
        { 班級: '101', 座號: '2', 姓名: '黃宥寧' },
      ],
      rowCount: 2,
    },
  ])

  expect(result.selectedTable?.sheetName).toBe('名單')
})
```

- [ ] **Step 2: Improve candidate ranking**

In `buildDetectionResultFromTables`, rank by:

```ts
const ranked = candidates
  .map((candidate) => ({
    candidate,
    detection: detectRosterFields(candidate),
  }))
  .sort((a, b) => b.detection.confidence + b.candidate.rowCount - (a.detection.confidence + a.candidate.rowCount))
```

- [ ] **Step 3: Add candidate selector UI**

If `importDetection.candidates.length > 1`, render:

```tsx
<ColumnSelect
  label="偵測表格"
  value={importDetection.selectedTable?.id}
  headers={importDetection.candidates.map((candidate) => candidate.id)}
  onChange={selectCandidateTable}
/>
```

Implement `selectCandidateTable(id: string)` in `App.tsx` to rebuild `rows`, `columnMap`, and detection state from selected candidate.

- [ ] **Step 4: Verify**

Run:

```powershell
npm run test
npm run build
npm run lint
```

- [ ] **Step 5: Commit**

```powershell
git add src/App.tsx src/App.css src/lib/importer
git commit -m "feat: select detected roster table"
```

## Task 7: Add PDF and Word Interface Stubs

**Files:**
- Create: `src/lib/importer/pdf.ts`
- Create: `src/lib/importer/word.ts`
- Modify: `src/lib/importer/importRoster.ts`
- Test: `src/lib/importer/__tests__/unsupportedFormats.test.ts`

- [ ] **Step 1: Write tests for clear not-yet-supported behavior**

Create `src/lib/importer/__tests__/unsupportedFormats.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildUnsupportedResult } from '../importRoster'

describe('unsupported document formats', () => {
  it('returns a teacher-facing message for PDF', () => {
    const result = buildUnsupportedResult('活動名單.pdf', 'pdf')
    expect(result.fieldDetection.warnings[0]).toContain('PDF')
  })

  it('returns a teacher-facing message for Word', () => {
    const result = buildUnsupportedResult('活動名單.docx', 'word')
    expect(result.fieldDetection.warnings[0]).toContain('Word')
  })
})
```

- [ ] **Step 2: Implement stubs**

Create `src/lib/importer/pdf.ts`:

```ts
import type { CandidateTable } from './types'

export async function parsePdfTables(): Promise<CandidateTable[]> {
  return []
}
```

Create `src/lib/importer/word.ts`:

```ts
import type { CandidateTable } from './types'

export async function parseWordTables(): Promise<CandidateTable[]> {
  return []
}
```

Add exported `buildUnsupportedResult(fileName, fileKind)` in `importRoster.ts`.

- [ ] **Step 3: Update App copy**

Remove the early PDF/Word block in `handleFile`. Let `importRosterFile(file)` return structured warnings.

- [ ] **Step 4: Verify**

Run:

```powershell
npm run test
npm run build
npm run lint
```

- [ ] **Step 5: Commit**

```powershell
git add src/App.tsx src/lib/importer
git commit -m "feat: define pdf and word import path"
```

## Task 8: Implement DOCX Table Extraction

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/lib/importer/word.ts`
- Test: `src/lib/importer/__tests__/word.test.ts`

- [ ] **Step 1: Add DOCX parser**

Run:

```powershell
npm install mammoth
```

- [ ] **Step 2: Write unit test using synthetic HTML**

Create `word.test.ts` around a helper `tablesFromHtml(html, sourceName)`:

```ts
import { describe, expect, it } from 'vitest'
import { tablesFromHtml } from '../word'

describe('Word table extraction', () => {
  it('extracts roster table from docx html', () => {
    const html = '<table><tr><td>班級</td><td>座號</td><td>姓名</td></tr><tr><td>101</td><td>1</td><td>邱紘睿</td></tr></table>'
    const tables = tablesFromHtml(html, '名單.docx')
    expect(tables[0].headers).toEqual(['班級', '座號', '姓名'])
    expect(tables[0].rowCount).toBe(1)
  })
})
```

- [ ] **Step 3: Implement `tablesFromHtml`**

Use `DOMParser` only in browser code is unavailable in node tests. Implement with conservative regex for table rows:

```ts
export function tablesFromHtml(html: string, sourceName: string): CandidateTable[] {
  const tableMatches = [...html.matchAll(/<table[\s\S]*?<\/table>/gi)]
  return tableMatches.map((match, index) => {
    const rows = [...match[0].matchAll(/<tr[\s\S]*?<\/tr>/gi)].map((rowMatch) =>
      [...rowMatch[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) =>
        cell[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim(),
      ),
    )
    const headerRow = 1
    const headers = normalizeHeaders(rows[0] ?? [])
    const dataRows = rows.slice(1).map((row, rowIndex) => toRecord(row, headers, rowIndex + 2))
    return { id: `word-table-${index + 1}`, sourceName, headerRow, headers, rows: dataRows, rowCount: dataRows.length }
  })
}
```

- [ ] **Step 4: Implement `parseWordTables(file)`**

Use `mammoth.convertToHtml({ arrayBuffer })`, then call `tablesFromHtml`.

- [ ] **Step 5: Verify**

Run:

```powershell
npm run test
npm run build
npm run lint
```

- [ ] **Step 6: Commit**

```powershell
git add package.json package-lock.json src/lib/importer
git commit -m "feat: extract roster tables from word files"
```

## Task 9: Implement PDF Text/Table Extraction

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/lib/importer/pdf.ts`
- Test: `src/lib/importer/__tests__/pdf.test.ts`

- [ ] **Step 1: Add PDF parser**

Run:

```powershell
npm install pdfjs-dist
```

- [ ] **Step 2: Write parser tests using text rows**

Create `pdf.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { tablesFromTextLines } from '../pdf'

describe('PDF text line roster extraction', () => {
  it('extracts roster-like rows from whitespace separated lines', () => {
    const lines = ['班級 座號 姓名', '101 1 邱紘睿', '101 2 黃宥寧']
    const tables = tablesFromTextLines(lines, '名單.pdf')
    expect(tables[0].headers).toEqual(['班級', '座號', '姓名'])
    expect(tables[0].rowCount).toBe(2)
  })
})
```

- [ ] **Step 3: Implement line-to-table extraction**

Create `tablesFromTextLines(lines, sourceName)`:

```ts
export function tablesFromTextLines(lines: string[], sourceName: string): CandidateTable[] {
  const rows = lines
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(/\s{1,}|\t/).filter(Boolean))
    .filter((row) => row.length >= 3)

  const headerIndex = findHeaderRow(rows)
  const headers = normalizeHeaders(rows[headerIndex] ?? [])
  const dataRows = rows.slice(headerIndex + 1).map((row, index) => toRecord(row, headers, headerIndex + index + 2))
  return [{ id: 'pdf-text-table-1', sourceName, headerRow: headerIndex + 1, headers, rows: dataRows, rowCount: dataRows.length }]
}
```

- [ ] **Step 4: Implement `parsePdfTables(buffer, sourceName)`**

Use `pdfjs-dist` to load pages and collect text items sorted by vertical position. If text positions are unavailable in node test, keep extraction behind integration tests and cover `tablesFromTextLines`.

- [ ] **Step 5: Verify**

Run:

```powershell
npm run test
npm run build
npm run lint
```

- [ ] **Step 6: Commit**

```powershell
git add package.json package-lock.json src/lib/importer
git commit -m "feat: extract roster rows from pdf text"
```

## Task 10: Add Import Diagnostics and Exportable Debug Info

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.css`
- Create: `src/lib/importer/diagnostics.ts`
- Test: `src/lib/importer/__tests__/diagnostics.test.ts`

- [ ] **Step 1: Write diagnostics test**

```ts
import { describe, expect, it } from 'vitest'
import { summarizeImportDiagnostics } from '../diagnostics'

describe('summarizeImportDiagnostics', () => {
  it('creates teacher-readable diagnostics', () => {
    const summary = summarizeImportDiagnostics({
      fileName: '活動名單.xlsx',
      confidence: 72,
      headerRow: 2,
      rowCount: 30,
      warnings: ['找不到年級欄位'],
    })
    expect(summary).toContain('活動名單.xlsx')
    expect(summary).toContain('72%')
    expect(summary).toContain('第 2 列')
  })
})
```

- [ ] **Step 2: Implement diagnostics helper**

Create `diagnostics.ts`:

```ts
export function summarizeImportDiagnostics(input: {
  fileName: string
  confidence: number
  headerRow?: number
  rowCount: number
  warnings: string[]
}) {
  const lines = [
    `檔案：${input.fileName}`,
    `辨識信心：${input.confidence}%`,
    input.headerRow ? `欄位列：第 ${input.headerRow} 列` : '欄位列：未判定',
    `資料筆數：${input.rowCount}`,
  ]
  return [...lines, ...input.warnings.map((warning) => `提醒：${warning}`)].join('\n')
}
```

- [ ] **Step 3: Add UI action**

Add a compact button under detection summary:

```tsx
<button type="button" className="ghost-button wide" onClick={copyImportDiagnostics}>
  複製辨識報告
</button>
```

Implement `copyImportDiagnostics()` with `navigator.clipboard.writeText(...)`.

- [ ] **Step 4: Verify**

Run:

```powershell
npm run test
npm run build
npm run lint
```

- [ ] **Step 5: Commit**

```powershell
git add src/App.tsx src/App.css src/lib/importer
git commit -m "feat: add roster import diagnostics"
```

## Release Checklist

- [ ] Upload `學生資料概況_20260625152831.xls`: expected official source, 795 rows, high confidence.
- [ ] Upload a normal Excel roster with `班級/座號/姓名`: expected ordinary roster, not official source.
- [ ] Upload Excel with two blank rows before headers: expected correct header row.
- [ ] Upload Excel with generic headers but roster-like values: expected medium confidence and teacher confirmation prompt.
- [ ] Upload `.docx` with a real table after Task 8: expected candidate table.
- [ ] Upload text-based `.pdf` after Task 9: expected candidate table when rows are whitespace-separated.
- [ ] Upload scanned-image PDF: expected clear unsupported message, not silent failure.
- [ ] Test RWD at 390px, 768px, 1366px, 1900px.
- [ ] Run `rg -n "新明|石門|smes" . --glob "!node_modules/**" --glob "!dist/**"` before release.
- [ ] Run `npm run test`, `npm run lint`, `npm run build`.

## Execution Handoff

Plan saved at `docs/plans/2026-06-25-intelligent-roster-import.md`.

Implementation path:

1. **Subagent-Driven recommended:** use `superpowers-subagent-driven`, one fresh worker per task, then review and merge.
2. **Inline execution acceptable:** use the same plan sequentially with checkpoint commits after each task.

Start with Task 1 and Task 2. Do not begin PDF/Word dependencies until the importer core has tests and App no longer owns parsing logic.
