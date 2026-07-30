import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';

import { OwncastModerationComponent } from './owncast-moderation.component';
import { OwncastService, ModStream, OwncastApiError } from './owncast.service';
import { SessionService } from './session.service';

function stream(over: Partial<ModStream> = {}): ModStream {
  return {
    ownerSubject: 'google:bob@x.com',
    domain: 'd',
    title: 'A stream',
    visibility: 'public',
    banned: false,
    ...over,
  };
}

describe('OwncastModerationComponent (moderation view)', () => {
  let fixture: ComponentFixture<OwncastModerationComponent>;
  let owncast: jasmine.SpyObj<OwncastService>;

  async function setup(initial: ModStream[] = []): Promise<void> {
    owncast = jasmine.createSpyObj<OwncastService>('OwncastService', [
      'listModStreams', 'hideStream', 'killStream', 'restoreStream',
    ]);
    owncast.listModStreams.and.resolveTo(initial);
    await TestBed.configureTestingModule({
      imports: [OwncastModerationComponent],
      providers: [
        { provide: OwncastService, useValue: owncast },
        { provide: SessionService, useValue: { canModerate: signal(true) } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(OwncastModerationComponent);
  }

  function el(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('listModStreams hits GET /bff/owncast/mod/streams on init', async () => {
    await setup([stream()]);
    await settle();
    expect(owncast.listModStreams).toHaveBeenCalled();
    expect(el().querySelectorAll('[data-testid="owncast-moderation-row"]').length).toBe(1);
  });

  it('renders the moderation feed region with a labelled heading', async () => {
    await setup([]);
    await settle();
    const region = el().querySelector('[data-testid="owncast-moderation-feed"]')!;
    expect(region).not.toBeNull();
    expect(region.getAttribute('aria-labelledby')).toBe('owncast-moderation-feed-title');
  });

  it('shows the no-streams empty state when the brand has none', async () => {
    await setup([]);
    await settle();
    expect(el().querySelector('[data-testid="owncast-moderation-empty"]')).not.toBeNull();
  });

  it('shows a loading state before the list resolves', async () => {
    await setup([]);
    fixture.detectChanges(); // ngOnInit fired; promise not yet flushed
    expect(el().querySelector('[data-testid="owncast-moderation-loading"]')).not.toBeNull();
  });

  it('renders the owner, title and visibility per row', async () => {
    await setup([stream({ ownerSubject: 'google:alice@x.com', visibility: 'internal' })]);
    await settle();
    expect(el().querySelector('[data-testid="owncast-moderation-owner"]')!.textContent)
      .toContain('google:alice@x.com');
    expect(el().querySelector('[data-testid="owncast-moderation-visibility"]')!.textContent)
      .toContain('internal');
  });

  // ── BANNED badge ──

  it('renders the BANNED badge with TEXT (not just colour) for a banned stream', async () => {
    await setup([stream({ banned: true })]);
    await settle();
    const badge = el().querySelector('[data-testid="owncast-moderation-banned-badge"]')!;
    expect(badge).not.toBeNull();
    expect(badge.textContent!.trim().toLowerCase()).toContain('banned');
  });

  it('does NOT render the banned badge for an active stream', async () => {
    await setup([stream({ banned: false })]);
    await settle();
    expect(el().querySelector('[data-testid="owncast-moderation-banned-badge"]')).toBeNull();
  });

  // ── HIDE ──

  it('Hide POSTs hideStream for the right row when the stream is public', async () => {
    await setup([stream({ ownerSubject: 'u', visibility: 'public' })]);
    await settle();
    owncast.hideStream.and.resolveTo(stream({ ownerSubject: 'u', visibility: 'internal' }));
    const btn = el().querySelector('[data-testid="owncast-moderation-hide"]') as HTMLButtonElement;
    expect(btn.disabled).toBeFalse();
    btn.click();
    await settle();
    expect(owncast.hideStream).toHaveBeenCalledWith('u');
  });

  it('Hide is disabled + paired with "Already private" help-text when internal', async () => {
    await setup([stream({ visibility: 'internal' })]);
    await settle();
    const btn = el().querySelector('[data-testid="owncast-moderation-hide"]') as HTMLButtonElement;
    expect(btn.disabled).toBeTrue();
    const help = el().querySelector('[data-testid="owncast-moderation-hide-help"]')!;
    expect(help.textContent).toContain('Already private');
    expect(btn.getAttribute('aria-describedby')).toBe(help.id);
    expect(owncast.hideStream).not.toHaveBeenCalled();
  });

  // ── KILL (ban) — confirm-gated ──

  it('Kill shows a confirm and only POSTs killStream on confirm', async () => {
    await setup([stream({ ownerSubject: 'u', banned: false })]);
    await settle();
    owncast.killStream.and.resolveTo(stream({ ownerSubject: 'u', banned: true, visibility: 'internal' }));
    const confirmSpy = spyOn(window, 'confirm').and.returnValue(true);
    (el().querySelector('[data-testid="owncast-moderation-kill"]') as HTMLButtonElement).click();
    await settle();
    expect(confirmSpy).toHaveBeenCalled();
    expect(confirmSpy.calls.mostRecent().args[0]).toContain('banned from broadcasting');
    expect(owncast.killStream).toHaveBeenCalledWith('u');
  });

  it('Kill does NOT POST when the confirm is dismissed', async () => {
    await setup([stream({ ownerSubject: 'u', banned: false })]);
    await settle();
    spyOn(window, 'confirm').and.returnValue(false);
    (el().querySelector('[data-testid="owncast-moderation-kill"]') as HTMLButtonElement).click();
    await settle();
    expect(owncast.killStream).not.toHaveBeenCalled();
  });

  it('Kill is disabled + paired with "Already banned" help-text when banned', async () => {
    await setup([stream({ banned: true })]);
    await settle();
    const btn = el().querySelector('[data-testid="owncast-moderation-kill"]') as HTMLButtonElement;
    expect(btn.disabled).toBeTrue();
    const help = el().querySelector('[data-testid="owncast-moderation-kill-help"]')!;
    expect(help.textContent).toContain('Already banned');
    expect(btn.getAttribute('aria-describedby')).toBe(help.id);
  });

  // ── RESTORE ──

  it('Restore is shown only when banned and POSTs restoreStream for the row', async () => {
    await setup([stream({ ownerSubject: 'u', banned: true, visibility: 'internal' })]);
    await settle();
    owncast.restoreStream.and.resolveTo(stream({ ownerSubject: 'u', banned: false, visibility: 'internal' }));
    const btn = el().querySelector('[data-testid="owncast-moderation-restore"]') as HTMLButtonElement;
    expect(btn).not.toBeNull();
    btn.click();
    await settle();
    expect(owncast.restoreStream).toHaveBeenCalledWith('u');
  });

  it('Restore is NOT shown when the stream is not banned', async () => {
    await setup([stream({ banned: false })]);
    await settle();
    expect(el().querySelector('[data-testid="owncast-moderation-restore"]')).toBeNull();
  });

  // ── refresh after an action ──

  it('refreshes the list after an action (re-calls listModStreams)', async () => {
    await setup([stream({ ownerSubject: 'u', banned: false })]);
    await settle();
    expect(owncast.listModStreams).toHaveBeenCalledTimes(1);
    const c = fixture.componentInstance;
    spyOn(window, 'confirm').and.returnValue(true);
    owncast.killStream.and.resolveTo(stream({ ownerSubject: 'u', banned: true }));
    owncast.listModStreams.and.resolveTo([stream({ ownerSubject: 'u', banned: true, visibility: 'internal' })]);
    // Await the full action chain (kill → optimistic patch → reload) deterministically.
    await c.kill(stream({ ownerSubject: 'u', banned: false }));
    fixture.detectChanges();
    expect(owncast.listModStreams).toHaveBeenCalledTimes(2);
    // The row now reflects the banned state from the refreshed list.
    expect(el().querySelector('[data-testid="owncast-moderation-banned-badge"]')).not.toBeNull();
  });

  // ── a11y: action buttons name the stream identity ──

  it('every action button carries an accessible name including the stream identity', async () => {
    await setup([stream({ ownerSubject: 'google:bob@x.com', visibility: 'public', banned: false })]);
    await settle();
    const hide = el().querySelector('[data-testid="owncast-moderation-hide"]')!;
    const kill = el().querySelector('[data-testid="owncast-moderation-kill"]')!;
    expect(hide.getAttribute('aria-label')).toBe('Hide stream of google:bob@x.com');
    expect(kill.getAttribute('aria-label')).toBe('Kill stream of google:bob@x.com');
  });

  // ── graceful error degradation ──

  it('a 403 on load degrades to an announced message, not a broken view', async () => {
    await setup();
    owncast.listModStreams.and.rejectWith(new OwncastApiError(403, 'no'));
    await settle();
    const err = el().querySelector('[data-testid="owncast-moderation-error"]')!;
    expect(err).not.toBeNull();
    expect(err.getAttribute('role')).toBe('alert');
    expect(err.textContent).toContain('denied');
    // The feed region is still rendered — the view is not broken.
    expect(el().querySelector('[data-testid="owncast-moderation-feed"]')).not.toBeNull();
  });

  it('a 404 on an action is announced gracefully', async () => {
    await setup([stream({ ownerSubject: 'u', visibility: 'public', banned: false })]);
    await settle();
    owncast.hideStream.and.rejectWith(new OwncastApiError(404, 'gone'));
    await fixture.componentInstance.hide(stream({ ownerSubject: 'u', visibility: 'public', banned: false }));
    fixture.detectChanges();
    const err = el().querySelector('[data-testid="owncast-moderation-action-error"]')!;
    expect(err).not.toBeNull();
    expect(err.getAttribute('role')).toBe('alert');
  });
});
