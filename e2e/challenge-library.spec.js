import { expect, expectNoHorizontalScroll, test } from './support/fixtures.js'

// The challenge library in a real browser (Chromium, desktop and phone width): 26 sample challenges, the new categories, the detail
// pages, the dark theme and the Hindi titles. These are public pages and need no API.
test.use({ signedIn: false })

// The theme and language switches sit in the header on a desktop and in the menu on a phone.
async function press(page, name) {
  const wide = page.viewportSize().width >= 1260 // the header's "nav" breakpoint
  if (!wide) await page.getByRole('button', { name: 'Open menu' }).click()
  await page.getByRole('button', { name, exact: true }).click()
  if (!wide) await page.keyboard.press('Escape') // the button's name changes with the language
}

test.describe('Challenge library', () => {
  test('shows all 26 sample challenges and fits the screen', async ({ page }) => {
    await page.goto('/challenges')
    await expect(page.getByText('Showing 26 of 26 sample challenges')).toBeVisible()
    await expect(page.getByRole('article')).toHaveCount(26)
    await expect(page.getByRole('heading', { name: 'GitHub Green Week' })).toBeVisible()
    await expectNoHorizontalScroll(page)
  })

  test('the new categories filter the library', async ({ page }) => {
    await page.goto('/challenges')
    await page.getByRole('combobox', { name: 'Category' }).click()
    await page.getByRole('option', { name: 'Exam preparation' }).click()
    await expect(page.getByText('Showing 4 of 26 sample challenges')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Daily MCQ Mastery' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Morning movement' })).toHaveCount(0)
    await page.getByRole('combobox', { name: 'Category' }).click()
    await page.getByRole('option', { name: 'Developers & tech' }).click()
    await expect(page.getByText('Showing 4 of 26 sample challenges')).toBeVisible()
    await page.getByRole('button', { name: 'Clear filters' }).first().click()
    await expect(page.getByText('Showing 26 of 26 sample challenges')).toBeVisible()
  })

  test('a challenge’s page shows what people will do, and joining is still a labelled prototype', async ({ page }) => {
    await page.goto('/challenges')
    await page.getByRole('link', { name: 'View details: Move Every Day' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Move Every Day' })).toBeVisible()
    await expect(page.getByText(/talk to a health professional/i)).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Habits and goals' })).toBeVisible()
    await expect(page.getByText('Choose today’s level')).toBeVisible()
    await expect(page.getByText('One credit per day you move at a level you chose.')).toBeVisible()
    await page.getByRole('button', { name: 'Join challenge' }).click()
    await expect(page.getByText(/not actually enrolled/i)).toBeVisible()
    await expectNoHorizontalScroll(page)
  })

  test('works in the dark theme without overflow', async ({ page }) => {
    await page.goto('/challenges')
    await press(page, 'Switch to dark theme')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect(page.getByRole('article')).toHaveCount(26)
    await expectNoHorizontalScroll(page)
    await page.goto('/challenges/gym-consistency')
    await expect(page.getByRole('heading', { level: 1, name: 'Gym Consistency Challenge' })).toBeVisible()
    await expectNoHorizontalScroll(page)
  })

  test('shows the new titles and summaries in Hindi', async ({ page }) => {
    await page.goto('/challenges')
    await press(page, 'हिन्दी')
    await expect(page.getByRole('heading', { name: 'गिटहब ग्रीन वीक' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'रोज़ MCQ में महारत' })).toBeVisible()
    await expect(page.getByText('दो हफ़्तों में छोटे-छोटे पड़ावों के ज़रिए एक छोटे आइडिया को चलते हुए प्रोजेक्ट में बदलें।')).toBeVisible()
    await expect(page.getByRole('article')).toHaveCount(26)
    await expectNoHorizontalScroll(page)
  })
})
