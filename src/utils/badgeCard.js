import { badgeStyle } from '../constants/badges.js'

const hex = (ctx, cx, cy, rx, ry) => {
  ctx.beginPath()
  ;[[cx, cy - ry], [cx + rx, cy - ry / 2], [cx + rx, cy + ry / 2], [cx, cy + ry], [cx - rx, cy + ry / 2], [cx - rx, cy - ry / 2]].forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
  ctx.closePath()
}

function sparkle(ctx, x, y, r, color) {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(x, y - r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.quadraticCurveTo(x, y, x, y + r)
  ctx.quadraticCurveTo(x, y, x - r, y)
  ctx.quadraticCurveTo(x, y, x, y - r)
  ctx.fill()
}

// Draws the shareable badge card (a dark card with the medal, like a certificate) and resolves a PNG Blob.
// `logo` is an already loaded same-origin <img>, or null. Drawn straight on a canvas: no data: or blob: images are needed.
export async function badgeCardBlob({ days, title, username, earnedOn, logo }) {
  const W = 1080
  const H = 1350
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  const bg = ctx.createLinearGradient(0, 0, 0, H)
  bg.addColorStop(0, '#0B0F1A')
  bg.addColorStop(1, '#1B2233')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)
  const spot = ctx.createRadialGradient(W / 2, 0, 0, W / 2, 0, 900)
  spot.addColorStop(0, 'rgba(255,255,255,0.16)')
  spot.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = spot
  ctx.fillRect(0, 0, W, H)

  if (logo) ctx.drawImage(logo, W - 60 - 300, 60, 300, (300 * logo.naturalHeight) / logo.naturalWidth)
  ctx.fillStyle = '#FDE6B0'
  ctx.font = '600 38px Arial, Helvetica, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText(`Dear ${username},`, 60, 110)

  ctx.textAlign = 'center'
  ctx.fillStyle = '#FDD98A'
  ctx.font = '700 72px Arial, Helvetica, sans-serif'
  ctx.fillText('Congratulations', W / 2, 330)
  ctx.fillText(`${title} Badge!`, W / 2, 420)

  const { from, to } = badgeStyle(days)
  const cx = W / 2
  const cy = 760
  const rim = ctx.createLinearGradient(cx - 230, cy - 250, cx + 230, cy + 250)
  rim.addColorStop(0, '#F4F6F8')
  rim.addColorStop(0.5, '#9AA3AF')
  rim.addColorStop(1, '#E5E7EB')
  hex(ctx, cx, cy, 230, 255)
  ctx.fillStyle = rim
  ctx.fill()
  hex(ctx, cx, cy, 196, 217)
  ctx.fillStyle = '#1F2937'
  ctx.fill()
  const gem = ctx.createLinearGradient(cx - 175, cy - 190, cx + 175, cy + 190)
  gem.addColorStop(0, from)
  gem.addColorStop(1, to)
  hex(ctx, cx, cy, 175, 193)
  ctx.fillStyle = gem
  ctx.fill()
  ctx.fillStyle = '#FFFFFF'
  ctx.font = `800 ${days >= 100 ? 150 : 180}px Arial, Helvetica, sans-serif`
  ctx.textBaseline = 'middle'
  ctx.fillText(String(days), cx, cy - 20)
  ctx.fillStyle = '#111827'
  ctx.beginPath()
  ctx.roundRect(cx - 120, cy + 100, 240, 56, 28)
  ctx.fill()
  ctx.fillStyle = '#E5E7EB'
  ctx.font = '800 34px Arial, Helvetica, sans-serif'
  ctx.fillText('D A Y S', cx, cy + 129)
  ctx.textBaseline = 'alphabetic'

  sparkle(ctx, 190, 600, 26, '#FDD98A')
  sparkle(ctx, 880, 560, 20, '#FDD98A')
  sparkle(ctx, 900, 930, 24, '#FDD98A')
  sparkle(ctx, 170, 960, 16, '#FDD98A')

  ctx.fillStyle = '#FDE6B0'
  ctx.font = '600 38px Arial, Helvetica, sans-serif'
  ctx.fillText(`AWARDED FOR A ${days}-DAY STREAK`, W / 2, 1130)
  ctx.fillText('BUILDING A HABIT ON ARCLOOP', W / 2, 1186)
  ctx.fillStyle = 'rgba(253,230,176,0.7)'
  ctx.font = '500 30px Arial, Helvetica, sans-serif'
  if (earnedOn) ctx.fillText(earnedOn, W / 2, 1250)
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not make the picture.'))), 'image/png'))
}
