import { useEffect, useMemo, useState } from 'react'
import type { ChangeEvent } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Download,
  FileSpreadsheet,
  RefreshCw,
  Upload,
  Wand2,
  XCircle,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import studentsData from './data/students.json'
import {
  checkIsAdmin,
  isFirebaseEnabled,
  loadFirebaseStudents,
  saveFirebaseStudents,
  signInWithGoogle,
  signOutFirebase,
  subscribeCurrentUser,
} from './lib/firebase'
import { detectColumns, parseExcelTables } from './lib/importer/excel'
import { summarizeImportDiagnostics } from './lib/importer/diagnostics'
import {
  applyHeaderRow as applyImportHeaderRow,
  importRosterFile,
  selectCandidateTable as selectImportCandidateTable,
} from './lib/importer/importRoster'
import { buildCorrectedWordBlob } from './lib/importer/exportWord'
import { recallColumnMap, rememberColumnMap } from './lib/importer/columnMemory'
import {
  applyStudentToRaw,
  buildImportedRows,
  hydrateRow,
  normalizeClass,
  normalizeName,
  parseStudentsFromTable,
} from './lib/importer/studentSource'
import type { CandidateTable, ImportDetectionResult } from './lib/importer/types'
import { applyServiceWorkerUpdate, registerServiceWorker } from './lib/registerSW'
import type { ColumnMap, DatabaseMode, ImportedRow, Student, ValidationResult, ValidationStatus } from './types'
import './App.css'

const DEFAULT_STUDENTS = studentsData.students as Student[]
const STUDENT_STORAGE_KEY = 'smes-student-database'

const SAMPLE_ROWS = [
  { 班級: '1年1班', 座號: '1', 姓名: '示範學生001', 項目: '閱讀獎' },
  { 班級: '1年1班', 座號: '2', 姓名: '示範學身002', 項目: '閱讀獎' },
  { 班級: '102', 座號: '5', 姓名: '示範學生031', 項目: '服務獎' },
  { 班級: '6年6班', 座號: '26', 姓名: '不存在', 項目: '美術獎' },
]

