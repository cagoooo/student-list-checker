import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Lock,
  LogIn,
  LogOut,
  RefreshCw,
  Upload,
  XCircle,
} from 'lucide-react'
import studentsData from './data/students.json'
import {
  validateRosterRowsOnBackend,
  validateRosterFileOnBackend,
  createOcrJobOnBackend,
  subscribeOcrJobStatus,
  type BackendValidationIssue,
  type BackendRosterRow,
  type BackendValidationReport,
  type BackendOcrJobStatus,
} from './lib/backendValidation'
import {
  checkIsAdmin,
  getGoogleRedirectResult,
  isFirebaseEnabled,
  loadFirebaseStudents,
  saveFirebaseStudents,
  signInWithGoogle,
  signOutFirebase,
  subscribeCurrentUser,
} from './lib/firebase'
import { detectColumns, parseExcelTables } from './lib/importer/excel'
import { importRosterFile } from './lib/importer/importRoster'
import { recallColumnMap } from './lib/importer/columnMemory'
import { compareChineseNames, findBestNameMatch } from './lib/importer/nameMatch'
import {
  hydrateRow,
  normalizeClass,
  normalizeName,
  parseStudentsFromTable,
} from './lib/importer/studentSource'
import type { CandidateTable } from './lib/importer/types'
import { applyServiceWorkerUpdate, registerServiceWorker } from './lib/registerSW'
import type { DatabaseMode, ImportedRow, Student, ValidationResult, ValidationStatus } from './types'
import './App.css'

const DEFAULT_STUDENTS = studentsData.students as Student[]
const STUDENT_STORAGE_KEY = 'smes-student-database'
const ACCEPTED_FORMATS = '.xlsx,.xls,.csv,.pdf,.doc,.docx'

