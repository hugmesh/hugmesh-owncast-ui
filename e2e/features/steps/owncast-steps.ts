// Owncast-specific step definitions — the role-aware console nav, the streamer's
// own-stream visibility gate (the disabled+helptext class), the grants console
// SUPERADMIN-only panels, and the moderation row controls. These assert against
// the real remote markup:
//   - owncast-console.component.html: <nav role="menubar"
//     aria-label="Owncast console"> with one `owncast-nav-<path>` link per
//     VISIBLE role item (My Stream / Broadcast grants / Moderation).
//   - owncast-stream.component.html: the public-visibility radio
//     (owncast-stream-vis-public) is [disabled]="publicDisabled() || flipping()"
//     and ALWAYS pairs with the visible owncast-stream-public-disabled-help
//     helptext when disabled (the canonical disabled+helptext gate).
//   - owncast-grants.component.html: the active-grants + history panels render
//     only when canManageAll() (SUPERADMIN).
//   - owncast-moderation.component.html: per-stream Hide/Kill/Restore controls,
//     each disabled-with-helptext when the action is a no-op.

import { expect } from '@playwright/test';
import { Then, When } from '../support/fixtures';
import { pageRegistry } from './_registry';

function pageOf(username: string) {
  const page = pageRegistry.get(username);
  if (!page) throw new Error(`No page registered for "${username}" — add a session step first.`);
  return page;
}

// ── Role-aware console nav (visibleItems by role) ────────────────────────────

Then('{string} sees the {string} nav link', async ({}, username: string, path: string) => {
  // path is one of stream | grants | moderation.
  const page = pageOf(username);
  await expect(page.locator(`[data-testid="owncast-nav-${path}"]`)).toBeVisible({ timeout: 15_000 });
});

Then('{string} does not see the {string} nav link', async ({}, username: string, path: string) => {
  const page = pageOf(username);
  await expect(page.locator(`[data-testid="owncast-nav-${path}"]`)).toHaveCount(0);
});

Then('{string} sees an empty owncast console nav', async ({}, username: string) => {
  // A user with NONE of the owncast roles: visibleItems() is empty so the whole
  // <nav> is @if'd away.
  const page = pageOf(username);
  await expect(page.locator('nav.owncast-nav')).toHaveCount(0);
});

// ── Streamer own-stream visibility — the disabled+helptext gate ──────────────

Then('{string} sees the public-visibility option disabled', async ({}, username: string) => {
  const page = pageOf(username);
  const radio = page.locator('[data-testid="owncast-stream-vis-public"]');
  await expect(radio).toBeVisible();
  // publicDisabled() drives [disabled] — a streamer with no active broadcast
  // grant cannot select public.
  await expect(radio).toBeDisabled();
});

Then('{string} sees the public-visibility option enabled', async ({}, username: string) => {
  const page = pageOf(username);
  const radio = page.locator('[data-testid="owncast-stream-vis-public"]');
  await expect(radio).toBeVisible();
  await expect(radio).toBeEnabled();
});

Then('{string} sees the broadcast-gate helptext', async ({}, username: string) => {
  // The DISABLED public option ALWAYS pairs with a VISIBLE help-text explaining
  // WHY (publicGateHelp). The radio's aria-describedby points at this id so an
  // AT reads the reason — the requirement's disabled+helptext pairing.
  const page = pageOf(username);
  const help = page.locator('[data-testid="owncast-stream-public-disabled-help"]');
  await expect(help).toBeVisible();
  await expect(await help.textContent()).toBeTruthy();
});

Then('{string} can edit their stream title', async ({}, username: string) => {
  // A streamer controls their OWN stream: the title input is present + editable.
  const page = pageOf(username);
  const input = page.locator('[data-testid="owncast-stream-title-input"]');
  await expect(input).toBeVisible();
  await expect(input).toBeEditable();
});

// ── Grants console — SUPERADMIN-only read panels ─────────────────────────────

