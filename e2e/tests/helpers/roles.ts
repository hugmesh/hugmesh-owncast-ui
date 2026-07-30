import { Browser, BrowserContext, Page } from '@playwright/test';

/**
 * Catalogue of Casdoor seed users for the owncast-ui e2e matrix. Adapted from
 * the proven hugmesh.games/e2e helper, but keyed to THIS app's session model:
 * the owncast-ui (and its host) persist a {@link SnapSession} under the
 * `hug.session` localStorage key (see src/app/session.service.ts), whose
 * `roles: string[]` drives every guard — owncastStreamGuard, owncastManageGuard,
 * owncastModGuard — via the lowercased, reserved-prefix-stripped role flags
 * canStream / canManage / canManageAll / canModerate.
 *
 * The owncast remote is the OPTIONAL streaming service's UI half, so the
 * catalogue exercises the THREE coverage classes the wave demands:
 *   - USER-SITUATIONAL  — each owncast view, ALLOW + DENY-to-forbidden, plus the
 *                         streamer's disabled+helptext public-visibility gate.
 *   - MULTIUSER         — an admin grants a streamer broadcast; a mod moderates.
 *   - CROSS-USER        — a domain-A admin DENIED on a domain-B streamer (server
 *                         domain-scope), and a plain streamer DENIED on the
 *                         grants/moderation consoles.
 *
 * The owncast role model (mirrors hugmesh-owncast-bff-api SecurityConfig):
 *   STREAM   = ROLE_OWNCAST              → the streamer's OWN "My Stream" console.
 *   MANAGE   = ADMIN | SUPERADMIN        → the Broadcast Grants console.
 *   MANAGE-ALL = SUPERADMIN              → list-active + history read panels.
 *   MODERATE = MOD | ADMIN | SUPERADMIN  → the moderation view.
 *
 * NOTE the platform quirk encoded in session.service.ts: a SUPERADMIN does NOT
 * automatically carry the bare 'owncast' role, so a superadmin WITHOUT 'owncast'
 * cannot reach "My Stream" (canStream is hasOwncastRole only). The seed users
 * model that explicitly.
 *
 * Passwords default to `process.env.E2E_PASSWORD` (or `e2e-pass`) unless a
 * per-user override env var is exported.
 */
export type RoleKind = 'streamer' | 'mod' | 'admin' | 'superadmin' | 'user';

export interface SeedUser {
  /** CLI-friendly username referenced from .feature lines. */
  username: string;
  /** env var the compose overlay routes the cred through. */
  passwordEnv: string;
  /** Identity provider — owncast-ui sessions are google- or discord-backed. */
  provider: 'google' | 'discord';
  /** The lowercased Casdoor roles this user carries in `hug.session.roles`. */
  roles: string[];
  /** Drives role-specific assertions. */
  kind: RoleKind;
  /** Brand/domain this user belongs to — used by the cross-domain DENY specs. */
  domain?: string;
}

export const SEED_USERS: SeedUser[] = [
  // ── Plain streamer — ROLE_OWNCAST only. Sees ONLY "My Stream"; the grants and
  //    moderation guards send them to /owncast/forbidden. Their public-visibility
  //    radio is DISABLED with helptext until an admin grants broadcast.
  { username: 'streamer-a', passwordEnv: 'E2E_STREAMER_A_PASSWORD', provider: 'google', roles: ['user', 'owncast'], kind: 'streamer', domain: 'domain-a' },
  // A second streamer in a DIFFERENT brand — the cross-domain isolation target.
  { username: 'streamer-b', passwordEnv: 'E2E_STREAMER_B_PASSWORD', provider: 'discord', roles: ['user', 'owncast'], kind: 'streamer', domain: 'domain-b' },

  // ── Mod — MODERATE (mod). Sees Moderation; the grants guard forbids them; and
  //    WITHOUT 'owncast' the My-Stream guard forbids them too (mods aren't
  //    automatically streamers). Their moderation actions are domain-scoped.
  { username: 'mod-a', passwordEnv: 'E2E_MOD_A_PASSWORD', provider: 'google', roles: ['user', 'mod'], kind: 'mod', domain: 'domain-a' },

  // ── Domain admins — MANAGE (admin) + MODERATE (admin inherits). admin-domain-a
  //    governs ONLY brand A; the cross-user isolation scenario asserts a domain-B
  //    streamer's grant is out of A's reach at the bff. Admin carries 'owncast'
  //    too so they have their own stream surface.
  { username: 'admin-domain-a', passwordEnv: 'E2E_ADMIN_A_PASSWORD', provider: 'google',  roles: ['user', 'owncast', 'admin'], kind: 'admin', domain: 'domain-a' },
  { username: 'admin-domain-b', passwordEnv: 'E2E_ADMIN_B_PASSWORD', provider: 'discord', roles: ['user', 'owncast', 'admin'], kind: 'admin', domain: 'domain-b' },

  // ── Superadmin — MANAGE-ALL (the list-active + history SUPERADMIN read
  //    panels) + cross-domain. Carries 'owncast' here so the superadmin also has
  //    a My-Stream surface; canManageAll is the superadmin-only gate.
  { username: 'superadmin', passwordEnv: 'E2E_SUPERADMIN_PASSWORD', provider: 'google', roles: ['user', 'owncast', 'superadmin'], kind: 'superadmin' },

  // ── Plain user — no owncast role at all. Even though the host let them reach
  //    the /owncast mount, EVERY child guard forbids them: the default route's
  //    stream-guard sends them to /owncast/forbidden. The floor of the DENY
  //    matrix and the "feature greyed-out / no access" surface.
  { username: 'plain-user', passwordEnv: 'E2E_USER_PASSWORD', provider: 'google', roles: ['user'], kind: 'user', domain: 'domain-a' },
];