function App() {
  const firebaseReady = isFirebaseEnabled()
  const [students, setStudents] = useState<Student[]>(() => loadStoredStudents() ?? DEFAULT_STUDENTS)
  const [databaseMode, setDatabaseMode] = useState<DatabaseMode>(() => (loadStoredStudents() ? 'local' : 'demo'))
  const [userEmail, setUserEmail] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [fileName, setFileName] = useState('範例名單.xlsx')
  const [rows, setRows] = useState<ImportedRow[]>(() => buildImportedRows(SAMPLE_ROWS))
  const [columnMap, setColumnMap] = useState<ColumnMap>(() => detectColumns(Object.keys(SAMPLE_ROWS[0])))
  const [importDetection, setImportDetection] = useState<ImportDetectionResult | null>(null)
  const [message, setMessage] = useState(
    `已載入 ${DEFAULT_STUDENTS.length} 位學生資料，可直接測試校對與修正流程。`,
  )
  const [updateReady, setUpdateReady] = useState(false)

  useEffect(() => {
    registerServiceWorker(() => setUpdateReady(true))
  }, [])

  const headers = useMemo(() => collectHeaders(rows), [rows])
  const results = useMemo(() => rows.map((row) => validateRow(row, students)), [rows, students])
  const stats = useMemo(() => summarize(results), [results])
  // Firebase 已設定時，必須具備 admin 權限才能更新資料庫；未設定 Firebase 才保留本機模式。
  const canUpdateDatabase = !firebaseReady || isAdmin

  useEffect(() => {
    if (!firebaseReady) return undefined

    return subscribeCurrentUser(async (user) => {
      setUserEmail(user?.email ?? '')
      if (!user) {
        setIsAdmin(false)
        return
      }

      setIsAdmin(await checkIsAdmin())

      try {
        const firebaseStudents = await loadFirebaseStudents()
        if (firebaseStudents.length > 0) {
          setStudents(firebaseStudents)
          setDatabaseMode('firebase')
          setMessage(`已從 Firebase 載入 ${firebaseStudents.length} 位學生資料。`)
        } else {
          setMessage('已登入 Firebase，但雲端學生資料庫尚未建立，可先上傳學務系統匯出檔。')
        }
      } catch {
        setMessage('Firebase 學生資料讀取失敗，請確認 Firestore 規則與登入權限。')
      }
    })
  }, [firebaseReady])

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      setMessage(`正在讀取與辨識 ${file.name}…`)
      const imported = await importRosterFile(file, {
        onOcrProgress: ({ page, total }) =>
          setMessage(`掃描型 PDF，正在以文字辨識（OCR）讀取第 ${page} / ${total} 頁…`),
      })
      const warningMessage = imported.fieldDetection.warnings.join('；')

      if (!imported.selectedTable || imported.importedRows.length === 0) {
        setImportDetection(imported)
        setMessage(warningMessage || '找不到可辨識的名單資料，請確認檔案內含班級、座號與姓名。')
        return
      }

      if (imported.isOfficialStudentSource) {
        setStudents(imported.sourceStudents)
        localStorage.setItem(STUDENT_STORAGE_KEY, JSON.stringify(imported.sourceStudents))
        setDatabaseMode('local')
      }

      const savedMap = recallColumnMap(imported.selectedTable.headers)
      const effectiveMap = savedMap ?? imported.fieldDetection.columnMap
      setRows(
        savedMap
          ? imported.importedRows.map((row) => hydrateRow(row.raw, row.rowNo, effectiveMap))
          : imported.importedRows,
      )
      setColumnMap(effectiveMap)
      setImportDetection(imported)
      setFileName(file.name)
      setMessage(
        imported.isOfficialStudentSource
          ? `已偵測 ${file.name} 為學生資料原始檔，共 ${imported.sourceStudents.length} 位學生，已先載入為本機校對基準。`
          : `${buildImportMessage(
              file.name,
              imported.importedRows.length,
              imported.fieldDetection.confidence,
              imported.fieldDetection.reasons,
              warningMessage,
            )}${savedMap ? '（已套用先前記住的欄位對應）' : ''}`,
      )
    } catch {
      setMessage('檔案讀取失敗，請確認格式為 .xlsx、.xls、.csv、.pdf 或 .docx。')
    } finally {
      event.target.value = ''
    }
  }

  async function handleDatabaseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const buffer = await file.arrayBuffer()
      const nextStudents = parseStudentDatabase(buffer)
      setStudents(nextStudents)
      if (firebaseReady && userEmail) {
        await saveFirebaseStudents(nextStudents, file.name)
        localStorage.removeItem(STUDENT_STORAGE_KEY)
        setDatabaseMode('firebase')
        setMessage(`已更新 Firebase 學生資料庫：${file.name}，共 ${nextStudents.length} 位學生。`)
      } else {
        localStorage.setItem(STUDENT_STORAGE_KEY, JSON.stringify(nextStudents))
        setDatabaseMode('local')
        setMessage(`已更新本機學生資料庫：${file.name}，共 ${nextStudents.length} 位學生。`)
      }
    } catch {
      setMessage('學生資料庫更新失敗，請確認是學務系統匯出的學生資料概況 .xls。')
    } finally {
      event.target.value = ''
    }
  }

  function resetDatabase() {
    setStudents(DEFAULT_STUDENTS)
    localStorage.removeItem(STUDENT_STORAGE_KEY)
    setDatabaseMode('demo')
    setMessage(`已還原內建學生資料庫，共 ${DEFAULT_STUDENTS.length} 位學生。`)
  }

  async function handleSignIn() {
    try {
      await signInWithGoogle()
    } catch {
      setMessage('Firebase 登入失敗，請確認 Firebase Auth 設定與授權網域。')
    }
  }

  async function handleSignOut() {
    await signOutFirebase()
    setUserEmail('')
    setMessage('已登出 Firebase，系統會繼續使用目前瀏覽器中的資料。')
  }

  function updateColumnMap(key: keyof ColumnMap, value: string) {
    const next = { ...columnMap, [key]: value || undefined }
    setColumnMap(next)
    setRows((current) => current.map((row) => hydrateRow(row.raw, row.rowNo, next)))
    if (importDetection?.selectedTable) rememberColumnMap(importDetection.selectedTable.headers, next)
  }

  function selectCandidateTable(candidateId: string) {
    if (!importDetection) return
    const next = selectImportCandidateTable(importDetection, candidateId)
    setImportDetection(next)
    setRows(next.importedRows)
    setColumnMap(next.fieldDetection.columnMap)

    if (next.isOfficialStudentSource) {
      setStudents(next.sourceStudents)
      localStorage.setItem(STUDENT_STORAGE_KEY, JSON.stringify(next.sourceStudents))
      setDatabaseMode('local')
    }
  }

  function changeHeaderRow(headerRow: number) {
    if (!importDetection) return
    const next = applyImportHeaderRow(importDetection, headerRow)
    setImportDetection(next)
    setRows(next.importedRows)
    setColumnMap(next.fieldDetection.columnMap)
  }

  async function copyImportDiagnostics() {
    if (!importDetection) return

    const diagnostics = summarizeImportDiagnostics({
      fileName: importDetection.fileName,
      confidence: importDetection.fieldDetection.confidence,
      headerRow: importDetection.selectedTable?.headerRow,
      rowCount: importDetection.selectedTable?.rowCount ?? importDetection.importedRows.length,
      warnings: importDetection.fieldDetection.warnings,
    })

    try {
      await navigator.clipboard.writeText(diagnostics)
      setMessage('已複製辨識報告，可貼給行政或資訊組長協助判讀。')
    } catch {
      setMessage('無法自動複製辨識報告，請確認瀏覽器剪貼簿權限。')
    }
  }

  function applySuggestion(result: ValidationResult) {
    if (!result.suggestion) return
    setRows((current) =>
      current.map((row) => {
        if (row.id !== result.id || !result.suggestion) return row
        const raw = applyStudentToRaw(row.raw, result.suggestion, columnMap)
        return hydrateRow(raw, row.rowNo, columnMap)
      }),
    )
  }

  function applyAllSuggestions() {
    setRows((current) =>
      current.map((row) => {
        const result = validateRow(row, students)
        if (!result.suggestion || result.status === 'pass') return row
        const raw = applyStudentToRaw(row.raw, result.suggestion, columnMap)
        return hydrateRow(raw, row.rowNo, columnMap)
      }),
    )
  }

  function downloadCorrected() {
    const output = results.map((result) => {
      const corrected = result.suggestion ?? {
        className: result.classValue,
        seatNo: result.seatNo,
        name: result.name,
      }

      return {
        ...result.raw,
        校對狀態: statusLabel(result.status),
        錯誤提示: result.issue,
        建議班級: corrected.className,
        建議座號: corrected.seatNo,
        建議姓名: corrected.name,
        信心分數: result.confidence,
      }
    })

    const worksheet = XLSX.utils.json_to_sheet(output)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, '校對結果')
    XLSX.writeFile(workbook, `${stripExtension(fileName)}-校對結果.xlsx`)
  }

  async function downloadCorrectedWord() {
    const entries = results.map((result) => {
      const corrected = result.suggestion ?? {
        className: result.classValue,
        seatNo: result.seatNo,
        name: result.name,
      }
      return {
        status: statusLabel(result.status),
        sourceLabel: result.sourceLabel,
        className: corrected.className,
        seatNo: corrected.seatNo,
        name: corrected.name,
        issue: result.issue,
      }
    })

    try {
      const blob = await buildCorrectedWordBlob(`${stripExtension(fileName)} 校對結果`, entries)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${stripExtension(fileName)}-校對結果.docx`
      link.click()
      URL.revokeObjectURL(url)
    } catch {
      setMessage('產生修正版 Word 失敗，請改用下載校對結果（Excel）。')
    }
  }

  function downloadSample() {
    const worksheet = XLSX.utils.json_to_sheet(SAMPLE_ROWS)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, '學生名單')
    XLSX.writeFile(workbook, '學生名單校對範例.xlsx')
  }

  return (
    <main className="app-shell">
      {updateReady ? (
        <div className="update-banner" role="status">
          <span>
            <RefreshCw size={16} />
            平台已更新新版本
          </span>
          <button type="button" onClick={applyServiceWorkerUpdate}>
            立刻更新
          </button>
        </div>
      ) : null}
      <header className="topbar">
        <div>
          <p className="eyebrow">桃園市龍潭區石門國民小學</p>
          <h1>學生名單校對平台</h1>
          <p className={`database-chip database-${databaseMode}`}>
            {databaseModeLabel(databaseMode)}
            {userEmail ? `：${userEmail}` : ''}
          </p>
        </div>
        <div className="topbar-actions">
          {firebaseReady ? (
            userEmail ? (
              <button type="button" className="ghost-button" onClick={handleSignOut}>
                登出 Firebase
              </button>
            ) : (
              <button type="button" className="ghost-button" onClick={handleSignIn}>
                登入 Firebase
              </button>
            )
          ) : (
            <span className="firebase-note">Firebase 尚未設定</span>
          )}
          <button type="button" className="ghost-button" onClick={downloadSample}>
            <FileSpreadsheet size={18} />
            範例檔
          </button>
          <label className="primary-button">
            <Upload size={18} />
            上傳名單
            <input
              type="file"
              accept=".xlsx,.xls,.csv,.pdf,.doc,.docx"
              onChange={handleFile}
            />
          </label>
        </div>
      </header>

      <section className="summary-band">
        <div className="summary-copy">
          <span className="file-pill">{fileName}</span>
          <h2>自動比對班級、座號與姓名</h2>
          <p>{message}</p>
          <p className="source-note">
            資料庫來源：{databaseModeLabel(databaseMode)}，目前載入 {students.length} 位學生
          </p>
        </div>
        <div className="metric-grid" aria-label="校對統計">
          <Metric label="通過" value={stats.pass} tone="success" />
          <Metric label="待確認" value={stats.warning} tone="warning" />
          <Metric label="錯誤" value={stats.error} tone="danger" />
          <Metric label="總筆數" value={results.length} tone="neutral" />
        </div>
      </section>

      <section className="workspace">
        <aside className="control-panel">
          <div>
            <h2>欄位對應</h2>
            <p>系統會先自動判斷欄位，若老師檔案欄名不同，可在這裡手動指定。</p>
          </div>
          {importDetection ? (
            <div className={`detection-summary confidence-${confidenceTone(importDetection.fieldDetection.confidence)}`}>
              <strong>自動辨識信心 {importDetection.fieldDetection.confidence}%</strong>
              <span>
                {importDetection.selectedTable?.sheetName
                  ? `${importDetection.selectedTable.sheetName}，${headerRowLabel(importDetection.selectedTable.headerRow)}`
                  : '尚未找到可判讀表格'}
              </span>
              {importDetection.fieldDetection.warnings.map((warning) => (
                <span key={warning}>{warning}</span>
              ))}
            </div>
          ) : null}
          {importDetection ? (
            <button type="button" className="ghost-button wide" onClick={copyImportDiagnostics}>
              <Copy size={18} />
              複製辨識報告
            </button>
          ) : null}
          {importDetection && importDetection.candidates.length > 1 ? (
            <CandidateSelect
              label="偵測表格"
              value={importDetection.selectedTable?.id}
              candidates={importDetection.candidates}
              onChange={selectCandidateTable}
            />
          ) : null}
          {importDetection?.selectedTable?.rawRows ? (
            <HeaderRowSelect
              headerRow={importDetection.selectedTable.headerRow}
              rawRows={importDetection.selectedTable.rawRows}
              onChange={changeHeaderRow}
            />
          ) : null}
          <ColumnSelect
            label="班級欄位"
            value={columnMap.classKey}
            headers={headers}
            onChange={(value) => updateColumnMap('classKey', value)}
          />
          <ColumnSelect
            label="座號欄位"
            value={columnMap.seatKey}
            headers={headers}
            onChange={(value) => updateColumnMap('seatKey', value)}
          />
          <ColumnSelect
            label="姓名欄位"
            value={columnMap.nameKey}
            headers={headers}
            onChange={(value) => updateColumnMap('nameKey', value)}
          />
          <div className="action-stack">
            {canUpdateDatabase ? (
              <label className="ghost-button wide">
                <Upload size={18} />
                更新學生資料庫
                <input type="file" accept=".xls,.xlsx" onChange={handleDatabaseFile} />
              </label>
            ) : (
              <p className="readonly-note">
                您以校對權限登入，僅資訊組長可更新學生資料庫。
              </p>
            )}
            <button type="button" className="ghost-button wide" onClick={resetDatabase}>
              <RefreshCw size={18} />
              還原內建資料庫
            </button>
            <button type="button" className="primary-button wide" onClick={applyAllSuggestions}>
              <Wand2 size={18} />
              套用全部建議
            </button>
            <button type="button" className="ghost-button wide" onClick={downloadCorrected}>
              <Download size={18} />
              下載校對結果
            </button>
            <button type="button" className="ghost-button wide" onClick={downloadCorrectedWord}>
              <Download size={18} />
              下載修正版 Word
            </button>
          </div>
        </aside>

        <section className="table-panel">
          <div className="table-toolbar">
            <div>
              <h2>校對結果</h2>
              <p>系統不會直接覆蓋原始檔，需由行政人員確認後再下載修正版。</p>
            </div>
            <button
              type="button"
              className="ghost-button"
              onClick={() => {
                setRows(buildImportedRows(SAMPLE_ROWS, columnMap))
                setImportDetection(null)
                setFileName('範例名單.xlsx')
              }}
            >
              <RefreshCw size={18} />
              重置範例
            </button>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>狀態</th>
                  <th>列號</th>
                  <th>來源</th>
                  <th>原始班級</th>
                  <th>原始座號</th>
                  <th>原始姓名</th>
                  <th>提示</th>
                  <th>建議修正</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {results.map((result) => (
                  <tr key={result.id} className={`row-${result.status}`}>
                    <td>
                      <StatusBadge status={result.status} />
                    </td>
                    <td>{result.rowNo}</td>
                    <td>{result.sourceLabel || '—'}</td>
                    <td>{result.classValue || '未填'}</td>
                    <td>{result.seatNo || '未填'}</td>
                    <td>{result.name || '未填'}</td>
                    <td>{result.issue}</td>
                    <td>
                      {result.suggestion ? (
                        <span className="suggestion">
                          {result.suggestion.className} {result.suggestion.seatNo}號{' '}
                          {result.suggestion.name}
                        </span>
                      ) : (
                        <span className="muted">無</span>
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="mini-button"
                        disabled={!result.suggestion || result.status === 'pass'}
                        onClick={() => applySuggestion(result)}
                        title="套用這一列的建議"
                      >
                        <Wand2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </section>

      <footer className="site-credit">
        Made with <span aria-label="愛心" className="site-credit__heart">♥</span> by{' '}
        <a
          href="https://www.smes.tyc.edu.tw/modules/tadnews/page.php?ncsn=11&nsn=16#a5"
          target="_blank"
          rel="noopener noreferrer"
          className="site-credit__author"
        >
          阿凱老師
        </a>
      </footer>
    </main>
  )
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'success' | 'warning' | 'danger' | 'neutral'
}) {
  return (
    <div className={`metric metric-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function ColumnSelect({
  label,
  value,
  headers,
  onChange,
}: {
  label: string
  value?: string
  headers: string[]
  onChange: (value: string) => void
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value ?? ''} onChange={(event) => onChange(event.target.value)}>
        <option value="">尚未指定</option>
        {headers.map((header) => (
          <option key={header} value={header}>
            {header}
          </option>
        ))}
      </select>
    </label>
  )
}

function HeaderRowSelect({
  headerRow,
  rawRows,
  onChange,
}: {
  headerRow: number
  rawRows: string[][]
  onChange: (headerRow: number) => void
}) {
  const preview = (cells: string[]) => cells.filter(Boolean).slice(0, 4).join('・') || '（空白列）'
  return (
    <label className="field">
      <span>標題列</span>
      <select value={headerRow} onChange={(event) => onChange(Number(event.target.value))}>
        <option value={0}>無標題列（整份視為資料）</option>
        {rawRows.slice(0, 12).map((cells, index) => (
          <option key={index} value={index + 1}>
            第 {index + 1} 列：{preview(cells)}
          </option>
        ))}
      </select>
    </label>
  )
}

function CandidateSelect({
  label,
  value,
  candidates,
  onChange,
}: {
  label: string
  value?: string
  candidates: CandidateTable[]
  onChange: (value: string) => void
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value ?? ''} onChange={(event) => onChange(event.target.value)}>
        {candidates.map((candidate) => (
          <option key={candidate.id} value={candidate.id}>
            {candidateLabel(candidate)}
          </option>
        ))}
      </select>
    </label>
  )
}

