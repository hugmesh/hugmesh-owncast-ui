import { TestBed } from '@angular/core/testing';
import { Route, Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { OWNCAST_ROUTES } from './owncast.routes';
import { routes as DEV_SHELL_ROUTES } from './app.routes';
import { OwncastModerationComponent } from './owncast-moderation.component';
import { owncastModGuard, owncastStreamGuard } from './owncast.guard';
import { AvatarCamComponent } from './avatar-cam/avatar-cam.component';
import { OwncastService } from './owncast.service';
import { SnapSession } from './session.service';

/**
 * Route wiring — pins that the moderation VIEW stays behind the existing
 * owncastModGuard (MODERATE = MOD|ADMIN|SUPERADMIN). The bff /bff/owncast/mod/**
 * is the authority; this guard is defence-in-depth and must not be weakened.
 */
describe('OWNCAST_ROUTES (moderation role gating)', () => {
  function child(path: string): Route {
    const shell = OWNCAST_ROUTES[0];
    const r = (shell.children ?? []).find((c) => c.path === path);
    expect(r).withContext(`route ${path} exists`).toBeDefined();
    return r!;
  }

  it('mounts the avatar cam behind owncastStreamGuard, exactly like My Stream', () => {
    const cam = child('avatar-cam');
    expect(cam.component).toBe(AvatarCamComponent);
    expect(cam.canActivate).toContain(owncastStreamGuard);
    expect(cam.canActivate).not.toContain(owncastModGuard);
  });

  it('mounts the moderation view behind owncastModGuard', () => {
    const mod = child('moderation');
    expect(mod.component).toBe(OwncastModerationComponent);
    expect(mod.canActivate).toContain(owncastModGuard);
  });
});

/**
 * The bare /owncast landing, driven through the REAL router + the REAL
 * SessionService (the session is seeded under hug.session exactly as the
 * login-ui writes it). The landing must open the first view the role can use —
 * stream, else grants, else moderation — and show the forbidden screen only
 * when none applies.
 *
 * Regression: the landing was a static redirectTo 'stream'. An admin or
 * superadmin WITHOUT the bare 'owncast' role (and the mesh operator, whose
 * live session carries admin+superadmin+mod but no 'owncast') was sent to
 * stream, denied by owncastStreamGuard and shown "You don't have access to
 * this view" on clicking Owncast. The role sets below are the live sessions
 * the 2026-11-11 GUI retest recorded.
 */
describe('OWNCAST_ROUTES bare /owncast landing (first reachable view)', () => {
  const KEY = 'hug.session';

  function seed(roles: string[]): void {
    const s: SnapSession = {
      id: 'google:landing@example.test', label: 'landing@example.test', provider: 'google',
      roles, registrationComplete: true,
    };
    localStorage.setItem(KEY, JSON.stringify(s));
  }

  /** Every OwncastService call stays pending: the landing test is about WHERE the
   *  router lands, not what a view loads, and no request may leave the test. */
  const pendingOwncast = new Proxy({}, { get: () => () => new Promise(() => undefined) });

  async function land(roles: string[], url = '/owncast'): Promise<{ url: string; forbidden: boolean }> {
    seed(roles);
    TestBed.configureTestingModule({
      providers: [
        provideRouter(DEV_SHELL_ROUTES),
        { provide: OwncastService, useValue: pendingOwncast },
      ],
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    const root = harness.routeNativeElement as HTMLElement;
    return {
      url: TestBed.inject(Router).url,
      forbidden: !!root.querySelector('[data-testid="owncast-forbidden-title"]'),
    };
  }

  afterEach(() => localStorage.removeItem(KEY));

  it('an ADMIN without the streamer role lands on Broadcast grants, not the forbidden screen', async () => {
    const r = await land(['admin', 'user']);
    expect(r.url).toBe('/owncast/grants');
    expect(r.forbidden).withContext('forbidden screen rendered').toBeFalse();
  });

  it('a SUPERADMIN without the streamer role lands on Broadcast grants', async () => {
    const r = await land(['superadmin']);
    expect(r.url).toBe('/owncast/grants');
    expect(r.forbidden).toBeFalse();
  });

  it('the mesh operator (admin+superadmin+mod, no owncast role) lands on Broadcast grants', async () => {
    const r = await land(['admin', 'fleet_admin', 'forum', 'games', 'games_admin', 'mastodon',
      'matrix', 'mod', 'superadmin', 'user', 'wiki']);
    expect(r.url).toBe('/owncast/grants');
    expect(r.forbidden).toBeFalse();
  });

  it('a MOD without the streamer role lands on Moderation', async () => {
    const r = await land(['mod']);
    expect(r.url).toBe('/owncast/moderation');
    expect(r.forbidden).toBeFalse();
  });

  it('a streamer who is also an admin still lands on My Stream (stream comes first)', async () => {
    const r = await land(['user', 'owncast', 'admin']);
    expect(r.url).toBe('/owncast/stream');
    expect(r.forbidden).toBeFalse();
  });

  it('a plain USER with no owncast-console role still gets the forbidden screen', async () => {
    const r = await land(['user']);
    expect(r.url).toBe('/owncast/forbidden');
    expect(r.forbidden).toBeTrue();
  });

  it('the avatar cam stays a streamer-only view: an admin without the role is denied (unchanged)', async () => {
    const r = await land(['admin', 'user'], '/owncast/avatar-cam');
    expect(r.url).toBe('/owncast/forbidden');
    expect(r.forbidden).toBeTrue();
  });
});