Then('{string} sees the active-grants panel', async ({}, username: string) => {
  const page = pageOf(username);
  await expect(page.locator('[data-testid="owncast-grants-active-panel"]')).toBeVisible({ timeout: 15_000 });
});

Then('{string} does not see the active-grants panel', async ({}, username: string) => {
  // canManageAll() is false for a plain ADMIN — the list-active + history panels
  // are SUPERADMIN-only at the bff, so the console hides them (the admin still
  // grants via the action form).
  const page = pageOf(username);
  await expect(page.locator('[data-testid="owncast-grants-active-panel"]')).toHaveCount(0);
});

Then('{string} sees the grant-action form', async ({}, username: string) => {
  // Both ADMIN and SUPERADMIN see the grant/timeout/ban/restore action form.
  const page = pageOf(username);
  await expect(page.locator('[data-testid="owncast-grants-submit"]')).toBeVisible();
});

// ── Moderation row controls (the mod moderates) ──────────────────────────────

Then('{string} sees a moderation row for {string}', async ({}, username: string, owner: string) => {
  const page = pageOf(username);
  const owners = page.locator('[data-testid="owncast-moderation-owner"]');
  await expect(owners.filter({ hasText: owner })).toBeVisible({ timeout: 15_000 });
});

When('{string} hides the stream of {string}', async ({}, username: string, owner: string) => {
  const page = pageOf(username);
  const row = page.locator('[data-testid="owncast-moderation-row"]', { hasText: owner });
  await row.locator('[data-testid="owncast-moderation-hide"]').click();
});

// ═══ Multiuser lifecycle steps (real-session flows) ══════════════════════════
// Exact-text constants mirrored from the components (the UI contract):
//   owncast-stream.component.ts  — PUBLIC_GATE_HELP + '.', save/flip notices
//   owncast-moderation.component.ts — KILL_CONFIRM, per-action notices
//   owncast-grants.component.ts  — revoke notices, validation errors

const PUBLIC_GATE_ERROR =
  'You need an active broadcast grant from an admin to go public.';
const KILL_CONFIRM =
  'Kill this stream? The streamer is banned from broadcasting until restored.';

// ── My Stream: details save round-trip + visibility journey ──────────────────

When(
  '{string} sets their stream details to title {string} and description {string} and saves',
  async ({}, username: string, title: string, description: string) => {
    const page = pageOf(username);
    await page.locator('[data-testid="owncast-stream-title-input"]').fill(title);
    await page.locator('[data-testid="owncast-stream-desc-input"]').fill(description);
    await page.locator('[data-testid="owncast-stream-save"]').click();
    // The save is only "done" when the bff acknowledged the upsert (exact text).
    await expect(page.locator('[data-testid="owncast-stream-save-notice"]'))
      .toHaveText('Your stream details were saved.', { timeout: 15_000 });
  },
);

When('{string} reloads their stream console', async ({}, username: string) => {
  const page = pageOf(username);
  await page.goto('/owncast/stream', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-testid="owncast-stream-title-input"]')).toBeVisible({ timeout: 15_000 });
});

Then(
  '{string} sees stream details titled {string} with description {string}',
  async ({}, username: string, title: string, description: string) => {
    // Persistence proof: the values survived a full reload (server round-trip),
    // not just the in-memory signal state.
    const page = pageOf(username);
    await expect(page.locator('[data-testid="owncast-stream-title-input"]')).toHaveValue(title);
    await expect(page.locator('[data-testid="owncast-stream-desc-input"]')).toHaveValue(description);
  },
);

Then('{string} sees current visibility {string}', async ({}, username: string, visibility: string) => {
  const page = pageOf(username);
  await expect(page.locator('[data-testid="owncast-stream-current-visibility"]'))
    .toHaveText(visibility, { timeout: 15_000 });
});

