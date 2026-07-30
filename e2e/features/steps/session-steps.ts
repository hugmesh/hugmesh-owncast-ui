// Session / login / navigation step definitions backing the owncast-ui
// features.
//
// Two flavours of "logged in" — the honesty split:
//   - `Given "X" signs in with a real Casdoor session` — full Casdoor
//     round-trip via login() in an ISOLATED context (the HttpOnly `bff_`
//     cookie is set server-side). REQUIRED for every scenario that performs a
//     real write or asserts a real bff response: with a real session a DENY is
//     a genuine authenticated 403, distinguishable from an anonymous 401.
//   - `Given "X" has a seeded session` — writes hug.session directly via an
//     addInitScript (no bff cookie; /bff fetches would be ANONYMOUS). Used
//     ONLY for pure client-side behaviour: guard redirects, role-aware nav,
//     a11y contracts, and form validation that never fires a request.
//
// The navigation steps assert the guard outcome: a guarded owncast child route
// either renders its view (ALLOW) or the guard redirects to /owncast/forbidden
// (DENY — NOT /login, NOT /forbidden; the host already authgated the user into
// the /owncast mount, so a denial here is a WITHIN-SERVICE privilege boundary).
// All such steps live in @cluster features today because they need the host
// shell to be serving the remote; bddgen still compiles them so `--list` proves
// they parse.

import { expect } from '@playwright/test';
import { Given, When, Then } from '../support/fixtures';
import { pageRegistry, ctxRegistry, responseState } from './_registry';
import {
  SeedUser,
  login,
  seedSession,
  clearSession,
  newE2eContext,
} from '../../tests/helpers/roles';

// ── Session priming ───────────────────────────────────────────────────────

Given('a clean session', async ({ page }) => {
  await clearSession(page);
});

Given('{string} signs in with a real Casdoor session', async ({ browser, user }, username: string) => {
  // REAL login (HttpOnly `bff_` cookie set server-side) in an ISOLATED context,
  // so several real identities can coexist in one multiuser scenario. This is
  // the honesty-rule session for every scenario that performs REAL writes or
  // asserts REAL bff responses — a seeded localStorage session carries no bff
  // cookie, so its /bff requests are anonymous and its DENY assertions would
  // pass vacuously for any user.
  const u: SeedUser = user(username);
  const ctx = await newE2eContext(browser);
  const page = await ctx.newPage();
  await login(page, u);
  ctxRegistry.set(u.username, ctx);
  pageRegistry.set(u.username, page);
});

Given('{string} has a seeded session', async ({ page, user }, username: string) => {
  const u: SeedUser = user(username);
  // addInitScript must run BEFORE the first navigation, so register the page and
  // seed; the navigation step that follows picks the session up on load.
  await seedSession(page, u);
  pageRegistry.set(u.username, page);
});

// ── Navigation ─────────────────────────────────────────────────────────────

When('{string} navigates to {string}', async ({ user }, username: string, path: string) => {
  const u: SeedUser = user(username);
  const page = pageRegistry.get(u.username);
  if (!page) throw new Error(`No page registered for "${username}" — add a session step first.`);
  await page.goto(path, { waitUntil: 'domcontentloaded' });
});

// ── Guard-outcome assertions ────────────────────────────────────────────────

Then('{string} sees the {string} view', async ({ user }, username: string, testid: string) => {
  // ALLOW: the guard passed and the view rendered. Each owncast view carries a
  // stable data-testid (e.g. owncast-stream-title, owncast-grants-title,
  // owncast-moderation-feed, owncast-forbidden-title).
  const page = pageRegistry.get(user(username).username)!;
  await expect(page.locator(`[data-testid="${testid}"]`)).toBeVisible({ timeout: 15_000 });
});

Then('{string} is sent to the owncast forbidden screen', async ({ user }, username: string) => {
  // DENY: owncastStreamGuard / owncastManageGuard / owncastModGuard returns
  // router.parseUrl('/owncast/forbidden'), so the URL settles on
  // /owncast/forbidden and the within-service privilege-boundary screen renders.
  const page = pageRegistry.get(user(username).username)!;
  await page.waitForURL(/\/owncast\/forbidden(\?|$)/, { timeout: 15_000 });
  await expect(page).toHaveURL(/\/owncast\/forbidden(\?|$)/);
  await expect(page.locator('[data-testid="owncast-forbidden-title"]')).toBeVisible();
});