function App() {
  const firebaseReady = isFirebaseEnabled()
  const [students, setStudents] = useState<Student[]>(() => loadStoredStudents() ?? DEFAULT_STUDENTS)
  const [databaseMode, setDatabaseMode] = useState<DatabaseMode>(() => (loadStoredStudents() ? 'local' : 'demo'))
  const [userEmail, setUserEmail] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState<ImportedRow[]>([])

  const [backendReport, setBackendReport] = useState<BackendValidationReport | null>(null)
  const [backendStatus, setBackendStatus] = useState<'local' | 'checking' | 'ready' | 'fallback'>('local')
  const [activeOcrJob, setActiveOcrJob] = useState<BackendOcrJobStatus | null>(null)
  const [message, setMessage] = useState('')
  const [updateReady, setUpdateReady] = useState(false)
  const [ocrElapsedSeconds, setOcrElapsedSeconds] = useState(0)
  const [showAdminPanel, setShowAdminPanel] = useState(false)
  const adminPanelRef = useRef<HTMLDivElement>(null)

  const hasData = rows.length > 0 || backendReport !== null || activeOcrJob !== null

  useEffect(() => {
    registerServiceWorker(() => setUpdateReady(true))
  }, [])

  useEffect(() => {
    if (!activeOcrJob?.jobId || activeOcrJob.status === 'completed' || activeOcrJob.status === 'failed') {
      return undefined
    }

    return subscribeOcrJobStatus(activeOcrJob.jobId, (job) => {
      if (!job) {
        setActiveOcrJob((current) =>
          current?.jobId === activeOcrJob.jobId
            ? { ...current, status: 'failed', progress: 100, errorMessage: '找不到 OCR 工作紀錄。' }
            : current,
        )
        setBackendStatus('fallback')
        return
      }

      setActiveOcrJob(job)
      if (job.status === 'completed') {
        if (job.resultSummary) {
          setBackendReport({
            validationId: job.resultValidationId,
            summary: job.resultSummary,
            issues: job.resultIssues ?? [],
          })
        }
        setBackendStatus('ready')
        setMessage(`掃描 PDF 背景辨識已完成；校對紀錄編號：${job.resultValidationId ?? job.jobId}。`)
        return
      }

      if (job.status === 'failed') {
        setBackendStatus('fallback')
        setMessage(job.errorMessage ? `OCR 背景辨識失敗：${job.errorMessage}` : 'OCR 背景辨識失敗。')
        return
      }

      setBackendStatus('checking')
      if (job.message) setMessage(job.message)
    })
  }, [activeOcrJob?.jobId, activeOcrJob?.status])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (adminPanelRef.current && !adminPanelRef.current.contains(event.target as Node)) {
        setShowAdminPanel(false)
      }
    }
    if (showAdminPanel) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showAdminPanel])

  const results = useMemo(() => rows.map((row) => validateRow(row, students)), [rows, students])
  const issueResults = useMemo(() => results.filter((result) => result.status !== 'pass'), [results])
  const localStats = useMemo(() => summarize(results), [results])
  const isOcrJobPending = activeOcrJob?.status === 'queued' || activeOcrJob?.status === 'processing'
  const isOcrJobIncomplete = isOcrJobPending || activeOcrJob?.status === 'failed'
  const pendingOcrStats = { total: 0, pass: 0, warning: 0, error: 0, usable: false }
  const stats = activeOcrJob?.resultSummary ?? (isOcrJobIncomplete ? pendingOcrStats : backendReport?.summary ?? localStats)
  const displayIssues = useMemo(
    () => (isOcrJobIncomplete ? [] : backendReport ? backendReport.issues.map(backendIssueToDisplayIssue) : issueResults),
    [backendReport, isOcrJobIncomplete, issueResults],
  )
  const totalCount = backendReport?.summary.total ?? results.length
  const displayTotalCount = activeOcrJob?.resultSummary?.total ?? (isOcrJobIncomplete ? 0 : totalCount)
  const validationId = backendReport?.validationId ?? activeOcrJob?.resultValidationId
  const reportTone = activeOcrJob?.status === 'failed'
    ? 'danger'
    : isOcrJobPending
      ? 'warning'
      : stats.error > 0
        ? 'danger'
        : stats.warning > 0
          ? 'warning'
          : 'success'
  const canUpdateDatabase = isAdmin

  useEffect(() => {
    if (!isOcrJobPending) {
      setOcrElapsedSeconds(0)
      return undefined
    }
    setOcrElapsedSeconds(0)
    const interval = setInterval(() => setOcrElapsedSeconds((prev) => prev + 1), 1000)
    return () => clearInterval(interval)
  }, [isOcrJobPending])

  useEffect(() => {
    if (!firebaseReady) return
    const params = new URLSearchParams(window.location.search)
    if (params.get('login') === '1') {
      history.replaceState(null, '', window.location.pathname)
      void signInWithGoogle()
      return
    }
    void getGoogleRedirectResult()
  }, [firebaseReady])

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

  useEffect(() => {
    if (!firebaseReady || !userEmail || rows.length === 0) {
      setBackendReport(null)
      setBackendStatus('local')
      return undefined
    }

    let ignore = false
    setBackendStatus('checking')
    validateRosterRowsOnBackend(
      rows.map((row) => ({
        id: row.id,
        rowNo: row.rowNo,
        sourceLabel: row.sourceLabel,
        classValue: row.classValue,
        seatNo: row.seatNo,
        name: row.name,
      })),
    )
      .then((report) => {
        if (ignore) return
        setBackendReport(report)
        setBackendStatus(report ? 'ready' : 'local')
      })
      .catch(() => {
        if (ignore) return
        setBackendReport(null)
        setBackendStatus('fallback')
      })

    return () => {
      ignore = true
    }
  }, [firebaseReady, rows, userEmail])

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      setActiveOcrJob(null)
      if (firebaseReady && userEmail && canBackendValidateFile(file)) {
        try {
          setMessage(`正在交由後端辨識與校對 ${file.name}…`)
          const backend = await validateRosterFileOnBackend(file)
          if (backend) {
            setRows(backend.rows.map(backendRowToImportedRow))
            setBackendReport(backend)
            setBackendStatus('ready')
            setFileName(file.name)
            setMessage(
              `後端已完成辨識與校對，共 ${backend.summary.total} 筆；下方只列出需要確認的項目。`,
            )
            return
          }
        } catch {
          if (/\.pdf$/i.test(file.name)) {
            const job = await createOcrJobOnBackend(file)
            if (job) {
              setBackendReport(null)
              setBackendStatus('checking')
              setFileName(file.name)
              setActiveOcrJob({
                jobId: job.jobId,
                fileName: file.name,
                status: job.status,
                progress: 0,
                message: job.message,
              })
              setMessage(`掃描型 PDF 已建立背景辨識工作：${job.jobId}。${job.message}`)
              return
            }
          }
          setBackendReport(null)
          setBackendStatus('fallback')
          setMessage('後端檔案校對暫不可用，已改用本機辨識流程。')
        }
      }

      setMessage(`正在讀取與辨識 ${file.name}…`)
      const imported = await importRosterFile(file, {
        onOcrProgress: ({ page, total }) =>
          setMessage(`掃描型 PDF，正在以文字辨識（OCR）讀取第 ${page} / ${total} 頁…`),
      })
      const warningMessage = imported.fieldDetection.warnings.join('；')

      if (!imported.selectedTable || imported.importedRows.length === 0) {
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
      setFileName(file.name)
      setMessage(
        imported.isOfficialStudentSource
          ? `已偵測 ${file.name} 為學生資料原始檔，共 ${imported.sourceStudents.length} 位學生，已先載入為本機校對基準。`
          : `已讀取 ${file.name}，共 ${imported.importedRows.length} 筆資料，自動完成欄位辨識（信心 ${imported.fieldDetection.confidence}%）。${warningMessage ? ` ${warningMessage}` : ''}`,
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

  const isInIframe = window !== window.top

  async function handleSignIn() {
    if (isInIframe) {
      window.open(window.location.href + '?login=1', '_blank', 'noopener')
      return
    }
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
          {canUpdateDatabase ? (
            <label className="ghost-button">
              <Upload size={16} />
              更新學生資料庫
              <input type="file" accept=".xls,.xlsx" onChange={handleDatabaseFile} />
            </label>
          ) : null}
        </div>
      </header>

      {hasData ? (
        <>
          <section className="summary-band">
            <div className="summary-copy">
              {fileName ? <span className="file-pill">{fileName}</span> : null}
              <h2>名單校對結果</h2>
              {message ? <p>{message}</p> : null}
              <p className="source-note">
                資料庫：{databaseModeLabel(databaseMode)}，共 {students.length} 位學生　校對模式：{backendModeLabel(backendStatus)}
                {validationId ? `　紀錄編號：${validationId}` : ''}
              </p>
              {activeOcrJob ? (
                <OcrJobProgress
                  job={activeOcrJob}
                  elapsedSeconds={ocrElapsedSeconds}
                  onReupload={() => {
                    setActiveOcrJob(null)
                    setBackendReport(null)
                    setBackendStatus('local')
                    setFileName('')
                    setRows([])
                  }}
                />
              ) : null}
            </div>
            <div className="metric-grid" aria-label="校對統計">
              <Metric label="通過" value={stats.pass} tone="success" />
              <Metric label="待確認" value={stats.warning} tone="warning" />
              <Metric label="錯誤" value={stats.error} tone="danger" />
              <Metric label="總筆數" value={displayTotalCount} tone="neutral" />
            </div>
          </section>

          <section className="workspace">
            <section className="table-panel">
              <div className={`report-card report-${reportTone}`} role="status">
                <div className="report-icon">
                  {reportTone === 'success' ? <CheckCircle2 size={28} /> : <AlertTriangle size={28} />}
                </div>
                <div>
                  <h2>{activeOcrJob ? ocrReportTitle(activeOcrJob) : reportTitle(stats)}</h2>
                  <p>{activeOcrJob ? ocrReportDescription(activeOcrJob) : reportDescription(stats, displayIssues.length)}</p>
                </div>
              </div>

              <div className="table-toolbar">
                <div>
                  <h2>需要老師確認的項目</h2>
                  <p>只列出可能有問題的學生；老師依提示回原始檔修正即可。</p>
                </div>
              </div>

              {displayIssues.length === 0 ? (
                <div className="empty-report">
                  {activeOcrJob?.status === 'processing' || activeOcrJob?.status === 'queued' ? (
                    <>
                      <RefreshCw size={42} />
                      <strong>正在背景辨識掃描 PDF</strong>
                      <span>完成後會更新校對摘要；老師可以先停留在這個畫面等待進度條跑完。</span>
                    </>
                  ) : activeOcrJob?.status === 'failed' ? (
                    <>
                      <AlertTriangle size={42} />
                      <strong>掃描 PDF 尚未完成校對</strong>
                      <span>{activeOcrJob.errorMessage ?? '背景辨識失敗，請改用較清晰的 PDF，或先轉成 Excel / CSV 再上傳。'}</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={42} />
                      <strong>目前沒有發現姓名或班級座號問題</strong>
                      <span>這份名單共 {displayTotalCount} 筆，系統比對結果皆為通過。</span>
                    </>
                  )}
                </div>
              ) : (
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
                        <th>系統比對到的資料</th>
                        <th>信心</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayIssues.map((result) => (
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
                          <td>{result.confidence}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </section>
        </>
      ) : (
        <section className="upload-prompt">
          <div className="upload-prompt__card">
            <FileSpreadsheet size={56} className="upload-prompt__icon" />
            <h2>請上傳老師的名單檔案</h2>
            <p>系統會自動辨識內容，與學生資料庫比對班級、座號、姓名，找出可能 KEY 錯的資料。</p>
            <div className="upload-prompt__formats">
              <span>支援格式</span>
              <code>.xlsx</code><code>.xls</code><code>.csv</code>
              <code>.pdf</code><code>.docx</code><code>.doc</code>
            </div>
            {message ? <p className="upload-prompt__message">{message}</p> : null}
            <label className="primary-button upload-prompt__btn">
              <Upload size={20} />
              選擇檔案上傳
              <input type="file" accept={ACCEPTED_FORMATS} onChange={handleFile} />
            </label>
          </div>
        </section>
      )}

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

      <div className="admin-entry" ref={adminPanelRef}>
        {showAdminPanel && (
          <div className="admin-panel" role="dialog" aria-label="管理員登入">
            {!firebaseReady ? (
              <p className="admin-panel__note">Firebase 尚未設定，請先完成 Firebase 環境設定。</p>
            ) : userEmail ? (
              <>
                <p className="admin-panel__account">
                  {isAdmin ? '👑 管理員' : '教師'}<br />
                  <span>{userEmail}</span>
                </p>
                <button type="button" className="admin-panel__btn" onClick={() => { void handleSignOut(); setShowAdminPanel(false) }}>
                  <LogOut size={15} />
                  登出
                </button>
              </>
            ) : (
              <>
                <p className="admin-panel__note">
                  {isInIframe
                    ? '請在獨立視窗登入（點下方按鈕會開啟新分頁）。'
                    : '以管理員 Google 帳號登入，解鎖資料庫更新功能。'}
                </p>
                <button type="button" className="admin-panel__btn admin-panel__btn--primary" onClick={() => { void handleSignIn(); setShowAdminPanel(false) }}>
                  <LogIn size={15} />
                  {isInIframe ? '開啟新分頁登入' : 'Google 登入'}
                </button>
              </>
            )}
          </div>
        )}
        <button
          type="button"
          className={`admin-trigger${userEmail ? ' admin-trigger--active' : ''}`}
          onClick={() => setShowAdminPanel((prev) => !prev)}
          aria-label="管理員入口"
          title={userEmail ? `已登入：${userEmail}` : '管理員登入'}
        >
          <Lock size={14} />
        </button>
      </div>
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

function OcrJobProgress({
  job,
  elapsedSeconds,
  onReupload,
}: {
  job: BackendOcrJobStatus
  elapsedSeconds: number
  onReupload: () => void
}) {
  const tone = job.status === 'failed' ? 'danger' : job.status === 'completed' ? 'success' : 'active'
  const progress = job.status === 'queued' ? Math.max(job.progress, 4) : job.progress
  const isPending = job.status === 'queued' || job.status === 'processing'
  const isLongWait = isPending && elapsedSeconds >= 180
  return (
    <div className={`ocr-progress ocr-progress-${tone}`} role="status">
      <div className="ocr-progress__header">
        <span>{ocrStatusLabel(job.status)}{isPending && elapsedSeconds > 0 ? `（已等待 ${elapsedSeconds} 秒）` : ''}</span>
        <strong>{job.status === 'failed' ? '未完成' : `${progress}%`}</strong>
      </div>
      <div
        className="ocr-progress__bar"
        role="progressbar"
        aria-label="OCR 背景辨識進度"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={job.status === 'failed' ? 100 : progress}
      >
        <span style={{ width: `${job.status === 'failed' ? 100 : progress}%` }} />
      </div>
      <div className="ocr-progress__meta">
        <span>工作編號：{job.jobId}</span>
        {job.resultValidationId ? <span>校對紀錄：{job.resultValidationId}</span> : null}
      </div>
      <p>{job.errorMessage ?? job.message}</p>
      {isLongWait ? (
        <p className="ocr-progress__timeout-hint">
          背景辨識時間較長，掃描 PDF 頁數多或解析度高時正常。可繼續等待，或改用 Excel / CSV 重新上傳。
        </p>
      ) : null}
      {(job.status === 'failed' || isLongWait) ? (
        <button type="button" className="ghost-button ocr-progress__reupload" onClick={onReupload}>
          <Upload size={16} />
          重新上傳其他檔案
        </button>
      ) : null}
    </div>
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
    const nameMatch = compareChineseNames(sameSeat.name, row.name)
    return {
      ...row,
      status: nameMatch.level === 'low' ? 'error' : 'warning',
      issue: `班級與座號吻合，但姓名應為「${sameSeat.name}」（${nameMatchLabel(nameMatch.level)}：${nameMatch.reasons.join('、') || '姓名差異'}）。`,
      suggestion: sameSeat,
      confidence: nameMatch.confidence,
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

  const fuzzy = findBestNameMatch(row.name, students)

  if (fuzzy && fuzzy.level !== 'low') {
    return {
      ...row,
      status: 'warning',
      issue: `找不到完全相符資料，疑似姓名為「${fuzzy.student.name}」（${nameMatchLabel(fuzzy.level)}：${fuzzy.reasons.join('、') || '姓名近似'}）。`,
      suggestion: fuzzy.student,
      confidence: fuzzy.confidence,
    }
  }

  return {
    ...row,
    status: 'error',
    issue: '查無符合學生，請確認班級、座號與姓名。',
    confidence: 0,
  }
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

function backendIssueToDisplayIssue(issue: BackendValidationIssue): ValidationResult {
  return {
    id: `backend-${issue.rowNo}-${issue.original.classValue}-${issue.original.seatNo}-${issue.original.name}`,
    rowNo: issue.rowNo,
    sourceLabel: issue.sourceLabel,
    raw: {},
    classValue: issue.original.classValue,
    seatNo: issue.original.seatNo,
    name: issue.original.name,
    status: issue.status,
    issue: issue.issue,
    suggestion: issue.suggestion
      ? {
          id: `${issue.suggestion.className}-${issue.suggestion.seatNo}-${issue.suggestion.name}`,
          grade: 0,
          className: issue.suggestion.className,
          classCode: normalizeClass(issue.suggestion.className),
          seatNo: issue.suggestion.seatNo,
          name: issue.suggestion.name,
        }
      : undefined,
    confidence: issue.confidence,
  }
}

function backendRowToImportedRow(row: BackendRosterRow, index: number): ImportedRow {
  const rowNo = Number(row.rowNo ?? index + 1)
  const raw = {
    班級: row.classValue ?? '',
    座號: row.seatNo ?? '',
    姓名: row.name ?? '',
  }
  return {
    id: row.id ?? `backend-row-${rowNo}`,
    rowNo,
    sourceLabel: row.sourceLabel,
    raw,
    classValue: row.classValue ?? '',
    seatNo: row.seatNo ?? '',
    name: row.name ?? '',
  }
}

function canBackendValidateFile(file: File) {
  return /\.(xlsx|csv|docx|pdf)$/i.test(file.name) && file.size <= 7 * 1024 * 1024
}

function reportTitle(stats: Record<ValidationStatus, number>) {
  if (stats.error > 0) return '這份名單有需要修正的資料'
  if (stats.warning > 0) return '這份名單有幾筆需要老師確認'
  return '這份名單目前全部比對正確'
}

function reportDescription(stats: Record<ValidationStatus, number>, issueCount: number) {
  if (stats.error > 0) {
    return `發現 ${stats.error} 筆錯誤、${stats.warning} 筆待確認。下方只列出 ${issueCount} 筆需要回原檔確認的項目。`
  }
  if (stats.warning > 0) {
    return `沒有明確錯誤，但有 ${stats.warning} 筆姓名或位置需要人工看一下。`
  }
  return `共 ${stats.pass} 筆資料通過比對，沒有發現姓名 KEY 錯或班級座號不符。`
}

function ocrStatusLabel(status: BackendOcrJobStatus['status']) {
  return {
    queued: '等待背景辨識',
    processing: '背景辨識中',
    completed: '辨識與校對完成',
    failed: '背景辨識失敗',
  }[status]
}

function ocrReportTitle(job: BackendOcrJobStatus) {
  if (job.status === 'completed') return '掃描 PDF 已完成後端校對'
  if (job.status === 'failed') return '掃描 PDF 尚未完成校對'
  return '掃描 PDF 正在背景辨識'
}

function ocrReportDescription(job: BackendOcrJobStatus) {
  if (job.status === 'completed') {
    const summary = job.resultSummary
    if (!summary) return `已完成背景辨識；校對紀錄編號：${job.resultValidationId ?? job.jobId}。`
    if (summary.error > 0) return `完成 ${summary.total} 筆校對，其中 ${summary.error} 筆錯誤、${summary.warning} 筆待確認。`
    if (summary.warning > 0) return `完成 ${summary.total} 筆校對，其中 ${summary.warning} 筆需要老師確認。`
    return `完成 ${summary.total} 筆校對，目前沒有發現姓名或班級座號問題。`
  }

  if (job.status === 'failed') {
    return job.errorMessage ?? '背景辨識未完成，請改用較清晰的 PDF，或先轉成 Excel / CSV 再上傳。'
  }

  return '系統正在背景處理，老師不用重新上傳；請等待進度條完成。'
}

function nameMatchLabel(level: 'high' | 'medium' | 'low') {
  return {
    high: '高信心建議',
    medium: '中信心待確認',
    low: '低信心人工確認',
  }[level]
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

function backendModeLabel(mode: 'local' | 'checking' | 'ready' | 'fallback') {
  return {
    local: '本機即時檢查',
    checking: '後端校對中',
    ready: 'Firebase 後端校對',
    fallback: '後端暫不可用，已改用本機檢查',
  }[mode]
}

export default App