function StatusBadge({ status }: { status: ValidationStatus }) {
  const icon =
    status === 'pass' ? (
      <CheckCircle2 size={16} />
    ) : status === 'warning' ? (
      <AlertTriangle size={16} />
    ) : (
      <XCircle size={16} />
    )

  return (
    <span className={`status-badge status-${status}`}>
      {icon}
      {statusLabel(status)}
    </span>
  )
}

function loadStoredStudents() {
  try {
    const value = localStorage.getItem(STUDENT_STORAGE_KEY)
    if (!value) return null
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? (parsed as Student[]) : null
  } catch {
    return null
  }
}

function parseStudentDatabase(buffer: ArrayBuffer): Student[] {
  const table = parsePrimaryExcelTable(buffer, 'student-database')
  if (!table) throw new Error('No students parsed')

  const students = parseStudentsFromTable(table, detectColumns(table.headers))
  if (students.length === 0) {
    throw new Error('No students parsed')
  }

  return students
}

function parsePrimaryExcelTable(buffer: ArrayBuffer, sourceName: string): CandidateTable | null {
  return parseExcelTables(buffer, sourceName).sort((a, b) => b.rowCount - a.rowCount)[0] ?? null
}

function buildImportMessage(fileName: string, rowCount: number, confidence: number, reasons: string[], warning?: string) {
  const detectionNote =
    confidence >= 85
      ? '系統已自動完成欄位辨識。'
      : '系統已先推測欄位，請確認左側欄位對應後再使用校對結果。'

  if (confidence >= 85) {
    return `已讀取 ${fileName}，共 ${rowCount} 筆資料。${detectionNote}${reasons.join('，')}。`
  }

  return `已讀取 ${fileName}，共 ${rowCount} 筆資料。${detectionNote}${warning ? ` ${warning}` : ''}`
}