Then('{string} does not see the {string} view', async ({ user }, username: string, testid: string) => {
  const page = pageRegistry.get(user(username).username)!;
  await expect(page.locator(`[data-testid="${testid}"]`)).toHaveCount(0);
});

// ── API-level cross-user / domain-scope DENY ─────────────────────────────────
// The console is display-only; the owncast-bff is the real gate. These steps
// fire a same-origin fetch with credentials so the user's HttpOnly `bff_`
// session cookie rides along (the fe-gateway turns it into the upstream Bearer
// server-side); the request thus exercises the actual owncast-bff @PreAuthorize
// + domain-scope chain, and capture the status.

When('{string} GETs {string}', async ({ user }, username: string, path: string) => {
  const page = pageRegistry.get(user(username).username)!;
  responseState.lastStatus = await page.evaluate(
    async (url) => {
      const r = await fetch(url, { credentials: 'include' });
      return r.status;
    },
    path,
  );
});

When('{string} POSTs to {string} with body:', async ({ user }, username: string, path: string, body: string) => {
  // The docstring is the real JSON request body (mirrors the openapi.json
  // request schema), so a DENY here is proven to be an AUTHORIZATION denial on
  // a request that would otherwise be valid — not a 400 validation artefact.
  const page = pageRegistry.get(user(username).username)!;
  responseState.lastStatus = await page.evaluate(
    async ([url, payload]) => {
      const r = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      });
      return r.status;
    },
    [path, body] as const,
  );
});

// ── Test-state normalisation (NOT assertions) ───────────────────────────────

Given('{string} has cleared broadcast overrides for {string}', async ({ user }, username: string, subject: string) => {
  // Lift any ACTIVE broadcast grant AND any active ban for the subject via the
  // real DELETE endpoints with the admin's REAL session cookie. The bff revoke
  // is an idempotent no-op returning 200 when nothing is active, so this pins
  // the scenario's starting point to the documented default-deny state without
  // assuming a virgin database (live clusters persist state between runs).
  const page = pageRegistry.get(user(username).username);
  if (!page) throw new Error(`No page registered for "${username}" — sign in first.`);
  const statuses = await page.evaluate(async (s) => {
    const out: number[] = [];
    for (const type of ['broadcast', 'banned']) {
      const r = await fetch(`/bff/owncast/admin/access/${type}/${encodeURIComponent(s)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      out.push(r.status);
    }
    return out;
  }, subject);
  // 200 for both per the contract (revoke of an absent override is a no-op).
  expect(statuses).toEqual([200, 200]);
});

When('{string} resets their own stream visibility to internal', async ({ user }, username: string) => {
  // Deterministic setup via the REAL visibility endpoint with the streamer's
  // own real session (a flip to INTERNAL is always allowed for the owner). The
  // scenario still proves the PUBLIC journey through the UI — this only makes
  // re-runs against a persistent cluster start from visibility=internal.
  const page = pageRegistry.get(user(username).username);
  if (!page) throw new Error(`No page registered for "${username}" — sign in first.`);
  const status = await page.evaluate(async () => {
    const r = await fetch('/bff/owncast/user/stream/visibility', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visibility: 'internal' }),
    });
    return r.status;
  });
  expect(status).toBe(200);
});

When('the unauthenticated client GETs {string}', async ({ page }, path: string) => {
  await page.goto('/');
  responseState.lastStatus = await page.evaluate(async (p) => {
    const r = await fetch(p);
    return r.status;
  }, path);
});

Then('the response status is {int}', async ({}, expected: number) => {
  expect(responseState.lastStatus).toBe(expected);
});

Then('the response status is one of {int} or {int}', async ({}, a: number, b: number) => {
  expect([a, b]).toContain(responseState.lastStatus);
});
