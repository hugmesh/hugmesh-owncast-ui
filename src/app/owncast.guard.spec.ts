import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import {
  owncastStreamGuard,
  owncastManageGuard,
  owncastModGuard,
  owncastLandingView,
  OWNCAST_FORBIDDEN,
} from './owncast.guard';
import { SessionService } from './session.service';

type Caps = Pick<SessionService, 'canStream' | 'canManage' | 'canModerate'>;

/**
 * Guard tests — the per-view role boundary. For EACH guard, an ALLOW path and a
 * DENY path, and the DENY target is asserted to be the IN-REMOTE mount-path
 * '/owncast/forbidden' (NOT '/forbidden', NOT '/login') — the critical
 * correctness lesson the template carries.
 */
describe('owncast guards (per-view role gating)', () => {
  let session: jasmine.SpyObj<Caps>;
  let parseUrlSpy: jasmine.Spy;

  beforeEach(() => {
    session = jasmine.createSpyObj<Caps>('SessionService', ['canStream', 'canManage', 'canModerate']);
    parseUrlSpy = jasmine.createSpy('parseUrl').and.callFake((u: string) => ({ url: u } as unknown as UrlTree));
    TestBed.configureTestingModule({
      providers: [
        { provide: SessionService, useValue: session },
        { provide: Router, useValue: { parseUrl: parseUrlSpy } },
      ],
    });
  });

  function run(guard: typeof owncastStreamGuard) {
    return TestBed.runInInjectionContext(() => guard(null as never, null as never));
  }

  it('the forbidden target is the in-remote mount path (NOT /forbidden, NOT /login)', () => {
    expect(OWNCAST_FORBIDDEN).toBe('/owncast/forbidden');
  });

  describe('owncastStreamGuard (STREAM = ROLE_OWNCAST)', () => {
    it('ALLOWS a streamer (canStream)', () => {
      session.canStream.and.returnValue(true);
      expect(run(owncastStreamGuard)).toBeTrue();
      expect(parseUrlSpy).not.toHaveBeenCalled();
    });
    it('DENIES a plain USER → /owncast/forbidden', () => {
      session.canStream.and.returnValue(false);
      const r = run(owncastStreamGuard) as UrlTree;
      expect((r as unknown as { url: string }).url).toBe('/owncast/forbidden');
      expect(parseUrlSpy).toHaveBeenCalledWith('/owncast/forbidden');
    });
  });

  describe('owncastManageGuard (MANAGE = ADMIN | SUPERADMIN)', () => {
    it('ALLOWS an admin/superadmin (canManage)', () => {
      session.canManage.and.returnValue(true);
      expect(run(owncastManageGuard)).toBeTrue();
    });
    it('DENIES a streamer/mod (not canManage) → /owncast/forbidden', () => {
      session.canManage.and.returnValue(false);
      const r = run(owncastManageGuard) as UrlTree;
      expect((r as unknown as { url: string }).url).toBe('/owncast/forbidden');
      expect(parseUrlSpy).toHaveBeenCalledWith('/owncast/forbidden');
    });
  });

  describe('owncastModGuard (MODERATE = MOD | ADMIN | SUPERADMIN)', () => {
    it('ALLOWS a mod/admin/superadmin (canModerate)', () => {
      session.canModerate.and.returnValue(true);
      expect(run(owncastModGuard)).toBeTrue();
    });
    it('DENIES a plain streamer (not canModerate) → /owncast/forbidden', () => {
      session.canModerate.and.returnValue(false);
      const r = run(owncastModGuard) as UrlTree;
      expect((r as unknown as { url: string }).url).toBe('/owncast/forbidden');
      expect(parseUrlSpy).toHaveBeenCalledWith('/owncast/forbidden');
    });
  });

  describe('owncastLandingView (where a bare /owncast lands)', () => {
    function caps(stream: boolean, manage: boolean, moderate: boolean) {
      return { canStream: () => stream, canManage: () => manage, canModerate: () => moderate } as unknown as Caps;
    }

    it('a streamer lands on stream, whatever else they hold', () => {
      expect(owncastLandingView(caps(true, false, false))).toBe('stream');
      expect(owncastLandingView(caps(true, true, true))).toBe('stream');
    });
    it('an admin/superadmin WITHOUT the streamer role lands on grants (not stream → forbidden)', () => {
      expect(owncastLandingView(caps(false, true, true))).toBe('grants');
      expect(owncastLandingView(caps(false, true, false))).toBe('grants');
    });
    it('a mod without the streamer role lands on moderation', () => {
      expect(owncastLandingView(caps(false, false, true))).toBe('moderation');
    });
    it('a session that can open none of the views lands on forbidden directly', () => {
      expect(owncastLandingView(caps(false, false, false))).toBe('forbidden');
    });
  });
});
