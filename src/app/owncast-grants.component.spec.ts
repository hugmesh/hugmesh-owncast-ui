import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';

import { OwncastGrantsComponent } from './owncast-grants.component';
import { OwncastService, OwncastGrant, OwncastApiError } from './owncast.service';
import { SessionService } from './session.service';

function grant(over: Partial<OwncastGrant> = {}): OwncastGrant {
  return {
    id: '1', domain: 'd', userSubject: 'google:bob@x.com', accessType: 'broadcast',
    state: 'active', grantedBySubject: 'admin', reason: null,
    createdAt: '', expiresAt: null, revokedAt: null, ...over,
  };
}

describe('OwncastGrantsComponent (grant/timeout/ban console)', () => {
  let fixture: ComponentFixture<OwncastGrantsComponent>;
  let owncast: jasmine.SpyObj<OwncastService>;
  let canManageAll: ReturnType<typeof signal<boolean>>;

  async function setup(superadmin: boolean): Promise<void> {
    canManageAll = signal(superadmin);
    owncast = jasmine.createSpyObj<OwncastService>('OwncastService', [
      'grant', 'timeout', 'ban', 'revoke', 'listActiveGrants', 'grantHistory',
    ]);
    owncast.listActiveGrants.and.resolveTo({ access: [] });
    owncast.grantHistory.and.resolveTo({ access: [] });
    await TestBed.configureTestingModule({
      imports: [OwncastGrantsComponent],
      providers: [
        { provide: OwncastService, useValue: owncast },
        { provide: SessionService, useValue: { canManageAll } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(OwncastGrantsComponent);
  }

  function el(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  // ── action form (ADMIN, canManageAll=false) ──

  describe('as an ADMIN (no manage-all)', () => {
    beforeEach(async () => {
      await setup(false);
      fixture.detectChanges();
    });

    it('requires a user subject before submit', async () => {
      const c = fixture.componentInstance;
      await c.submit();
      expect(owncast.grant).not.toHaveBeenCalled();
      expect(c.userInvalid()).toBeTrue();
    });

    it('GRANT → owncast.grant and surfaces the result row', async () => {
      const c = fixture.componentInstance;
      c.userSubject.set('google:bob@x.com');
      owncast.grant.and.resolveTo(grant({ accessType: 'broadcast' }));
      await c.submit();
      expect(owncast.grant).toHaveBeenCalledWith({ userSubject: 'google:bob@x.com', reason: undefined });
      fixture.detectChanges();
      expect(el().querySelector('[data-testid="owncast-grants-result"]')).not.toBeNull();
    });

    it('TIMEOUT → owncast.timeout converting hours to ttlSeconds', async () => {
      const c = fixture.componentInstance;
      c.setAction('timeout');
      c.userSubject.set('u');
      c.timeoutHours.set(2);
      owncast.timeout.and.resolveTo(grant({ accessType: 'banned', expiresAt: '2030-01-01' }));
      await c.submit();
      expect(owncast.timeout).toHaveBeenCalledWith({ userSubject: 'u', ttlSeconds: 7200, reason: undefined });
    });

    it('BAN → owncast.ban + shows the ban-precedence note + a Restore action on the result', async () => {
      const c = fixture.componentInstance;
      c.setAction('ban');
      fixture.detectChanges();
      expect(el().querySelector('[data-testid="owncast-grants-ban-note"]'))
        .withContext('ban precedence surfaced').not.toBeNull();
      c.userSubject.set('u');
      owncast.ban.and.resolveTo(grant({ accessType: 'banned', state: 'active' }));
      await c.submit();
      fixture.detectChanges();
      expect(el().querySelector('[data-testid="owncast-grants-restore"]')).not.toBeNull();
    });

    it('restore → revoke("banned", user)', async () => {
      const c = fixture.componentInstance;
      owncast.revoke.and.resolveTo();
      await c.restore('google:bob@x.com');
      expect(owncast.revoke).toHaveBeenCalledWith('banned', 'google:bob@x.com');
      expect(c.notice()).toContain('restored');
    });

    it('removeGrant → revoke("broadcast", user)', async () => {
      const c = fixture.componentInstance;
      owncast.revoke.and.resolveTo();
      await c.removeGrant('u');
      expect(owncast.revoke).toHaveBeenCalledWith('broadcast', 'u');
    });

    it('surfaces a 403 govern-denial in role="alert"', async () => {
      const c = fixture.componentInstance;
      c.userSubject.set('u');
      owncast.grant.and.rejectWith(new OwncastApiError(403, 'no'));
      await c.submit();
      fixture.detectChanges();
      const err = el().querySelector('[data-testid="owncast-grants-error"]')!;
      expect(err.getAttribute('role')).toBe('alert');
      expect(err.textContent).toContain('denied');
    });

    it('does NOT render the superadmin-only active list / history panels', () => {
      expect(el().querySelector('[data-testid="owncast-grants-active-panel"]')).toBeNull();
      expect(el().querySelector('[data-testid="owncast-grants-history-panel"]')).toBeNull();
      expect(owncast.listActiveGrants).not.toHaveBeenCalled();
    });

    it('the user-subject input has a programmatic label + describedby help (a11y)', () => {
      const input = el().querySelector('#owncast-grants-user')!;
      const label = el().querySelector('label[for="owncast-grants-user"]');
      expect(label).not.toBeNull();
      expect(input.getAttribute('aria-describedby')).toContain('owncast-grants-user-help');
    });
  });

  // ── manage-all (SUPERADMIN) ──

  describe('as a SUPERADMIN (manage-all)', () => {
    beforeEach(async () => {
      await setup(true);
    });

    it('loads + renders the active grants list on init', async () => {
      owncast.listActiveGrants.and.resolveTo({ access: [grant()] });
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(owncast.listActiveGrants).toHaveBeenCalled();
      expect(el().querySelector('[data-testid="owncast-grants-active-panel"]')).not.toBeNull();
      expect(el().querySelectorAll('[data-testid="owncast-grants-active-row"]').length).toBe(1);
    });

    it('shows an empty state when there are no active grants', async () => {
      owncast.listActiveGrants.and.resolveTo({ access: [] });
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(el().querySelector('[data-testid="owncast-grants-active-empty"]')).not.toBeNull();
    });

    it('a 403 on the active list is announced (superadmin path denial)', async () => {
      owncast.listActiveGrants.and.rejectWith(new OwncastApiError(403, 'no'));
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      const err = el().querySelector('[data-testid="owncast-grants-active-error"]')!;
      expect(err).not.toBeNull();
      expect(err.textContent).toContain('superadmin');
    });

    it('loadHistory → grantHistory for the looked-up user', async () => {
      fixture.detectChanges();
      await fixture.whenStable();
      const c = fixture.componentInstance;
      c.historyUser.set('google:bob@x.com');
      owncast.grantHistory.and.resolveTo({ access: [grant({ state: 'revoked' })] });
      await c.loadHistory();
      expect(owncast.grantHistory).toHaveBeenCalledWith('google:bob@x.com');
      expect(c.history()!.length).toBe(1);
    });
  });
});
