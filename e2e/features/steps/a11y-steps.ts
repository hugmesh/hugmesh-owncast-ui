// Accessibility step definitions. The owncast-ui carries the org a11y standard
// (skip-link, aria landmarks, role="menubar" with roving tabindex on the console
// nav, focus target on main). These steps assert those contracts against the
// real remote markup:
//   - app.component.html renders `<a class="skip" href="#owncast-main">` →
//     `<main id="owncast-main" tabindex="-1">` (the skip-link + focus target).
//   - owncast-console.component.html renders the role-aware nav as
//     `<nav class="owncast-nav" role="menubar" aria-label="Owncast console">`
//     with `a.owncast-nav__item[role=menuitem]` items carrying a roving tabindex
//     (only the active item is tabindex=0; the rest are -1) and Arrow-key nav.

import { expect } from '@playwright/test';
import { Then, When } from '../support/fixtures';
import { pageRegistry } from './_registry';

function pageOf(username: string) {
  const page = pageRegistry.get(username);
  if (!page) throw new Error(`No page registered for "${username}" — add a session step first.`);
  return page;
}

// ── Skip-link ────────────────────────────────────────────────────────────────

Then('{string} can tab to the skip link', async ({}, username: string) => {
  const page = pageOf(username);
  await page.keyboard.press('Tab');
  const skip = page.locator('a.skip');
  await expect(skip).toBeFocused();
  await expect(skip).toHaveAttribute('href', '#owncast-main');
});

// NOTE on fixtures: the parameterless steps below act on the scenario's default
// `page` fixture (the page the preceding seeded-session step drove). They used
// to declare a phantom `username` argument their patterns never captured —
// playwright-bdd 8 tolerated the arity mismatch silently and the steps would
// have thrown `pageOf(undefined)` at runtime; playwright-bdd 9 rejects them at
// bddgen time, which is how the bug surfaced.

Then('activating the skip link moves focus to the main region', async ({ page }) => {
  await page.locator('a.skip').press('Enter');
  const main = page.locator('main#owncast-main');
  await expect(main).toBeFocused();
  // The skip target must be programmatically focusable without being a tab stop.
  await expect(main).toHaveAttribute('tabindex', '-1');
});

// ── ARIA landmarks / labels ──────────────────────────────────────────────────

Then('the owncast console nav has an accessible name', async ({ page }) => {
  const nav = page.locator('nav.owncast-nav[aria-label="Owncast console"]');
  await expect(nav).toBeVisible();
  await expect(nav).toHaveAttribute('role', 'menubar');
});

Then('each owncast nav link has an accessible name', async ({ page }) => {
  const links = page.locator('nav.owncast-nav a.owncast-nav__item');
  const count = await links.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    const aria = await links.nth(i).getAttribute('aria-label');
    expect(aria && aria.trim().length > 0).toBe(true);
  }
});

Then('the {string} view has an accessible name', async ({ page }, testid: string) => {
  const view = page.locator(`[data-testid="${testid}"]`);
  // The view region must be rendered before its labelling is judged — without
  // this, getAttribute on a missing element would fail with a bare timeout.
  await expect(view).toBeVisible({ timeout: 15_000 });
  // Each view root is aria-labelledby a heading (or has an explicit aria-label) —
  // assert one of the two is present so assistive tech can name the region.
  const labelledby = await view.getAttribute('aria-labelledby');
  const ariaLabel = await view.getAttribute('aria-label');
  expect(Boolean(labelledby) || Boolean(ariaLabel)).toBe(true);
});

Then('the owncast forbidden screen announces the denial', async ({ page }) => {
  const screen = page.locator('section.owncast-forbidden');
  await expect(screen).toBeVisible();
  // role="alert" → the within-service privilege-boundary is announced, and an
  // aria-labelledby names it.
  await expect(screen).toHaveAttribute('role', 'alert');
  await expect(screen).toHaveAttribute('aria-labelledby', 'owncast-forbidden-title');
});

// ── Roving tabindex on the console menubar ───────────────────────────────────

When('{string} focuses the first owncast nav link', async ({}, username: string) => {
  const page = pageOf(username);
  await page.locator('nav.owncast-nav a.owncast-nav__item').first().focus();
});

Then('arrow-key navigation moves focus along the owncast nav links', async ({ page }) => {
  const links = page.locator('nav.owncast-nav a.owncast-nav__item');
  await expect(links.first()).toBeFocused();
  await page.keyboard.press('ArrowDown');
  // Roving tabindex: focus advances to the next menuitem without leaving the
  // menubar (owncast-console.component.ts onKey()).
  await expect(links.nth(1)).toBeFocused();
});

Then('only the active owncast nav link is in the tab order', async ({ page }) => {
  const links = page.locator('nav.owncast-nav a.owncast-nav__item');
  const count = await links.count();
  expect(count).toBeGreaterThan(0);
  // Exactly one item carries tabindex=0 (the WAI-ARIA menubar roving pattern);
  // every other is -1.
  let tabbable = 0;
  for (let i = 0; i < count; i++) {
    if ((await links.nth(i).getAttribute('tabindex')) === '0') tabbable += 1;
  }
  expect(tabbable).toBe(1);
});

// ── Focus restoration after a route change ───────────────────────────────────

Then('focus is restored to the main region after navigation', async ({ page }) => {
  await expect(page.locator('main#owncast-main')).toBeFocused();
});
