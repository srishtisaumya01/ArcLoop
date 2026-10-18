import { expect, expectNoHorizontalScroll, test } from './support/fixtures.js'

// The delete-account confirmation is the most dangerous control in the app, so it gets its own layout and keyboard
// checks at desktop and mobile widths (the two projects) and at three more awkward sizes. Stubbed API: this is about
// how the dialog looks and behaves, not about deleting anything (deletion itself is in e2e-django/account.spec.js).

const SIZES = [
  { name: 'small phone 320x568', width: 320, height: 568 },
  { name: 'landscape phone 667x375', width: 667, height: 375 },
  { name: 'tablet 768x1024', width: 768, height: 1024 },
]

async function openDialog(page) {
  await page.goto('/app/settings')
  const trigger = page.getByRole('button', { name: 'Delete account' })
  await trigger.scrollIntoViewIfNeeded()
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: 'Delete your account?' })
  await expect(dialog).toBeVisible()
  return { dialog, trigger }
}

// Everything a person must read or press is inside the viewport, or can be scrolled to inside the dialog itself.
async function expectUsable(page, dialog) {
  const viewport = page.viewportSize()
  const box = await dialog.boundingBox()
  expect(box.x, 'dialog starts inside the viewport').toBeGreaterThanOrEqual(0)
  expect(box.x + box.width, 'dialog ends inside the viewport width').toBeLessThanOrEqual(viewport.width + 0.5)
  expect(box.y, 'dialog top is on screen').toBeGreaterThanOrEqual(0)
  expect(box.y + box.height, 'dialog bottom is on screen').toBeLessThanOrEqual(viewport.height + 0.5)
  await expectNoHorizontalScroll(page)
  // However short the screen, what the dialog asks and the two ways out are all in view at the same time (only the middle scrolls).
  await expect(dialog.getByRole('heading', { name: 'Delete your account?' })).toBeInViewport({ ratio: 1 })
  await expect(dialog.getByRole('button', { name: 'Keep my account' })).toBeInViewport({ ratio: 1 })
  await expect(dialog.getByRole('button', { name: 'Delete everything' })).toBeInViewport({ ratio: 1 })
  for (const control of [dialog.getByLabel('Your password'), dialog.getByLabel('Type DELETE to confirm'), dialog.getByRole('button', { name: 'Keep my account' }), dialog.getByRole('button', { name: 'Delete everything' })]) {
    await control.scrollIntoViewIfNeeded()
    await expect(control).toBeVisible()
    const b = await control.boundingBox()
    expect(b.x).toBeGreaterThanOrEqual(0)
    expect(b.x + b.width).toBeLessThanOrEqual(viewport.width + 0.5)
    expect(b.y).toBeGreaterThanOrEqual(0)
    expect(b.y + b.height).toBeLessThanOrEqual(viewport.height + 0.5)
  }
  // Nothing in the dialog is clipped sideways (text wraps instead of being cut off). MUI's <legend> inside an outlined field is
  // deliberately zero-width and hidden: not clipping.
  const clipped = await dialog.evaluate((el) => [...el.querySelectorAll('*:not(legend)')].filter((n) => n.scrollWidth > n.clientWidth + 1 && getComputedStyle(n).overflowX !== 'visible').length)
  expect(clipped).toBe(0)
}

test.describe('at the project width', () => {
  test('fits, is fully usable, and has comfortable targets', async ({ page }, testInfo) => {
    const { dialog } = await openDialog(page)
    await expectUsable(page, dialog)
    // Touch targets: WCAG 2.2 AA asks for at least 24x24 CSS px; 44 is the comfortable recommendation on a phone.
    const heights = []
    for (const name of ['Keep my account', 'Delete everything']) heights.push((await dialog.getByRole('button', { name }).boundingBox()).height)
    for (const field of ['Your password', 'Type DELETE to confirm']) heights.push((await dialog.getByLabel(field).boundingBox()).height)
    expect(Math.min(...heights), `smallest target on ${testInfo.project.name}`).toBeGreaterThanOrEqual(24)
    if (testInfo.project.name === 'mobile') expect(Math.min(...heights), 'comfortable on a phone').toBeGreaterThanOrEqual(36)
    await page.screenshot({ path: testInfo.outputPath(`delete-dialog-${testInfo.project.name}.png`) })
  })

  test('keyboard: focus moves into the dialog, stays inside it, Escape closes it and focus returns to the button', async ({ page }) => {
    const { dialog, trigger } = await openDialog(page)
    await expect.poll(() => dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true)
    const inside = []
    for (let i = 0; i < 8; i += 1) {
      await page.keyboard.press('Tab')
      inside.push(await dialog.evaluate((el) => el.contains(document.activeElement)))
    }
    expect(inside.every(Boolean), 'Tab never leaves the open dialog').toBe(true)
    await page.keyboard.press('Shift+Tab')
    expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(trigger).toBeFocused()
  })

  test('the destructive button stays disabled until both fields are right, and says what it does', async ({ page }) => {
    const { dialog } = await openDialog(page)
    const go = dialog.getByRole('button', { name: 'Delete everything' })
    await expect(go).toBeDisabled()
    await dialog.getByLabel('Your password').fill('x')
    await dialog.getByLabel('Type DELETE to confirm').fill('delete')
    await expect(go).toBeDisabled()
    await dialog.getByLabel('Type DELETE to confirm').fill('DELETE')
    await expect(go).toBeEnabled()
    await expect(dialog).toContainText('permanently deleted')
    await expect(dialog).toContainText('signed out on every device')
  })

  test('the on-screen keyboard case: with the password field focused the buttons can still be reached', async ({ page }) => {
    const { dialog } = await openDialog(page)
    // Simulate a phone's keyboard taking about half the screen.
    const viewport = page.viewportSize()
    await page.setViewportSize({ width: viewport.width, height: Math.max(300, Math.round(viewport.height / 2)) })
    await dialog.getByLabel('Your password').focus()
    for (const name of ['Keep my account', 'Delete everything']) {
      const button = dialog.getByRole('button', { name })
      await button.scrollIntoViewIfNeeded()
      await expect(button).toBeVisible()
    }
  })
})

test.describe('at other sizes', () => {
  for (const size of SIZES) {
    test(`is usable at ${size.name}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: size.width, height: size.height })
      const { dialog } = await openDialog(page)
      await expectUsable(page, dialog)
      await page.screenshot({ path: testInfo.outputPath(`delete-dialog-${size.width}x${size.height}.png`) })
    })
  }
})
