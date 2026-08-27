import { Component, DestroyRef, OnInit, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { AVATAR_EXPRESSIONS, GamesApiError, GamesAvatar, GamesAvatarService } from './games-avatar.service';
import { MicDeps, MicOpennessService, MouthDrive } from './mic-openness.service';
import { VISEMES, Viseme, VisemeCadence } from './viseme';

/** The openness each drawn frame asks the games renderer for. */
export const VISEME_MOUTH: Readonly<Record<Viseme, number>> = { closed: 0, half: 0.45, open: 0.9 };

/** Backgrounds the capture can sit on: transparent for a browser source, a key
 *  colour for a window capture with a chroma filter, the mesh's own surface. */
export const CAM_BACKGROUNDS = [
  { id: 'transparent', label: 'Transparent' },
  { id: 'green', label: 'Green screen' },
  { id: 'blue', label: 'Blue screen' },
  { id: 'surface', label: 'Mesh surface' },
] as const;
export type CamBackground = (typeof CAM_BACKGROUNDS)[number]['id'];

/**
 * AVATAR CAM — stream on Owncast as your own 2D avatar, mouth following your
 * voice.
 *
 * How it goes on air, honestly: a browser cannot push RTMP. Owncast's ingest
 * stays what it is (OBS → tailnet → your Owncast :1935, see the bff's class
 * comment). This page is the CAMERA: it renders your active games avatar in
 * three mouth frames (closed / half / open, the way a visual novel's talking
 * sprite works) and swaps them by the loudness your microphone hears. You
 * capture THIS window in OBS (Window Capture; add a Chroma Key over the green
 * background) — a page popped out with `?capture=1` shows the avatar and
 * nothing else, sized to the window.
 *
 * The frames come from the games avatar API's `image.svg?mouth=` (any
 * authenticated user may read them, as the SVG is shared to rooms) so the
 * avatar you built in the Character Forge is the one that talks here.
 */
@Component({
  selector: 'hug-owncast-avatar-cam',
  standalone: true,
  imports: [],
  templateUrl: './avatar-cam.component.html',
  styleUrl: './avatar-cam.component.scss',
})
export class AvatarCamComponent implements OnInit {
  private readonly games = inject(GamesAvatarService);
  private readonly mic = inject(MicOpennessService);
  private readonly route = inject(ActivatedRoute);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly destroyRef = inject(DestroyRef);
  private readonly cadence = new VisemeCadence();

  readonly expressions = AVATAR_EXPRESSIONS;
  readonly backgrounds = CAM_BACKGROUNDS;
  readonly visemes = VISEMES;

  readonly loading = signal(true);
  readonly loadError = signal('');
  readonly avatars = signal<GamesAvatar[]>([]);
  readonly avatarId = signal<string>('');
  readonly expression = signal<string>('neutral');
  readonly background = signal<CamBackground>('transparent');
  /** `?capture=1`: the avatar fills the page, no chrome (what OBS captures). */
  readonly capture = signal(false);

  /** data: URL per viseme for the chosen avatar + expression; null until loaded. */
  private readonly frames = signal<Record<Viseme, string> | null>(null);
  readonly framesReady = computed(() => this.frames() !== null);
  readonly frameError = signal('');

  private readonly drive = signal<MouthDrive | null>(null);
  private readonly preview = signal<Viseme>('closed');
  private readonly live = signal<Viseme>('closed');
  readonly micLive = computed(() => this.drive() !== null);
  readonly micError = signal('');
  readonly openness = computed(() => this.drive()?.openness() ?? 0);
  readonly viseme = computed<Viseme>(() => (this.micLive() ? this.live() : this.preview()));
  readonly frameSrc = computed<SafeUrl | null>(() => {
    const f = this.frames();
    return f ? this.sanitizer.bypassSecurityTrustUrl(f[this.viseme()]) : null;
  });
  readonly avatarName = computed(() => this.avatars().find(a => a.id === this.avatarId())?.name ?? '');

  /** The clock the cadence reads — overridable for tests. */
  now: () => number = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  constructor() {
    effect(() => {
      const drive = this.drive();
      if (!drive) {
        return;
      }
      this.live.set(this.cadence.step(drive.openness(), this.now()));
    });
    // Reload the three frames whenever the avatar or the expression changes.
    effect(() => {
      const id = this.avatarId();
      const expression = this.expression();
      if (!id) {
        this.frames.set(null);
        return;
      }
      void this.loadFrames(id, expression);
    });
    this.destroyRef.onDestroy(() => this.stopMic());
  }

  async ngOnInit(): Promise<void> {
    const q = this.route.snapshot.queryParamMap;
    this.capture.set(q.get('capture') === '1');
    const bg = q.get('bg') as CamBackground | null;
    if (bg && CAM_BACKGROUNDS.some(b => b.id === bg)) {
      this.background.set(bg);
    }
    const expr = q.get('expression');
    if (expr && AVATAR_EXPRESSIONS.includes(expr)) {
      this.expression.set(expr);
    }
    try {
      const avatars = await this.games.listMine();
      this.avatars.set(avatars);
      const wanted = q.get('avatar');
      const pick = avatars.find(a => a.id === wanted) ?? avatars.find(a => a.active) ?? avatars[0];
      this.avatarId.set(pick?.id ?? '');
    } catch (e) {
      this.loadError.set(e instanceof GamesApiError ? e.message : 'Your avatars could not be loaded.');
    } finally {
      this.loading.set(false);
    }
  }

  private async loadFrames(id: string, expression: string): Promise<void> {
    this.frameError.set('');
    try {
      const [closed, half, open] = await Promise.all(
        VISEMES.map(v => this.games.frame(id, expression, VISEME_MOUTH[v])),
      );
      // Only the latest request may land (the user may have switched again).
      if (this.avatarId() === id && this.expression() === expression) {
        this.frames.set({ closed, half, open });
      }
    } catch (e) {
      this.frames.set(null);
      this.frameError.set(e instanceof GamesApiError ? e.message : 'The avatar could not be rendered.');
    }
  }

  onAvatar(ev: Event): void {
    this.avatarId.set((ev.target as HTMLSelectElement).value);
  }

  onExpression(ev: Event): void {
    this.expression.set((ev.target as HTMLSelectElement).value);
  }

  onBackground(ev: Event): void {
    this.background.set((ev.target as HTMLSelectElement).value as CamBackground);
  }

  /** Hand-pick the frame while no mic is live (preview, captures, tests). */
  previewViseme(v: Viseme): void {
    this.preview.set(v);
  }

  labelOf(v: Viseme): string {
    return v === 'closed' ? 'Closed' : v === 'half' ? 'Half open' : 'Open';
  }

  async toggleMic(deps?: MicDeps): Promise<void> {
    if (this.drive()) {
      this.stopMic();
      return;
    }
    this.micError.set('');
    try {
      const drive = await this.mic.start(deps);
      this.cadence.reset();
      this.drive.set(drive);
    } catch (e) {
      const name = (e as { name?: string } | null)?.name;
      this.micError.set(
        name === 'NotAllowedError'
          ? 'Microphone permission was refused — allow it in the browser to lip-sync.'
          : name === 'NotFoundError'
            ? 'No microphone was found.'
            : 'The microphone could not be started.',
      );
    }
  }

  stopMic(): void {
    const drive = this.drive();
    if (!drive) {
      return;
    }
    this.drive.set(null);
    drive.stop();
    this.cadence.reset();
    this.live.set('closed');
  }

  /** The URL of this cam in capture mode — what OBS captures as a window. */
  captureUrl(): string {
    if (typeof location === 'undefined') {
      return '';
    }
    const u = new URL(location.href);
    u.searchParams.set('capture', '1');
    u.searchParams.set('bg', this.background() === 'transparent' ? 'green' : this.background());
    u.searchParams.set('expression', this.expression());
    if (this.avatarId()) {
      u.searchParams.set('avatar', this.avatarId());
    }
    return u.toString();
  }

  popOut(): void {
    window.open(this.captureUrl(), 'hug-avatar-cam', 'width=720,height=1080,menubar=no,toolbar=no,location=no,status=no');
  }
}
