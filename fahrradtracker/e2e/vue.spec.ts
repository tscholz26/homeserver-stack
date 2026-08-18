import { test, expect } from '@playwright/test'

// Ohne Sitzung liegt der Auswahlschirm über allem – das ist der erste
// Eindruck, den die App macht, und damit das, was hier geprüft wird.
// See here how to get started:
// https://playwright.dev/docs/intro
test('visits the app root url', async ({ page }) => {
  await page.goto('/fahrrad/')
  await expect(page.locator('h1').last()).toHaveText('Wer nutzt gerade?')
})