function confidenceTone(confidence: number) {
  if (confidence >= 85) return 'high'
  if (confidence >= 60) return 'medium'
  return 'low'
}

function headerRowLabel(headerRow: number) {
  return headerRow > 0 ? `第 ${headerRow} 列作為欄位列` : '無標題列，整份視為資料'
}

function candidateLabel(candidate: CandidateTable) {
  const sheetName = candidate.sheetName || candidate.sourceName
  const headerPart = candidate.headerRow > 0 ? `第 ${candidate.headerRow} 列` : '無標題列'
  return `${sheetName}，${headerPart}，${candidate.rowCount} 筆`
}

function validateRow(row: ImportedRow, students: Student[]): ValidationResult {
  if (!row.classValue || !row.seatNo || !row.name) {
    return {
      ...row,
      status: 'error',
      issue: '缺少班級、座號或姓名，無法比對。',
      confidence: 0,
    }
  }

  const classCode = normalizeClass(row.classValue)
  const exact = students.find(
    (student) =>
      normalizeClass(student.className) === classCode &&
      student.seatNo === row.seatNo &&
      normalizeName(student.name) === row.name,
  )

  if (exact) {
    return {
      ...row,
      status: 'pass',
      issue: '資料完全符合。',
      suggestion: exact,
      confidence: 100,
    }
  }

  const sameSeat = students.find(
    (student) => normalizeClass(student.className) === classCode && student.seatNo === row.seatNo,
  )
  if (sameSeat) {
    const distance = levenshtein(normalizeName(sameSeat.name), row.name)
    return {
      ...row,
      status: distance <= 2 ? 'warning' : 'error',
      issue: `班級與座號吻合，但姓名應為「${sameSeat.name}」。`,
      suggestion: sameSeat,
      confidence: Math.max(55, 95 - distance * 15),
    }
  }

  const sameName = students.find((student) => normalizeName(student.name) === row.name)
  if (sameName) {
    return {
      ...row,
      status: 'warning',
      issue: '找到同名學生，但班級或座號不同。',
      suggestion: sameName,
      confidence: 76,
    }
  }

  const fuzzy = students
    .map((student) => ({
      student,
      distance: levenshtein(normalizeName(student.name), row.name),
    }))
    .sort((a, b) => a.distance - b.distance)[0]

  if (fuzzy && fuzzy.distance <= 2) {
    return {
      ...row,
      status: 'warning',
      issue: `找不到完全相符資料，疑似姓名為「${fuzzy.student.name}」。`,
      suggestion: fuzzy.student,
      confidence: 64,
    }
  }

  return {
    ...row,
    status: 'error',
    issue: '查無符合學生，請確認班級、座號與姓名。',
    confidence: 0,
  }
}

