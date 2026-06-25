import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createCanvas, GlobalFonts } from '@napi-rs/canvas'
import pngToIco from 'png-to-ico'

const root = resolve(import.meta.dirname, '..')
const publicDir = join(root, 'public')
mkdirSync(publicDir, { recursive: true })

const fontRegular = 'C:/Windows/Fonts/msjh.ttc'
const fontBold = 'C:/Windows/Fonts/msjhbd.ttc'
GlobalFonts.registerFromPath(fontRegular, 'JhengHei')
GlobalFonts.registerFromPath(fontBold, 'JhengHeiBold')

const colors = {
  ink: '#10243f',
  teal: '#25635a',
  green: '#2f8f65',
  gold: '#d99b2b',
  coral: '#c64c42',
  paper: '#f7f8fb',
  white: '#ffffff',
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + width, y, x + width, y + height, radius)
  ctx.arcTo(x + width, y + height, x, y + height, radius)
  ctx.arcTo(x, y + height, x, y, radius)
  ctx.arcTo(x, y, x + width, y, radius)
  ctx.closePath()
}

function drawLogo(ctx, x, y, size) {
  ctx.save()
  ctx.translate(x, y)
  ctx.fillStyle = colors.teal
  roundRect(ctx, 0, 0, size, size, size * 0.18)
  ctx.fill()

  ctx.fillStyle = colors.white
  ctx.globalAlpha = 0.18
  ctx.beginPath()
  ctx.arc(size * 0.22, size * 0.18, size * 0.42, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalAlpha = 1

  const cardW = size * 0.58
  const cardH = size * 0.7
  const cardX = size * 0.21
  const cardY = size * 0.15
  ctx.fillStyle = colors.white
  roundRect(ctx, cardX, cardY, cardW, cardH, size * 0.055)
  ctx.fill()

  const rows = [0.28, 0.42, 0.56]
  for (let i = 0; i < rows.length; i += 1) {
    const yy = size * rows[i]
    ctx.fillStyle = [colors.green, colors.gold, colors.coral][i]
    ctx.beginPath()
    ctx.arc(size * 0.34, yy, size * 0.035, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = colors.ink
    roundRect(ctx, size * 0.42, yy - size * 0.018, size * 0.22, size * 0.036, size * 0.018)
    ctx.fill()
  }

  ctx.strokeStyle = colors.gold
  ctx.lineWidth = size * 0.055
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(size * 0.34, size * 0.73)
  ctx.lineTo(size * 0.45, size * 0.82)
  ctx.lineTo(size * 0.68, size * 0.62)
  ctx.stroke()
  ctx.restore()
}

function makeIcon(size, maskable = false) {
  const canvas = createCanvas(size, size)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = maskable ? colors.paper : colors.teal
  ctx.fillRect(0, 0, size, size)
  const inset = maskable ? size * 0.14 : 0
  drawLogo(ctx, inset, inset, size - inset * 2)
  return canvas
}

function drawOgImage() {
  const canvas = createCanvas(1200, 630)
  const ctx = canvas.getContext('2d')

  ctx.fillStyle = colors.paper
  ctx.fillRect(0, 0, 1200, 630)

  const gradient = ctx.createLinearGradient(0, 0, 1200, 630)
  gradient.addColorStop(0, '#ffffff')
  gradient.addColorStop(1, '#e8f1ee')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 1200, 630)

  ctx.fillStyle = '#d8e5e0'
  ctx.fillRect(0, 450, 1200, 180)
  ctx.fillStyle = '#ffffff'
  roundRect(ctx, 710, 82, 430, 420, 18)
  ctx.fill()

  const sampleRows = [
    ['班級', '座號', '姓名', '狀態'],
    ['三年一班', '08', '王小安', '通過'],
    ['四年二班', '12', '陳○琪', '提醒'],
    ['六年五班', '23', '林小宇', '修正'],
  ]
  ctx.font = '24px JhengHeiBold'
  sampleRows.forEach((row, rowIndex) => {
    const y = 146 + rowIndex * 82
    ctx.fillStyle = rowIndex === 0 ? colors.ink : '#263849'
    const columnX = [750, 870, 962, 1052]
    row.forEach((text, columnIndex) => {
      const x = columnX[columnIndex]
      ctx.fillText(text, x, y)
    })
    ctx.strokeStyle = rowIndex === 0 ? '#afc2bd' : '#e0e8e5'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(745, y + 24)
    ctx.lineTo(1100, y + 24)
    ctx.stroke()
  })

  drawLogo(ctx, 82, 78, 132)

  ctx.fillStyle = colors.ink
  ctx.font = '74px JhengHeiBold'
  ctx.fillText('學生名單校對平台', 82, 285)

  ctx.font = '34px JhengHei'
  ctx.fillStyle = '#405064'
  ctx.fillText('快速核對班級、座號、姓名，', 86, 348)
  ctx.fillText('降低名單錯植與人工比對成本。', 86, 392)

  ctx.fillStyle = colors.teal
  roundRect(ctx, 86, 446, 304, 58, 29)
  ctx.fill()
  ctx.fillStyle = colors.white
  ctx.font = '26px JhengHeiBold'
  ctx.fillText('石門國小教學工具', 122, 484)

  ctx.fillStyle = '#526071'
  ctx.font = '23px JhengHei'
  ctx.fillText('cagoooo.github.io/student-list-checker', 86, 542)

  return canvas
}

const icon192 = makeIcon(192)
const icon512 = makeIcon(512)
const icon192Maskable = makeIcon(192, true)
const icon512Maskable = makeIcon(512, true)
const apple = makeIcon(180)
const og = drawOgImage()

writeFileSync(join(publicDir, 'icon-192.png'), icon192.toBuffer('image/png'))
writeFileSync(join(publicDir, 'icon-512.png'), icon512.toBuffer('image/png'))
writeFileSync(join(publicDir, 'icon-192-maskable.png'), icon192Maskable.toBuffer('image/png'))
writeFileSync(join(publicDir, 'icon-512-maskable.png'), icon512Maskable.toBuffer('image/png'))
writeFileSync(join(publicDir, 'apple-touch-icon.png'), apple.toBuffer('image/png'))
writeFileSync(join(publicDir, 'og-preview.png'), og.toBuffer('image/png'))

const favicon16 = makeIcon(16).toBuffer('image/png')
const favicon32 = makeIcon(32).toBuffer('image/png')
const favicon48 = makeIcon(48).toBuffer('image/png')
writeFileSync(join(publicDir, 'favicon.ico'), await pngToIco([favicon16, favicon32, favicon48]))

writeFileSync(
  join(publicDir, 'favicon.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="12" fill="${colors.teal}"/>
  <circle cx="15" cy="12" r="24" fill="#fff" opacity=".18"/>
  <rect x="14" y="10" width="36" height="44" rx="4" fill="#fff"/>
  <circle cx="23" cy="20" r="2.3" fill="${colors.green}"/>
  <rect x="29" y="18.8" width="14" height="2.4" rx="1.2" fill="${colors.ink}"/>
  <circle cx="23" cy="29" r="2.3" fill="${colors.gold}"/>
  <rect x="29" y="27.8" width="14" height="2.4" rx="1.2" fill="${colors.ink}"/>
  <circle cx="23" cy="38" r="2.3" fill="${colors.coral}"/>
  <rect x="29" y="36.8" width="14" height="2.4" rx="1.2" fill="${colors.ink}"/>
  <path d="M22 48l7 6 15-13" fill="none" stroke="${colors.gold}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`,
  'utf8',
)

console.log('brand assets generated')