When('{string} tries going public', async ({}, username: string) => {
  // The fail-closed probe: only rendered while the public option is disabled.
  const page = pageOf(username);
  await page.locator('[data-testid="owncast-stream-try-public"]').click();
});

When('{string} selects the public visibility option', async ({}, username: string) => {
  // Used when the radio is ENABLED (a previous flip succeeded): the click fires
  // the change handler; the OUTCOME (success notice or 403 fail-closed reset)
  // is asserted by the step that follows.
  const page = pageOf(username);
  await page.locator('[data-testid="owncast-stream-vis-public"]').click();
});

When('{string} flips visibility to internal', async ({}, username: string) => {
  const page = pageOf(username);
  await page.locator('[data-testid="owncast-stream-vis-internal"]').click();
  await expect(page.locator('[data-testid="owncast-stream-flip-notice"]'))
    .toHaveText('Your stream is now internal (visible only inside your brand).', { timeout: 15_000 });
});

Then('{string} sees the flip notice {string}', async ({}, username: string, text: string) => {
  const page = pageOf(username);
  await expect(page.locator('[data-testid="owncast-stream-flip-notice"]'))
    .toHaveText(text, { timeout: 15_000 });
});

Then('{string} sees the broadcast-denied flip error', async ({}, username: string) => {
  // The authoritative OwncastBroadcastGuard 403, surfaced with the canonical
  // gate help text (exact) — proof the deny came from the live bff guard.
  const page = pageOf(username);
  await expect(page.locator('[data-testid="owncast-stream-flip-error"]'))
    .toHaveText(PUBLIC_GATE_ERROR, { timeout: 15_000 });
});

// ── Grants console: driving the action form ──────────────────────────────────

When('{string} grants broadcast to {string}', async ({}, username: string, subject: string) => {
  const page = pageOf(username);
  await page.locator('[data-testid="owncast-grants-action-grant"]').check();
  await page.locator('[data-testid="owncast-grants-user"]').fill(subject);
  await page.locator('[data-testid="owncast-grants-submit"]').click();
});

When('{string} bans {string} from broadcast', async ({}, username: string, subject: string) => {
  const page = pageOf(username);
  await page.locator('[data-testid="owncast-grants-action-ban"]').check();
  await page.locator('[data-testid="owncast-grants-user"]').fill(subject);
  await page.locator('[data-testid="owncast-grants-submit"]').click();
});

Then('{string} sees the ban-precedence note', async ({}, username: string) => {
  const page = pageOf(username);
  await expect(page.locator('[data-testid="owncast-grants-ban-note"]')).toBeVisible();
});

Then(
  '{string} sees the applied result for {string} with type {string}',
  async ({}, username: string, subject: string, accessType: string) => {
    // The result panel echoes the bff's persisted row — user + accessType.
    const page = pageOf(username);
    const panel = page.locator('[data-testid="owncast-grants-result"]');
    await expect(panel).toBeVisible({ timeout: 15_000 });
    await expect(panel).toContainText(subject);
    await expect(panel).toContainText(accessType);
  },
);

When('{string} removes the grant from the result panel', async ({}, username: string) => {
  const page = pageOf(username);
  await page.locator('[data-testid="owncast-grants-remove"]').click();
});

When('{string} restores from the result panel', async ({}, username: string) => {
  const page = pageOf(username);
  await page.locator('[data-testid="owncast-grants-restore"]').click();
});

Then('{string} sees the grants notice {string}', async ({}, username: string, text: string) => {
  const page = pageOf(username);
  await expect(page.locator('[data-testid="owncast-grants-notice"]'))
    .toHaveText(text, { timeout: 15_000 });
});

Then('{string} sees an active-grant row for {string}', async ({}, username: string, subject: string) => {
  const page = pageOf(username);
  await expect(
    page.locator('[data-testid="owncast-grants-active-row"]').filter({ hasText: subject }).first(),
  ).toBeVisible({ timeout: 15_000 });
});

// ── Grants console: client-side validation (no request is fired) ────────────

