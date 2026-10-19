import { expect, test } from '@playwright/test'
import { apiAs, signUpViaForm, uniqueEmail } from './support/helpers.js'

// Choosing a profile photo through the real UI and API: the picture is shrunk in the browser, uploaded, shown, and can be removed.
// The pictures are made in the page itself, so no file is needed on disk.

// A picture of the given size and type, built in the browser and returned as a file payload for setInputFiles.
async function picture(page, { width, height, type = 'image/png', name = 'photo.png' }) {
  const base64 = await page.evaluate(async ({ width, height, type }) => {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    for (let y = 0; y < height; y += 40) for (let x = 0; x < width; x += 40) { ctx.fillStyle = `hsl(${(x * 7 + y * 3) % 360} 70% 50%)`; ctx.fillRect(x, y, 40, 40) }
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, 0.95))
    const bytes = new Uint8Array(await blob.arrayBuffer())
    let binary = ''
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    return btoa(binary)
  }, { width, height, type })
  return { name, mimeType: type, buffer: Buffer.from(base64, 'base64') }
}

test('a photo is chosen, shrunk, uploaded and shown, then removed', async ({ page }) => {
  await signUpViaForm(page, uniqueEmail('photo'))
  await page.goto('/app/profile')
  const section = page.locator('section', { has: page.getByRole('heading', { name: 'Profile photo' }) })
  await expect(page.getByRole('button', { name: 'Upload photo' })).toBeVisible()
  const upload = await picture(page, { width: 3000, height: 2000 }) // like a phone camera's picture
  await page.getByLabel('Choose a photo').setInputFiles(upload)
  await expect(page.getByText('Photo updated.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Change photo' })).toBeVisible()
  await expect(section.locator('img')).toBeVisible()
  expect(await section.locator('img').evaluate((img) => img.complete && img.naturalWidth)).toBe(192)
  const stored = await apiAs(page.context()).get('/profile/avatar/')
  expect(stored.status).toBe(200)
  await page.getByRole('button', { name: 'Remove photo' }).click()
  await expect(page.getByText('Photo removed.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Upload photo' })).toBeVisible()
})

test('a JPEG and a WebP work the same way, and something that is not a picture is refused kindly', async ({ page }) => {
  await signUpViaForm(page, uniqueEmail('photo2'))
  await page.goto('/app/profile')
  for (const [type, name] of [['image/jpeg', 'a.jpg'], ['image/webp', 'a.webp']]) {
    await page.getByLabel('Choose a photo').setInputFiles(await picture(page, { width: 800, height: 800, type, name }))
    await expect(page.getByText('Photo updated.')).toBeVisible()
  }
  await page.getByLabel('Choose a photo').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') })
  await expect(page.getByRole('alert')).toContainText('Choose an image file')
})