/** Resolve a seed user's password — env override or `E2E_PASSWORD` fallback —
 *  without throwing on a missing env. */
export function passwordFor(user: SeedUser): string {
  return process.env[user.passwordEnv]
    ?? process.env['E2E_PASSWORD']
    ?? 'e2e-pass';
}

/**
 * Create a fresh browser context that trusts the e2e self-signed cert AND uses
 * the same baseURL as the playwright config. The default `browser.newContext()`
 * does NOT inherit project-level `use` options (Playwright design choice), so a
 * spec that opens a manual context misses `ignoreHTTPSErrors: true` and every
 * HTTPS request fails the cert check — the native-federation manifest fetch is
 * the first casualty. Specs that need multiple users in parallel (the cross-user
 * isolation matrix) MUST call this instead of `browser.newContext()`.
 */
export async function newE2eContext(browser: Browser): Promise<BrowserContext> {
  return await browser.newContext({
    ignoreHTTPSErrors: true,
    baseURL: process.env.E2E_BASE_URL ?? 'https://host.docker.internal:8443',
  });
}

/**
 * Drive the federated login form and wait for `hug.session` in localStorage.
 *
 * @cluster-only — this helper hits a LIVE Casdoor + host shell, so it is only
 * exercised by scenarios tagged `@cluster` today (wave 2b ships dark). It is
 * written now so a later wave can un-skip a feature without rewriting steps.
 *
 * The owncast-ui's host shell renders the login micro-frontend; on success the
 * SessionService writes `hug.session` (see set()/broadcast()) and the bff sets
 * the HttpOnly `bff_` session cookie via Set-Cookie. We wait for the
 * `hug.session` key to carry the (non-secret) identity so a follow-up guarded
 * navigation doesn't race the write.
 */
export async function login(page: Page, user: SeedUser): Promise<void> {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  // The login remote exposes its form via formControlName selectors (the public
  // selector contract shared across the HugMesh UIs).
  await page.locator('input[formControlName="username"]').waitFor({ state: 'visible', timeout: 15_000 });
  await page.fill('input[formControlName="username"]', user.username);
  await page.fill('input[formControlName="password"]', passwordFor(user));
  await page.click('button.login-btn');
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 60_000 });
  await page.waitForFunction(
    () => {
      const raw = window.localStorage.getItem('hug.session');
      if (!raw) return false;
      try {
        return Boolean(JSON.parse(raw).id);
      } catch {
        return false;
      }
    },
    undefined,
    { timeout: 15_000 },
  );
}

/**
 * Seed a {@link SnapSession} directly into localStorage WITHOUT a Casdoor round
 * trip. Mirrors the shape SessionService.set() writes, so guards reading the
 * `roles` array behave exactly as in production. Used by the offline/dark
 * scenarios that assert pure client-side guard behaviour (forbidden redirect,
 * role-aware nav, skip-link focus, disabled+helptext) without needing the BFF.
 * No browser bearer is seeded — /bff/* is authenticated by the HttpOnly `bff_`
 * cookie (set server-side on a real login), so the dark/offline scenarios that
 * use this helper exercise pure client-side guard behaviour only.
 */
export async function seedSession(page: Page, user: SeedUser): Promise<void> {
  const session = {
    id: `${user.provider}:${user.username}@example.test`,
    label: user.username,
    provider: user.provider,
    roles: user.roles,
    registrationComplete: true,
  };
  await page.addInitScript(
    ([key, value]) => {
      window.localStorage.setItem(key, value);
    },
    ['hug.session', JSON.stringify(session)] as const,
  );
}

/** Clear the session — used between role swaps so a stale identity doesn't carry
 *  into the next scenario's guard check. */
export async function clearSession(page: Page): Promise<void> {
  await page.evaluate(() => window.localStorage.removeItem('hug.session'));
}