function collectHeaders(rows: ImportedRow[]) {
  return Array.from(new Set(rows.flatMap((row) => Object.keys(row.raw).filter((key) => !key.startsWith('__')))))
}

function summarize(results: ValidationResult[]) {
  return results.reduce(
    (sum, result) => {
      sum[result.status] += 1
      return sum
    },
    { pass: 0, warning: 0, error: 0 },
  )
}

function levenshtein(a: string, b: string) {
  const matrix = Array.from({ length: a.length + 1 }, (_, row) =>
    Array.from({ length: b.length + 1 }, (_, column) => (row === 0 ? column : column === 0 ? row : 0)),
  )

  for (let row = 1; row <= a.length; row += 1) {
    for (let column = 1; column <= b.length; column += 1) {
      const cost = a[row - 1] === b[column - 1] ? 0 : 1
      matrix[row][column] = Math.min(
        matrix[row - 1][column] + 1,
        matrix[row][column - 1] + 1,
        matrix[row - 1][column - 1] + cost,
      )
    }
  }

  return matrix[a.length][b.length]
}

function statusLabel(status: ValidationStatus) {
  return {
    pass: '通過',
    warning: '待確認',
    error: '錯誤',
  }[status]
}

function databaseModeLabel(mode: DatabaseMode) {
  return {
    demo: '公開匿名示範資料',
    local: '瀏覽器本機資料',
    firebase: 'Firebase 雲端資料庫',
  }[mode]
}

function stripExtension(name: string) {
  return name.replace(/\.[^.]+$/, '')
}

export default App
