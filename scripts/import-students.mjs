import fs from 'node:fs'
import path from 'node:path'
import XLSX from 'xlsx'

const sourceArg = process.argv[2]
const cwd = process.cwd()
const sourceFile = sourceArg
  ? path.resolve(cwd, sourceArg)
  : path.join(cwd, fs.readdirSync(cwd).find((name) => /\.xls$/i.test(name)) ?? '')

if (!sourceFile || !fs.existsSync(sourceFile)) {
  throw new Error('找不到學生資料 Excel 檔，請傳入 .xls 檔案路徑。')
}

const workbook = XLSX.readFile(sourceFile, { cellDates: false })
const sheet = workbook.Sheets[workbook.SheetNames[0]]
const rows = XLSX.utils.sheet_to_json(sheet, {
  header: 1,
  defval: '',
  raw: false,
})

const dataRows = rows.slice(3).filter((row) => row.some((cell) => String(cell).trim() !== ''))
const students = dataRows.map((row) => {
  const name = String(row[0] ?? '').trim()
  const studentNo = String(row[1] ?? '').trim()
  const grade = Number(String(row[2] ?? '').trim())
  const gender = String(row[3] ?? '').trim()
  const classNo = Number(String(row[4] ?? '').trim())
  const seatNo = String(Number(String(row[5] ?? '').trim())).padStart(2, '0')
  const classCode = `${grade}${String(classNo).padStart(2, '0')}`

  return {
    id: studentNo || `${classCode}-${seatNo}`,
    studentNo,
    grade,
    classNo,
    className: `${grade}年${classNo}班`,
    classCode,
    seatNo,
    name,
    gender,
  }
})

const outDir = path.join(cwd, 'src', 'data')
fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(
  path.join(outDir, 'students.json'),
  JSON.stringify(
    {
      sourceFile: path.basename(sourceFile),
      importedAt: new Date().toISOString(),
      students,
    },
    null,
    2,
  ),
  'utf8',
)

console.log(`已匯入 ${students.length} 位學生資料。`)
