import { expect, test } from '@playwright/test'

// A lead of its own, so the test passes against any existing data (e.g. a dev server already running).
const name = `E2E Customer ${Date.now()}`

test('a website lead arrives live, is followed up, and the follow-up survives a reload', async ({ page, request }) => {
  await page.goto('/leads')
  await expect(page.getByText('Live', { exact: true })).toBeVisible()

  // AC-5.1: the website posts a lead; it appears without a reload, through the proxy and SSE.
  const created = await request.post('/api/leads', {
    data: {
      customer: { name, email: 'e2e@example.com', phone: '07700 900999' },
      enquiryType: 'test_drive',
      message: 'Can I test drive this on Saturday?',
      vehicle: null,
    },
  })
  expect(created.status()).toBe(201)
  const awaiting = page.getByRole('region', { name: /^Awaiting response/ })
  const row = awaiting.getByRole('link', { name: new RegExp(name) })
  await expect(row).toBeVisible({ timeout: 2_000 })

  // Open it and log a call.
  await row.click()
  await expect(page).toHaveURL(/\/leads\/[0-9a-f-]{36}$/)
  const leadUrl = page.url()
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible()
  await page.getByLabel('Summary').fill('Called, booked a test drive for Saturday 10:00.')
  await page.getByRole('button', { name: 'Log activity' }).click()
  const entry = page.getByRole('list', { name: 'Activity log' }).getByRole('listitem').filter({
    hasText: 'Called, booked a test drive for Saturday 10:00.',
  })
  await expect(entry).not.toContainText('Saving…')

  // AC-3.2 and AC-4.6: the deep link reloads to the same lead, with the follow-up persisted.
  await page.goto(leadUrl)
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible()
  await expect(entry).toContainText('by Anna Clarke')
  await expect(page.getByRole('article').getByText(/Responded in/)).toBeVisible()
  await expect(
    page.getByRole('region', { name: /^Contacted/ }).getByRole('link', { name: new RegExp(name) }),
  ).toBeVisible()
})
