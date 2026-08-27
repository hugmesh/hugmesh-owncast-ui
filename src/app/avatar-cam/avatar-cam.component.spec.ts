import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { AvatarCamComponent, VISEME_MOUTH } from './avatar-cam.component';
import { GamesApiError, GamesAvatar, GamesAvatarService } from './games-avatar.service';
import { MicDeps } from './mic-openness.service';
import { OPEN_RMS_REFERENCE } from './openness';
import { VISEME_MIN_HOLD_MS } from './viseme';

describe('AvatarCamComponent', () => {
  let fixture: ComponentFixture<AvatarCamComponent>;
  let games: jasmine.SpyObj<GamesAvatarService>;

  const avatars: GamesAvatar[] = [
    { id: 'act', name: 'Active one', active: true },
    { id: 'oth', name: 'Other', active: false },
  ];

  async function setup(query: Record<string, string> = {}, list: GamesAvatar[] = avatars): Promise<void> {
    games = jasmine.createSpyObj<GamesAvatarService>('GamesAvatarService', ['listMine', 'frame', 'frameUrl']);
    games.listMine.and.resolveTo(list);
    games.frame.and.callFake((id, expression, mouth) => Promise.resolve(`data:image/svg+xml,${id}-${expression}-${mouth}`));
    await TestBed.configureTestingModule({
      imports: [AvatarCamComponent],
      providers: [
        { provide: GamesAvatarService, useValue: games },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(query) } } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(AvatarCamComponent);
    fixture.detectChanges();
    await settle();
  }

  /** Let the async chain (list → effect → three frame fetches → signal) land,
   *  whichever change-detection mode the harness runs in. */
  async function settle(): Promise<void> {
    for (let i = 0; i < 6; i++) {
      await new Promise(r => setTimeout(r, 0));
      fixture.detectChanges();
    }
  }

  function el(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }
  function frame(): HTMLImageElement | null {
    return el().querySelector('[data-testid="owncast-avatar-cam-frame"]');
  }
  function micDeps(level: { value: number }) {
    const ticks: Array<() => void> = [];
    const deps: MicDeps = {
      stream: () => Promise.resolve({ getTracks: () => [{ stop: () => undefined }] } as unknown as MediaStream),
      context: () => ({
        createMediaStreamSource: () => ({ connect: () => undefined, disconnect: () => undefined }),
        createAnalyser: () => ({ fftSize: 0, getFloatTimeDomainData: (b: Float32Array) => b.fill(level.value) }),
        close: () => Promise.resolve(),
      } as unknown as AudioContext),
      schedule: (cb) => { ticks.push(cb); return ticks.length; },
      cancel: () => undefined,
    };
    return { deps, tick: () => ticks.shift()?.() };
  }

  it('picks the ACTIVE avatar, loads its three mouth frames, and shows the closed one', async () => {
    await setup();
    expect(fixture.componentInstance.avatarId()).toBe('act');
    expect(games.frame.calls.allArgs().map(a => a.slice(0, 3))).toEqual([
      ['act', 'neutral', VISEME_MOUTH.closed], ['act', 'neutral', VISEME_MOUTH.half], ['act', 'neutral', VISEME_MOUTH.open],
    ]);
    expect(frame()?.getAttribute('src')).toBe('data:image/svg+xml,act-neutral-0');
    expect(el().querySelector('[data-testid="owncast-avatar-cam-stage"]')?.getAttribute('data-viseme')).toBe('closed');
    // the menubar chrome is present outside capture mode
    expect(el().querySelector('[data-testid="owncast-avatar-cam-howto"]')).not.toBeNull();
  });

  it('a hand-picked frame swaps the image; switching expression reloads the frames', async () => {
    await setup();
    (el().querySelector('[data-testid="owncast-avatar-cam-viseme-open"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(frame()?.getAttribute('src')).toBe('data:image/svg+xml,act-neutral-0.9');
    const sel = el().querySelector('[data-testid="owncast-avatar-cam-expression"]') as HTMLSelectElement;
    sel.value = 'happy';
    sel.dispatchEvent(new Event('change'));
    await settle();
    expect(frame()?.getAttribute('src')).toBe('data:image/svg+xml,act-happy-0.9');
  });

  it('the microphone drives the frame while live; stopping returns to the preview', async () => {
    await setup();
    const c = fixture.componentInstance;
    let clock = 0;
    c.now = () => clock;
    c.previewViseme('half');
    const level = { value: OPEN_RMS_REFERENCE * 10 };
    const m = micDeps(level);
    await c.toggleMic(m.deps);
    fixture.detectChanges();
    expect(c.micLive()).toBeTrue();
    for (let i = 0; i < 12; i++) { clock += VISEME_MIN_HOLD_MS; m.tick(); TestBed.flushEffects(); }
    fixture.detectChanges();
    expect(c.viseme()).toBe('open');
    expect(frame()?.getAttribute('src')).toBe('data:image/svg+xml,act-neutral-0.9');
    expect(el().querySelector('[data-testid="owncast-avatar-cam-viseme-open"]')?.hasAttribute('disabled')).toBeTrue();
    c.stopMic();
    fixture.detectChanges();
    expect(c.viseme()).toBe('half');
    expect(c.openness()).toBe(0);
  });

  it('capture mode honours ?avatar ?expression ?bg and shows only the stage', async () => {
    await setup({ capture: '1', avatar: 'oth', expression: 'angry', bg: 'green' });
    expect(fixture.componentInstance.avatarId()).toBe('oth');
    expect(fixture.componentInstance.expression()).toBe('angry');
    expect(el().querySelector('[data-testid="owncast-avatar-cam"]')?.getAttribute('data-bg')).toBe('green');
    expect(el().querySelector('.avatar-cam--capture')).not.toBeNull();
    expect(el().querySelector('[data-testid="owncast-avatar-cam-howto"]')).toBeNull();
    expect(el().querySelector('[data-testid="owncast-avatar-cam-capture-start"]')).not.toBeNull();
    expect(frame()?.getAttribute('src')).toBe('data:image/svg+xml,oth-angry-0');
  });

  it('the capture URL carries the choices and never a transparent background', async () => {
    await setup();
    const u = new URL(fixture.componentInstance.captureUrl());
    expect(u.searchParams.get('capture')).toBe('1');
    expect(u.searchParams.get('bg')).toBe('green');
    expect(u.searchParams.get('avatar')).toBe('act');
    expect(u.searchParams.get('expression')).toBe('neutral');
    expect(el().querySelector('[data-testid="owncast-avatar-cam-capture-url"]')?.textContent).toContain('capture=1');
  });

  it('no avatars → the honest empty state; a games error → an alert', async () => {
    await setup({}, []);
    expect(el().querySelector('[data-testid="owncast-avatar-cam-empty"]')).not.toBeNull();
    expect(games.frame).not.toHaveBeenCalled();
    games = jasmine.createSpyObj<GamesAvatarService>('GamesAvatarService', ['listMine', 'frame', 'frameUrl']);
    TestBed.resetTestingModule();
    games.listMine.and.rejectWith(new GamesApiError(401, 'Sign in to the games portal first.'));
    await TestBed.configureTestingModule({
      imports: [AvatarCamComponent],
      providers: [
        { provide: GamesAvatarService, useValue: games },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({}) } } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(AvatarCamComponent);
    fixture.detectChanges();
    await settle();
    expect(el().querySelector('[data-testid="owncast-avatar-cam-load-error"]')?.textContent).toContain('Sign in');
  });
});
