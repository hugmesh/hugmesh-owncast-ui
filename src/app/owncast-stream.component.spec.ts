import { ComponentFixture, TestBed } from '@angular/core/testing';

import { OwncastStreamComponent } from './owncast-stream.component';
import { OwncastService, OwncastStream, OwncastApiError } from './owncast.service';
import { accessibleName } from './accessible-name';

function stream(over: Partial<OwncastStream> = {}): OwncastStream {
  return {
    id: '1', domain: 'd', userSubject: 'google:me@x.com', title: 'T',
    description: 'D', visibility: 'internal', createdAt: '', updatedAt: '', ...over,
  };
}

describe('OwncastStreamComponent (My Stream + the public-visibility gate)', () => {
  let fixture: ComponentFixture<OwncastStreamComponent>;
  let owncast: jasmine.SpyObj<OwncastService>;

  async function setup(): Promise<void> {
    owncast = jasmine.createSpyObj<OwncastService>('OwncastService', [
      'getMyStream', 'upsertMyStream', 'setVisibility',
    ]);
    await TestBed.configureTestingModule({
      imports: [OwncastStreamComponent],
      providers: [{ provide: OwncastService, useValue: owncast }],
    }).compileComponents();
    fixture = TestBed.createComponent(OwncastStreamComponent);
  }

  function el(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(async () => {
    await setup();
  });

  it('shows a loading state, then the stream details', async () => {
    owncast.getMyStream.and.resolveTo(stream());
    fixture.detectChanges(); // ngOnInit kicks off reload
    expect(el().querySelector('[data-testid="owncast-stream-loading"]')).not.toBeNull();
    await fixture.whenStable();
    fixture.detectChanges();
    // The loaded title is reflected into the edit signal...
    expect(fixture.componentInstance.title()).toBe('T');
    // ...and the one-way [ngModel] binding writes it to the input (a second
    // stabilize lets ngModel's async writeValue flush to the DOM).
    await fixture.whenStable();
    fixture.detectChanges();
    expect((el().querySelector('[data-testid="owncast-stream-title-input"]') as HTMLInputElement).value).toBe('T');
  });

  it('a 404 → the "no stream yet" empty state (the upsert form creates one)', async () => {
    owncast.getMyStream.and.rejectWith(new OwncastApiError(404, 'no stream'));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el().querySelector('[data-testid="owncast-stream-empty"]')).not.toBeNull();
  });

  it('a non-404 load error is announced in role="alert"', async () => {
    owncast.getMyStream.and.rejectWith(new OwncastApiError(500, 'boom'));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const err = el().querySelector('[data-testid="owncast-stream-load-error"]')!;
    expect(err).not.toBeNull();
    expect(err.getAttribute('role')).toBe('alert');
  });

  // ── THE CANONICAL DISABLED+HELPTEXT GATE ──

  it('an internal stream → the PUBLIC option is DISABLED and paired with the help-text', async () => {
    owncast.getMyStream.and.resolveTo(stream({ visibility: 'internal' }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const publicRadio = el().querySelector('[data-testid="owncast-stream-vis-public"]') as HTMLInputElement;
    expect(publicRadio.disabled).withContext('public disabled until a grant is confirmed').toBeTrue();

    const help = el().querySelector('[data-testid="owncast-stream-public-disabled-help"]')!;
    expect(help).withContext('disabled control pairs with VISIBLE help-text').not.toBeNull();
    expect(help.textContent).toContain('You need an active broadcast grant from an admin to go public');

    // The public radio's accessible name + describedby resolve to the gate help.
    expect(publicRadio.getAttribute('aria-describedby')).toBe('owncast-stream-vis-public-help');
    expect(help.id).toBe('owncast-stream-vis-public-help');
  });

  it('"Try going public" on a 403 reflects the deny and KEEPS public disabled (fail-closed)', async () => {
    owncast.getMyStream.and.resolveTo(stream({ visibility: 'internal' }));
    owncast.setVisibility.and.rejectWith(new OwncastApiError(403, 'no active broadcast grant'));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const c = fixture.componentInstance;
    await c.tryGoPublic();
    fixture.detectChanges();

    expect(owncast.setVisibility).toHaveBeenCalledWith('public');
    expect(c.broadcastConfirmed()).withContext('403 confirms no grant').toBeFalse();
    expect(c.publicDisabled()).withContext('public stays disabled after a 403').toBeTrue();
    const err = el().querySelector('[data-testid="owncast-stream-flip-error"]')!;
    expect(err.getAttribute('role')).toBe('alert');
    expect(err.textContent).toContain('active broadcast grant');
  });

  it('"Try going public" SUCCESS makes the stream public + enables the public option', async () => {
    owncast.getMyStream.and.resolveTo(stream({ visibility: 'internal' }));
    owncast.setVisibility.and.resolveTo(stream({ visibility: 'public' }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const c = fixture.componentInstance;
    await c.tryGoPublic();
    fixture.detectChanges();

    expect(c.broadcastConfirmed()).toBeTrue();
    expect(c.isPublic()).toBeTrue();
    expect(c.publicDisabled()).withContext('public enabled once a grant is confirmed').toBeFalse();
    expect(el().querySelector('[data-testid="owncast-stream-flip-notice"]')!.textContent).toContain('public');
  });

  it('an ALREADY-public stream renders the public option ENABLED (grant was live)', async () => {
    owncast.getMyStream.and.resolveTo(stream({ visibility: 'public' }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const c = fixture.componentInstance;
    expect(c.publicDisabled()).toBeFalse();
    const publicRadio = el().querySelector('[data-testid="owncast-stream-vis-public"]') as HTMLInputElement;
    expect(publicRadio.disabled).toBeFalse();
    expect(publicRadio.checked).toBeTrue();
  });

  it('setVisibility("public") while disabled short-circuits WITHOUT a round-trip (UI never claims success)', async () => {
    owncast.getMyStream.and.resolveTo(stream({ visibility: 'internal' }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const c = fixture.componentInstance;
    await c.setVisibility('public');
    expect(owncast.setVisibility).not.toHaveBeenCalled();
    expect(c.flipError()).toContain('active broadcast grant');
  });

  it('flip to INTERNAL always succeeds + is announced', async () => {
    owncast.getMyStream.and.resolveTo(stream({ visibility: 'public' }));
    owncast.setVisibility.and.resolveTo(stream({ visibility: 'internal' }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const c = fixture.componentInstance;
    await c.setVisibility('internal');
    fixture.detectChanges();
    expect(owncast.setVisibility).toHaveBeenCalledWith('internal');
    expect(el().querySelector('[data-testid="owncast-stream-flip-notice"]')!.textContent).toContain('internal');
  });

  // ── details upsert ──

  it('save → upsertMyStream with the edited title + description', async () => {
    owncast.getMyStream.and.resolveTo(stream({ title: '', description: '' }));
    owncast.upsertMyStream.and.resolveTo(stream({ title: 'New', description: 'Desc' }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const c = fixture.componentInstance;
    c.title.set('New');
    c.description.set('Desc');
    await c.save();
    expect(owncast.upsertMyStream).toHaveBeenCalledWith({ title: 'New', description: 'Desc' });
    fixture.detectChanges();
    expect(el().querySelector('[data-testid="owncast-stream-save-notice"]')).not.toBeNull();
  });

  // ── a11y / video card ──

  it('renders the in-platform video preview card', async () => {
    owncast.getMyStream.and.resolveTo(stream());
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el().querySelector('[data-testid="owncast-stream-player"]')).not.toBeNull();
  });

  it('with NO playbackUrl → the player shows the empty-playback state (no <video>)', async () => {
    owncast.getMyStream.and.resolveTo(stream({ playbackUrl: undefined }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.componentInstance.hasPlayback()).toBeFalse();
    expect(el().querySelector('[data-testid="owncast-stream-player-empty"]')).not.toBeNull();
    expect(el().querySelector('[data-testid="owncast-stream-video-el"]'))
      .withContext('no <video> element until a playbackUrl exists').toBeNull();
  });

  it('with a playbackUrl → renders a real <video> player bound to the typed URL', async () => {
    owncast.getMyStream.and.resolveTo(stream({ playbackUrl: 'https://owncast.example/hls/stream.m3u8' }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.componentInstance.hasPlayback()).toBeTrue();
    expect(fixture.componentInstance.playbackUrl()).toBe('https://owncast.example/hls/stream.m3u8');
    const video = el().querySelector('[data-testid="owncast-stream-video-el"]') as HTMLVideoElement;
    expect(video).withContext('a real <video> element renders for the HLS preview').not.toBeNull();
    expect(video.tagName.toLowerCase()).toBe('video');
    // a11y: the player <video> carries an accessible name (the section title).
    expect(accessibleName(video)).withContext('video has an accessible name').toBeTruthy();
  });

  it('the player <video> attaches the source (native HLS path sets video.src)', async () => {
    // No window.Hls in the test env → native HLS path. canPlayType for HLS may be
    // falsy in headless Chrome, in which case the unsupported notice is shown
    // instead. Either way the player must NOT silently no-op: it either wires the
    // source or surfaces an error. This asserts the wiring branch is reached.
    const url = 'https://owncast.example/hls/live.m3u8';
    owncast.getMyStream.and.resolveTo(stream({ playbackUrl: url }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    // Let the queued microtask attach the player.
    await Promise.resolve();
    fixture.detectChanges();
    const video = el().querySelector('[data-testid="owncast-stream-video-el"]') as HTMLVideoElement;
    const supportsNativeHls = !!video.canPlayType('application/vnd.apple.mpegurl');
    if (supportsNativeHls) {
      expect(video.src).toContain('live.m3u8');
    } else {
      expect(el().querySelector('[data-testid="owncast-stream-player-error"]'))
        .withContext('unsupported browsers get a player error, not a silent no-op').not.toBeNull();
    }
  });

  it('the title input + both visibility radios carry an accessible name (a11y)', async () => {
    owncast.getMyStream.and.resolveTo(stream({ visibility: 'internal' }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(accessibleName(el().querySelector('#owncast-stream-title-input'))).toBeTruthy();
    expect(accessibleName(el().querySelector('[data-testid="owncast-stream-vis-internal"]'))).toContain('Internal');
    expect(accessibleName(el().querySelector('[data-testid="owncast-stream-vis-public"]'))).toContain('Public');
  });
});