When('{string} submits the grant form without filling the user subject', async ({}, username: string) => {
  const page = pageOf(username);
  await page.locator('[data-testid="owncast-grants-submit"]').click();
});

When(
  '{string} submits a timeout for {string} with {int} hours',
  async ({}, username: string, subject: string, hours: number) => {
    const page = pageOf(username);
    await page.locator('[data-testid="owncast-grants-action-timeout"]').check();
    await page.locator('[data-testid="owncast-grants-user"]').fill(subject);
    await page.locator('[data-testid="owncast-grants-ttl"]').fill(String(hours));
    await page.locator('[data-testid="owncast-grants-submit"]').click();
  },
);

Then('{string} sees the user-subject validation error', async ({}, username: string) => {
  const page = pageOf(username);
  await expect(page.locator('#owncast-grants-user-err')).toHaveText('A user subject is required.');
  await expect(page.locator('[data-testid="owncast-grants-user"]')).toHaveAttribute('aria-invalid', 'true');
});

Then('{string} sees the timeout-hours validation error', async ({}, username: string) => {
  const page = pageOf(username);
  await expect(page.locator('#owncast-grants-ttl-err')).toHaveText('Enter a positive number of hours.');
  await expect(page.locator('[data-testid="owncast-grants-ttl"]')).toHaveAttribute('aria-invalid', 'true');
});

Then('{string} sees no applied result panel', async ({}, username: string) => {
  // Ordered AFTER a visible validation-error assertion in the feature, so the
  // absence check runs against a settled view rather than passing vacuously.
  const page = pageOf(username);
  await expect(page.locator('[data-testid="owncast-grants-result"]')).toHaveCount(0);
});

// ── Grants console: superadmin history (audit trail) ─────────────────────────

When('{string} looks up the grant history for {string}', async ({}, username: string, subject: string) => {
  const page = pageOf(username);
  await page.locator('[data-testid="owncast-grants-history-user"]').fill(subject);
  await page.locator('[data-testid="owncast-grants-history-load"]').click();
});

Then(
  '{string} sees a history row of type {string} in state {string}',
  async ({}, username: string, accessType: string, state: string) => {
    const page = pageOf(username);
    const rows = page.locator('.owncast-grants__history tbody tr');
    await expect(
      rows.filter({ hasText: accessType }).filter({ hasText: state }).first(),
    ).toBeVisible({ timeout: 15_000 });
  },
);

// ── Moderation: kill (confirm-gated), restore, row-state assertions ──────────

When(
  '{string} kills the stream of {string} accepting the confirm dialog',
  async ({}, username: string, owner: string) => {
    const page = pageOf(username);
    const row = page.locator('[data-testid="owncast-moderation-row"]', { hasText: owner });
    // Register the dialog listener BEFORE the click — window.confirm blocks the
    // page until the dialog is handled. The message is asserted EXACTLY against
    // the component's KILL_CONFIRM constant, then accepted.
    const dialogPromise = page.waitForEvent('dialog');
    const clicked = row.locator('[data-testid="owncast-moderation-kill"]').click();
    const dialog = await dialogPromise;
    expect(dialog.type()).toBe('confirm');
    expect(dialog.message()).toBe(KILL_CONFIRM);
    await dialog.accept();
    await clicked;
  },
);

When(
  '{string} starts killing the stream of {string} but dismisses the confirm dialog',
  async ({}, username: string, owner: string) => {
    const page = pageOf(username);
    const row = page.locator('[data-testid="owncast-moderation-row"]', { hasText: owner });
    const dialogPromise = page.waitForEvent('dialog');
    const clicked = row.locator('[data-testid="owncast-moderation-kill"]').click();
    const dialog = await dialogPromise;
    expect(dialog.type()).toBe('confirm');
    expect(dialog.message()).toBe(KILL_CONFIRM);
    await dialog.dismiss();
    await clicked;
  },
);

