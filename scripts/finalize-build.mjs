import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const distDir = join(root, 'dist')
const siteUrl = 'https://cagoooo.github.io/student-list-checker/'

function git(args) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
}

function buildVersion() {
  if (process.env.BUILD_VERSION) return process.env.BUILD_VERSION
  const shortSha = (process.env.GITHUB_SHA || git(['rev-parse', '--short', 'HEAD']) || 'local').slice(0, 12)
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 13)
  return `${shortSha}-${stamp}`
}

function replaceInFile(path, replacements) {
  if (!existsSync(path)) return
  let text = readFileSync(path, 'utf8')
  for (const [from, to] of replacements) {
    text = text.replaceAll(from, to)
  }
  writeFileSync(path, text, 'utf8')
}

const version = buildVersion()
const replacements = [
  ['__APP_VERSION__', version],
  ['__SITE_URL__', siteUrl],
]

replaceInFile(join(distDir, 'index.html'), replacements)
replaceInFile(join(distDir, 'sw.js'), [
  ...replacements,
  ["'__BUILD_VERSION__'", `'${version}'`],
  ['"__BUILD_VERSION__"', `"${version}"`],
  ['__BUILD_VERSION__', version],
])

writeFileSync(
  join(distDir, 'version.json'),
  `${JSON.stringify(
    {
      version,
      siteUrl,
      generatedAt: new Date().toISOString(),
    },
    null,
    2,
  )}\n`,
  'utf8',
)

console.log(`finalized build ${version}`)
