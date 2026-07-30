import { TestBed } from '@angular/core/testing';
import { SessionService, SnapSession } from './session.service';

/** The role-composite signals are the UI's defence-in-depth gate, derived from
 *  the Casdoor roles in hug.session. Each tier (streamer / mod / admin /
 *  superadmin / plain user) is exercised against canStream / canManage /
 *  canManageAll / canModerate — mirroring the owncast-bff role model. */
function sessionFor(roles: string[]): SnapSession {
  return {
    id: 'google:x@y.com',
    label: 'x',
    provider: 'google',
    roles,
    registrationComplete: true,
  };
}

describe('SessionService (owncast role composites)', () => {
  let service: SessionService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [SessionService] });
    service = TestBed.inject(SessionService);
  });

  afterEach(() => localStorage.clear());

  function withRoles(roles: string[]): void {
    service.set(sessionFor(roles));
  }

  it('logged out → every composite is false', () => {
    expect(service.loggedIn()).toBeFalse();
    expect(service.canStream()).toBeFalse();
    expect(service.canManage()).toBeFalse();
    expect(service.canManageAll()).toBeFalse();
    expect(service.canModerate()).toBeFalse();
  });

  it('a plain USER (no owncast roles) can do NONE of the gated views', () => {
    withRoles(['user']);
    expect(service.canStream()).withContext('no owncast role → no streamer surface').toBeFalse();
    expect(service.canManage()).toBeFalse();
    expect(service.canModerate()).toBeFalse();
  });

  it('a STREAMER (owncast) canStream only', () => {
    withRoles(['user', 'owncast']);
    expect(service.canStream()).toBeTrue();
    expect(service.canManage()).withContext('streamer is not an admin').toBeFalse();
    expect(service.canModerate()).withContext('streamer is not a mod').toBeFalse();
  });

  it('a MOD canModerate (not manage, not stream by default)', () => {
    withRoles(['user', 'mod']);
    expect(service.canModerate()).toBeTrue();
    expect(service.canManage()).toBeFalse();
    expect(service.canStream()).toBeFalse();
  });

  it('an ADMIN canManage + canModerate (admin is a mod), but NOT canManageAll', () => {
    withRoles(['user', 'admin']);
    expect(service.canManage()).toBeTrue();
    expect(service.canModerate()).withContext('admin inherits mod').toBeTrue();
    expect(service.canManageAll()).withContext('list-all/history is superadmin-only').toBeFalse();
  });

  it('a SUPERADMIN can do EVERYTHING incl. canManageAll + canModerate', () => {
    withRoles(['superadmin']);
    expect(service.canManage()).toBeTrue();
    expect(service.canManageAll()).toBeTrue();
    expect(service.canModerate()).toBeTrue();
    expect(service.isSuperadmin()).toBeTrue();
  });

  it('an ADMIN who ALSO holds the owncast role canStream as well', () => {
    withRoles(['admin', 'owncast']);
    expect(service.canStream()).toBeTrue();
    expect(service.canManage()).toBeTrue();
  });

  it('the persisted session holds NO homeserver token (browser never sees matrix/mastodon secrets)', () => {
    withRoles(['user', 'owncast']);
    // The hsproxy injects the server-held homeserver token server-side; the
    // browser only ever holds non-secret metadata + the HttpOnly bff_ cookie.
    const raw = localStorage.getItem('hug.session') ?? '';
    expect(raw).not.toContain('matrix');
    expect(raw).not.toContain('mastodon');
    expect(raw).not.toContain('token');
    const persisted = JSON.parse(raw) as Record<string, unknown>;
    expect('matrix' in persisted).withContext('no matrix token field').toBeFalse();
    expect('mastodon' in persisted).withContext('no mastodon token field').toBeFalse();
  });
});