When('{string} restores the stream of {string}', async ({}, username: string, owner: string) => {
  const page = pageOf(username);
  const row = page.locator('[data-testid="owncast-moderation-row"]', { hasText: owner });
  await row.locator('[data-testid="owncast-moderation-restore"]').click();
});

Then('{string} sees the moderation notice {string}', async ({}, username: string, text: string) => {
  const page = pageOf(username);
  await expect(page.locator('[data-testid="owncast-moderation-notice"]'))
    .toHaveText(text, { timeout: 15_000 });
});

Then('{string} sees no moderation notice', async ({}, username: string) => {
  // Ordered AFTER a positive row-state assertion in the feature so the view is
  // settled — a dismissed confirm must have fired NO action.
  const page = pageOf(username);
  await expect(page.locator('[data-testid="owncast-moderation-notice"]')).toHaveCount(0);
});

Then('{string} does not see a moderation row for {string}', async ({}, username: string, owner: string) => {
  // Only meaningful AFTER the same scenario asserted a PRESENT row (proving the
  // list finished loading) AND created the absent owner's stream in the other
  // brand — victim-creates-first turns this into a real scoping proof.
  const page = pageOf(username);
  await expect(
    page.locator('[data-testid="owncast-moderation-owner"]').filter({ hasText: owner }),
  ).toHaveCount(0);
});

Then(
  '{string} sees the moderation row visibility {string} for {string}',
  async ({}, username: string, visibility: string, owner: string) => {
    const page = pageOf(username);
    const row = page.locator('[data-testid="owncast-moderation-row"]', { hasText: owner });
    await expect(row.locator('[data-testid="owncast-moderation-visibility"]'))
      .toHaveText(visibility, { timeout: 15_000 });
  },
);

Then('{string} sees the banned badge on the row for {string}', async ({}, username: string, owner: string) => {
  const page = pageOf(username);
  const row = page.locator('[data-testid="owncast-moderation-row"]', { hasText: owner });
  await expect(row.locator('[data-testid="owncast-moderation-banned-badge"]'))
    .toHaveText('Banned', { timeout: 15_000 });
});

Then('{string} sees the active badge on the row for {string}', async ({}, username: string, owner: string) => {
  const page = pageOf(username);
  const row = page.locator('[data-testid="owncast-moderation-row"]', { hasText: owner });
  await expect(row.locator('[data-testid="owncast-moderation-ok-badge"]'))
    .toHaveText('Active', { timeout: 15_000 });
});

Then(
  '{string} sees the kill action disabled with helptext on the row for {string}',
  async ({}, username: string, owner: string) => {
    // The disabled control ALWAYS pairs with a visible reason (exact text) —
    // the platform disabled+helptext rule.
    const page = pageOf(username);
    const row = page.locator('[data-testid="owncast-moderation-row"]', { hasText: owner });
    await expect(row.locator('[data-testid="owncast-moderation-kill"]')).toBeDisabled();
    await expect(row.locator('[data-testid="owncast-moderation-kill-help"]')).toHaveText('Already banned');
  },
);

Then(
  '{string} sees the hide action disabled with helptext on the row for {string}',
  async ({}, username: string, owner: string) => {
    const page = pageOf(username);
    const row = page.locator('[data-testid="owncast-moderation-row"]', { hasText: owner });
    await expect(row.locator('[data-testid="owncast-moderation-hide"]')).toBeDisabled();
    await expect(row.locator('[data-testid="owncast-moderation-hide-help"]')).toHaveText('Already private');
  },
);

Then('{string} sees the restore action on the row for {string}', async ({}, username: string, owner: string) => {
  const page = pageOf(username);
  const row = page.locator('[data-testid="owncast-moderation-row"]', { hasText: owner });
  const restore = row.locator('[data-testid="owncast-moderation-restore"]');
  await expect(restore).toBeVisible({ timeout: 15_000 });
  await expect(restore).toBeEnabled();
});
