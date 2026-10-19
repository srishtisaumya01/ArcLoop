import { expect, expectNoHorizontalScroll, test } from './support/fixtures.js'

// An accessibility pass over the signed-in screens, in Chromium at desktop and phone width, in the light and the dark theme. It needs no
// extra tool: the checks run inside the page. They cover the machine-checkable part of WCAG 2.2 AA (names, headings, contrast, target
// size, reflow, focus indicator, language). They do NOT replace a screen reader or a real device.
test.use({ timezoneId: 'America/New_York' })

const PAGES = [
  ['Dashboard', '/app'], ['My Day', '/app/day'], ['Week', '/app/week'], ['Progress', '/app/progress'], ['Challenges', '/app/challenges'],
  ['Recurring tasks', '/app/recurring'], ['Reminders', '/app/reminders'], ['Profile', '/app/profile'], ['Settings', '/app/settings'], ['Attendance', '/app/attendance'],
]
// The public pages. Their sections appear as they are scrolled into view, so the page is scrolled through (with motion reduced) before it is measured.
const PUBLIC_PAGES = [['Home', '/'], ['Public challenges', '/challenges'], ['How it works', '/how-it-works'], ['FAQ', '/faq'], ['Participants', '/participants']]

// Runs in the page. Returns the problems found, each a short readable line.
function audit() {
  const problems = []
  for (const el of document.querySelectorAll('*')) if (getComputedStyle(el).webkitBackgroundClip === 'text') el.setAttribute('data-clip-text', '') // gradient-filled text: hidden along with the rest while the screen behind it is measured
  const onImage = [] // text on a gradient or image: { x, y, w, h, fg, large, what }, in page coordinates
  const visible = (el) => {
    const r = el.getBoundingClientRect()
    const s = getComputedStyle(el)
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) !== 0 && !el.closest('[aria-hidden="true"]')
  }
  const describe = (el) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''} “${(el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40)}”`

  // 1. Names for controls.
  const nameOf = (el) => {
    const labelledby = el.getAttribute('aria-labelledby')
    if (labelledby) return labelledby.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' ').trim()
    if (el.getAttribute('aria-label')) return el.getAttribute('aria-label').trim()
    if (el.labels && el.labels.length) return [...el.labels].map((l) => l.textContent).join(' ').trim()
    const text = (el.textContent || '').trim()
    if (text) return text
    const img = el.querySelector('img[alt]')
    if (img && img.alt.trim()) return img.alt.trim()
    return (el.getAttribute('title') || '').trim()
  }
  for (const el of document.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=tab], [role=checkbox], [role=switch]')) {
    if (!visible(el) && el.type !== 'checkbox' && el.type !== 'radio') continue
    if (!nameOf(el)) problems.push(`no accessible name: ${describe(el)}`)
  }
  for (const img of document.querySelectorAll('img')) if (visible(img) && !img.hasAttribute('alt')) problems.push(`image without alt: ${img.src.slice(-40)}`)

  // 2. Headings: exactly one h1, and no level skipped on the way down.
  const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(visible)
  const h1s = headings.filter((h) => h.tagName === 'H1').length
  if (h1s !== 1) problems.push(`${h1s} h1 headings (expected 1)`)
  let last = 0
  for (const h of headings) {
    const level = Number(h.tagName[1])
    if (last && level > last + 1) problems.push(`heading level jumps from h${last} to h${level}: ${describe(h)}`)
    last = level
  }

  // 3. Landmarks and language.
  if (!document.documentElement.lang) problems.push('html has no lang')
  if (!document.querySelector('main, [role=main]')) problems.push('no main landmark')
  const ids = new Map()
  for (const el of document.querySelectorAll('[id]')) ids.set(el.id, (ids.get(el.id) ?? 0) + 1)
  for (const [id, n] of ids) if (n > 1) problems.push(`duplicate id "${id}" (${n}x)`)

  // 4. Target size (WCAG 2.2: at least 24 by 24 CSS px, unless inline in text).
  for (const el of document.querySelectorAll('button, a[href], input[type=checkbox], input[type=radio], select, [role=button]')) {
    if (!visible(el)) continue
    if (el.matches('a') && el.closest('p, li, span') && getComputedStyle(el).display === 'inline') continue
    const r = el.getBoundingClientRect()
    if (r.width < 24 || r.height < 24) problems.push(`target ${Math.round(r.width)}x${Math.round(r.height)} px: ${describe(el)}`)
  }

  // 5. Contrast of text (4.5, or 3 for large text) against the nearest solid background.
  const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] === undefined ? 1 : p[3] } }
  const over = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 })
  // The solid background of a text, or null when it sits on a gradient or an image (those are judged from the rendered pixels afterwards).
  const backgroundOf = (el) => {
    const layers = []
    for (let n = el; n; n = n.parentElement) {
      const st = getComputedStyle(n)
      if (n === el && (st.backgroundClip === 'text' || st.webkitBackgroundClip === 'text')) continue // gradient-filled text: its own background is the text, not what is behind it
      const c = parse(st.backgroundColor)
      if (c && c.a > 0) { layers.push(c); if (c.a === 1) break }
      if (st.backgroundImage !== 'none') return null
    }
    let base = parse(getComputedStyle(document.body).backgroundColor) ?? { r: 255, g: 255, b: 255, a: 1 }
    if (!layers.length || layers[layers.length - 1].a < 1) { if (base.a < 1) base = { r: 255, g: 255, b: 255, a: 1 } } else base = { r: 255, g: 255, b: 255, a: 1 }
    return layers.reverse().reduce((acc, layer) => over(layer, acc), base)
  }
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  const seen = new Set()
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.textContent.trim()) continue
    const el = node.parentElement
    if (!el || seen.has(el) || !visible(el) || el.closest('script, style, noscript')) continue
    seen.add(el)
    if (el.closest('[disabled], [aria-disabled="true"]')) continue // disabled controls are exempt
    const s = getComputedStyle(el)
    const fg = parse(s.color)
    if (!fg) continue
    const size = parseFloat(s.fontSize)
    const large = size >= 24 || (size >= 18.66 && Number(s.fontWeight) >= 700)
    const bg = backgroundOf(el)
    if (!bg) {
      const range = document.createRange()
      range.selectNodeContents(node)
      const r = range.getBoundingClientRect()
      if (r.width > 0 && r.height > 0) onImage.push({ x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height, fg, large, what: describe(el) })
      continue
    }
    const text = over(fg, bg)
    const ratio = (Math.max(lum(text), lum(bg)) + 0.05) / (Math.min(lum(text), lum(bg)) + 0.05)
    if (ratio < (large ? 3 : 4.5)) problems.push(`contrast ${ratio.toFixed(2)}:1 (${large ? 'large' : 'normal'} text): ${describe(el)}`)
  }
  return { problems, onImage }
}

// Runs in the page: the contrast of each text on a gradient, against the pixels actually rendered under it (text hidden), worst pixel counts.
async function contrastOnImage({ dataUrl, items }) {
  const img = new Image()
  img.src = dataUrl
  await img.decode()
  const canvas = document.createElement('canvas')
  canvas.width = img.width
  canvas.height = img.height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(img, 0, 0)
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
  const out = []
  for (const it of items) {
    let worst = Infinity
    for (let i = 0; i <= 5; i += 1) {
      for (let j = 0; j <= 2; j += 1) {
        const px = Math.min(img.width - 1, Math.max(0, Math.round(it.x + (it.w * i) / 5)))
        const py = Math.min(img.height - 1, Math.max(0, Math.round(it.y + (it.h * j) / 2)))
        const [r, g, b] = ctx.getImageData(px, py, 1, 1).data
        const bg = { r, g, b }
        const text = { r: it.fg.r * it.fg.a + r * (1 - it.fg.a), g: it.fg.g * it.fg.a + g * (1 - it.fg.a), b: it.fg.b * it.fg.a + b * (1 - it.fg.a) }
        worst = Math.min(worst, (Math.max(lum(text), lum(bg)) + 0.05) / (Math.min(lum(text), lum(bg)) + 0.05))
      }
    }
    if (worst < (it.large ? 3 : 4.5)) out.push(`contrast ${worst.toFixed(2)}:1 on a gradient (${it.large ? 'large' : 'normal'} text): ${it.what}`)
  }
  return out
}

// The page's problems, with the contrast of text on gradients measured from a screenshot taken with the text hidden.
async function auditPage(page) {
  const { problems, onImage } = await page.evaluate(audit)
  if (onImage.length) {
    // Taken a screen at a time, scrolling as a person would: sections that appear as they come into view are painted when measured.
    const style = await page.addStyleTag({ content: '[data-clip-text] { background: none !important; } * { color: transparent !important; text-shadow: none !important; caret-color: transparent !important; } svg { visibility: hidden !important; }' })
    const height = page.viewportSize().height
    const pad = 96 // the bars fixed to the top and bottom of the screen (menu, tab bar) cover this much of every screenshot, so text there is measured in another one
    const total = await page.evaluate(() => document.documentElement.scrollHeight)
    let pending = [...onImage]
    for (let y = 0; y < total && pending.length; y += (height - 2 * pad) / 2) {
      const top = await page.evaluate(async (to) => { window.scrollTo(0, to); await new Promise((r) => setTimeout(r, 350)); return window.scrollY }, y)
      const here = pending.filter((it) => it.y >= (top === 0 ? 0 : top + pad) && it.y + it.h <= top + height - pad)
      if (!here.length) continue
      pending = pending.filter((it) => !here.includes(it))
      const shot = await page.screenshot({ scale: 'css', animations: 'disabled' })
      problems.push(...await page.evaluate(contrastOnImage, { dataUrl: `data:image/png;base64,${shot.toString('base64')}`, items: here.map((it) => ({ ...it, y: it.y - top })) }))
    }
    await style.evaluate((el) => el.remove())
    await page.evaluate(() => window.scrollTo(0, 0))
  }
  return problems
}

async function settle(page) {
  await page.evaluate(async () => {
    const step = Math.max(200, window.innerHeight / 2)
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)) }
    window.scrollTo(0, 0)
  })
  await page.waitForTimeout(600)
}

for (const dark of [false, true]) {
  test.describe(dark ? 'dark theme (public)' : 'light theme (public)', () => {
    test.use({ signedIn: false })
    for (const [name, path] of PUBLIC_PAGES) {
      test(`${name}: names, headings, landmarks, target size and contrast`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: dark ? 'dark' : 'light', reducedMotion: 'reduce' })
        await page.goto(path)
        await page.waitForLoadState('networkidle')
        await expect(page.locator('h1').first()).toBeVisible()
        await settle(page)
        expect(await auditPage(page), `${name} (${dark ? 'dark' : 'light'})`).toEqual([])
      })
    }
  })
}

for (const dark of [false, true]) {
  test.describe(dark ? 'dark theme' : 'light theme', () => {
    for (const [name, path] of PAGES) {
      test(`${name}: names, headings, landmarks, target size and contrast`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: dark ? 'dark' : 'light' })
        await page.goto(path)
        await expect(page.locator('main h1, main [role=heading][aria-level="1"], h1').first()).toBeVisible()
        await page.waitForLoadState('networkidle')
        await page.waitForTimeout(400)
        const problems = await auditPage(page)
        expect(problems, `${name} (${dark ? 'dark' : 'light'})`).toEqual([])
      })
    }
  })
}

test.describe('reflow and focus', () => {
  test('My Day, Week and Challenges fit a 320 px wide screen, and at 200 percent zoom nothing scrolls sideways', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 })
    for (const path of ['/app/day', '/app/week', '/app/challenges', '/app/recurring']) {
      await page.goto(path)
      await page.waitForLoadState('networkidle')
      await expectNoHorizontalScroll(page)
    }
  })

  test('every control reached with Tab on My Day shows a visible focus indicator', async ({ page }) => {
    await page.goto('/app/day')
    await page.waitForLoadState('networkidle')
    const missing = []
    for (let i = 0; i < 40; i += 1) {
      await page.keyboard.press('Tab')
      const info = await page.evaluate(() => {
        const el = document.activeElement
        if (!el || el === document.body) return null
        const s = getComputedStyle(el)
        const field = el.closest('.MuiInputBase-root') // an outlined field shows focus as a thicker, coloured border on its outline
        const fieldRing = Boolean(field && field.classList.contains('Mui-focused') && parseFloat(getComputedStyle(field.querySelector('fieldset') ?? field).borderTopWidth) >= 2)
        const ring = fieldRing || s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0
        const shadow = s.boxShadow && s.boxShadow !== 'none'
        const parentRing = (() => { const p = el.closest('.Mui-focusVisible, [class*=MuiButtonBase]'); if (!p) return false; const ps = getComputedStyle(p); return (ps.outlineStyle !== 'none' && parseFloat(ps.outlineWidth) > 0) || (ps.boxShadow && ps.boxShadow !== 'none') || p.matches('.Mui-focusVisible') })()
        return { ok: ring || shadow || parentRing, name: `${el.tagName.toLowerCase()} ${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30)}` }
      })
      if (info && !info.ok) missing.push(info.name)
    }
    expect(missing).toEqual([])
  })

  test('with reduced motion asked for, nothing keeps animating on My Day', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/app/day')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('.MuiCircularProgress-indeterminate')).toHaveCount(0) // a spinner while the day loads is not decoration: wait for it to go
    const running = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running' && a.effect?.getTiming().iterations === Infinity).length)
    expect(running).toBe(0)
  })
})

// The Hindi screens: the same checks, with the language switched to Hindi first (the choice is kept in this browser's storage).
test.describe('Hindi', () => {
  for (const [name, path] of [['Dashboard', '/app'], ['My Day', '/app/day'], ['Week', '/app/week'], ['Challenges', '/app/challenges'], ['Profile', '/app/profile'], ['Settings', '/app/settings'], ['Home', '/']]) {
    test(`${name}: names, headings, landmarks, target size, contrast and no sideways scroll`, async ({ page }) => {
      await page.addInitScript(() => localStorage.setItem('arcloop.lang', 'hi'))
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.goto(path)
      await page.waitForLoadState('networkidle')
      await expect(page.locator('html')).toHaveAttribute('lang', 'hi')
      await expect(page.locator('h1').first()).toBeVisible()
      await settle(page)
      expect(await auditPage(page), `${name} (Hindi)`).toEqual([])
      await expectNoHorizontalScroll(page)
    })
  }
})
