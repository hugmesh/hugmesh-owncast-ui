import {
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { OwncastService, OwncastStream, OwncastApiError, Visibility } from './owncast.service';

/**
 * Minimal structural typing for an hls.js instance + constructor, used ONLY when
 * a federation host has already loaded hls.js onto `window` (`window.Hls`). We do
 * NOT take a hard npm dependency on hls.js — when it is absent the player falls
 * back to NATIVE HLS playback (Safari / WebKit / any browser whose <video> can
 * play `application/vnd.apple.mpegurl`). This keeps the change additive.
 */
interface HlsInstance {
  loadSource(url: string): void;
  attachMedia(video: HTMLVideoElement): void;
  on(event: string, cb: (...args: unknown[]) => void): void;
  destroy(): void;
}
interface HlsCtor {
  new (config?: unknown): HlsInstance;
  isSupported(): boolean;
  Events: { MANIFEST_PARSED: string; ERROR: string };
}
function resolveHls(): HlsCtor | null {
  const g = globalThis as unknown as { Hls?: HlsCtor };
  return g.Hls && typeof g.Hls.isSupported === 'function' && g.Hls.isSupported()
    ? g.Hls
    : null;
}

/**
 * The streamer's "My Stream" console — the self-service surface over
 * /bff/owncast/user/stream (OwncastStreamController). Stream-gated
 * (owncastStreamGuard: ROLE_OWNCAST).
 *
 *   load   → GET /bff/owncast/user/stream         (404 = no stream yet)
 *   save   → PUT /bff/owncast/user/stream          (upsert title + description)
 *   flip   → PUT /bff/owncast/user/stream/visibility ('internal' | 'public')
 *
 * ── THE CANONICAL DISABLED+HELPTEXT GATE ──
 * The PUBLIC visibility option is DISABLED with the visible help-text
 *   "You need an active broadcast grant from an admin to go public"
 * whenever the streamer does NOT (yet) have a confirmed active broadcast grant.
 * The bff has NO can-broadcast/status endpoint — broadcast is default-deny +
 * grant-only and a static UI cannot consult the DB — so this UI is FAIL-CLOSED:
 * the public option starts disabled, and the ONLY way to confirm a grant is to
 * attempt the flip. The "Try going public" action attempts the PUT; a 403
 * (OwncastBroadcastGuard deny) CONFIRMS there is no active grant and keeps the
 * public option disabled with the help-text; a success means the grant is live,
 * the stream is now public, and the public option is enabled thereafter. This
 * mirrors the bff gate exactly: the UI NEVER claims the flip will succeed when
 * the bff would 403.
 *
 * The "Preview" card renders a real in-platform HLS player (hls.js-preferred,
 * native-`<video>` fallback — see {@link attachPlayer}) bound to the stream's
 * typed `playbackUrl`.
 *
 * a11y: labelled fields with describedby help; the visibility radiogroup is a
 * real fieldset; the DISABLED public radio is paired with VISIBLE help-text
 * explaining WHY; loading / empty (no stream yet) / error states are announced.
 */
@Component({
  selector: 'hug-owncast-stream',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './owncast-stream.component.html',
  styleUrl: './owncast-stream.component.scss',
})
export class OwncastStreamComponent implements OnInit, OnDestroy {
  private readonly owncast = inject(OwncastService);

  /** The <video> element the HLS player attaches to. Present only once a
   *  playbackUrl exists and the preview card renders. */
  @ViewChild('player') private playerRef?: ElementRef<HTMLVideoElement>;

  /** The help-text shown beside the DISABLED public option — the canonical
   *  disabled+helptext pairing. */
  static readonly PUBLIC_GATE_HELP =
    'You need an active broadcast grant from an admin to go public';
  readonly publicGateHelp = OwncastStreamComponent.PUBLIC_GATE_HELP;

  readonly stream = signal<OwncastStream | null>(null);
  readonly loading = signal(true);
  /** True after a 404 — the streamer has no stream yet; the form creates one. */
  readonly noStreamYet = signal(false);
  readonly loadError = signal('');

  // editable fields
  readonly title = signal('');
  readonly description = signal('');

  // save state
  readonly saving = signal(false);
  readonly saveError = signal('');
  readonly saveNotice = signal('');

  // visibility-flip state
  readonly flipping = signal(false);
  readonly flipError = signal('');
  readonly flipNotice = signal('');

  /**
   * Whether the streamer is KNOWN to have an active broadcast grant. The bff has
   * no status endpoint, so this is FAIL-CLOSED: it only becomes true after a
   * PUBLIC flip SUCCEEDS (proving the grant is live). A 403 on a flip resets it
   * to false. While false, the public option is disabled + help-texted.
   */
  readonly broadcastConfirmed = signal(false);

  /** The current persisted visibility ('internal' | 'public' | '' before load). */
  readonly currentVisibility = computed<string>(() => this.stream()?.visibility ?? '');
  readonly isPublic = computed(() => this.currentVisibility() === 'public');

  // ── In-platform HLS player state ──
  /** The HLS manifest URL for the loaded stream (the bff's typed playbackUrl).
   *  Empty when the stream has no playback origin yet → the empty-state card. */
  readonly playbackUrl = computed<string>(() => this.stream()?.playbackUrl?.trim() ?? '');
  readonly hasPlayback = computed(() => this.playbackUrl().length > 0);
  /** True while the player is wiring up the source (before the manifest loads). */
  readonly playerLoading = signal(false);
  /** Set when neither hls.js nor native HLS can play the source, or the media
   *  element reports an error. Announced in role="alert". */
  readonly playerError = signal('');
  /** The active hls.js instance (when hls.js is present), kept for teardown. */
  private hls: HlsInstance | null = null;
  private mediaErrorHandler: (() => void) | null = null;
  private attachedUrl = '';

  constructor() {
    // Re-attach the player whenever the playbackUrl changes (and the <video> is
    // in the DOM). The effect runs after render so playerRef is populated.
    effect(() => {
      const url = this.playbackUrl();
      // Read the signal so the effect re-runs when it changes; actual DOM wiring
      // is deferred to a microtask so @ViewChild has resolved post-render.
      queueMicrotask(() => this.attachPlayer(url));
    });
  }

  /**
   * Whether the PUBLIC radio option is DISABLED. Disabled (fail-closed) UNTIL a
   * broadcast grant is confirmed (a flip succeeded) OR the stream is ALREADY
   * public (the bff already let it be public, so the grant is/was live). The
   * disabled state ALWAYS pairs with the visible publicGateHelp text.
   */
  readonly publicDisabled = computed(() => !this.broadcastConfirmed() && !this.isPublic());

  ngOnInit(): void {
    void this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.loadError.set('');
    this.noStreamYet.set(false);
    try {
      const s = await this.owncast.getMyStream();
      this.applyStream(s);
    } catch (e) {
      if (e instanceof OwncastApiError && e.isNotFound) {
        // No stream yet — the upsert form will create one (internal, fail-closed).
        this.stream.set(null);
        this.noStreamYet.set(true);
        this.title.set('');
        this.description.set('');
      } else {
        this.loadError.set('Could not load your stream. Please try again.');
      }
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Apply a freshly-loaded or freshly-upserted {@link OwncastStream} to the
   * component signals. Syncs the editable `title`/`description` fields and,
   * if the bff reports the stream is already `'public'`, flips
   * {@link broadcastConfirmed} to true — the bff would not let it be public
   * unless the grant was (or still is) live, so this is the authoritative
   * signal that the broadcast gate is open.
   *
   * @param s - The stream DTO as returned by the bff.
   */
  private applyStream(s: OwncastStream): void {
    this.stream.set(s);
    this.title.set(s.title ?? '');
    this.description.set(s.description ?? '');
    // If the bff reports the stream is already public, the grant is live.
    if (s.visibility === 'public') this.broadcastConfirmed.set(true);
  }

  /** Upsert title + description (creates the stream on the first save). */
  async save(): Promise<void> {
    this.saving.set(true);
    this.saveError.set('');
    this.saveNotice.set('');
    try {
      const s = await this.owncast.upsertMyStream({
        title: this.title().trim(),
        description: this.description().trim(),
      });
      this.applyStream(s);
      this.noStreamYet.set(false);
      this.saveNotice.set('Your stream details were saved.');
    } catch (e) {
      this.saveError.set(this.message(e));
    } finally {
      this.saving.set(false);
    }
  }

  /** Flip visibility. A flip to INTERNAL always succeeds; a flip to PUBLIC is
   *  gated server-side on an active broadcast grant — a 403 confirms no grant
   *  (fail-closed: public stays disabled + help-texted). */
  async setVisibility(target: Visibility): Promise<void> {
    // Guard against attempting a disabled public flip from the UI.
    if (target === 'public' && this.publicDisabled()) {
      // Surface the gate without a round-trip we already know would 403.
      this.flipError.set(this.publicGateHelp + '.');
      return;
    }
    this.flipping.set(true);
    this.flipError.set('');
    this.flipNotice.set('');
    try {
      const s = await this.owncast.setVisibility(target);
      this.applyStream(s);
      if (target === 'public') {
        this.broadcastConfirmed.set(true);
        this.flipNotice.set('Your stream is now public.');
      } else {
        this.flipNotice.set('Your stream is now internal (visible only inside your brand).');
      }
    } catch (e) {
      if (e instanceof OwncastApiError && e.isForbidden) {
        // The OwncastBroadcastGuard deny — no active broadcast grant. Fail closed.
        this.broadcastConfirmed.set(false);
        this.flipError.set(this.publicGateHelp + '.');
      } else {
        this.flipError.set('Could not change your stream visibility. Please try again.');
      }
    } finally {
      this.flipping.set(false);
    }
  }

  /** "Try going public" — attempts the PUBLIC flip even while we have not yet
   *  confirmed a grant. A 403 reflects the deny; a success confirms the grant
   *  and enables the public option thereafter. This is how a freshly-granted
   *  streamer transitions out of the fail-closed disabled state. */
  async tryGoPublic(): Promise<void> {
    this.flipping.set(true);
    this.flipError.set('');
    this.flipNotice.set('');
    try {
      const s = await this.owncast.setVisibility('public');
      this.applyStream(s);
      this.broadcastConfirmed.set(true);
      this.flipNotice.set('Your stream is now public.');
    } catch (e) {
      if (e instanceof OwncastApiError && e.isForbidden) {
        this.broadcastConfirmed.set(false);
        this.flipError.set(this.publicGateHelp + '.');
      } else {
        this.flipError.set('Could not change your stream visibility. Please try again.');
      }
    } finally {
      this.flipping.set(false);
    }
  }

  /**
   * Wire the <video> element to the HLS source. Prefers hls.js when a federation
   * host has loaded it (Media Source Extensions, broad browser support); else
   * falls back to NATIVE HLS for browsers whose <video> can play an HLS manifest
   * directly. If neither is possible, surfaces a player error (role="alert").
   * Idempotent: re-attaching the same URL is a no-op.
   */
  private attachPlayer(url: string): void {
    const video = this.playerRef?.nativeElement;
    if (!video) return;
    if (!url) {
      this.teardownPlayer();
      this.attachedUrl = '';
      return;
    }
    if (url === this.attachedUrl) return;

    this.teardownPlayer();
    this.attachedUrl = url;
    this.playerError.set('');
    this.playerLoading.set(true);

    const Hls = resolveHls();
    if (Hls) {
      const hls = new Hls();
      this.hls = hls;
      hls.on(Hls.Events.MANIFEST_PARSED, () => this.playerLoading.set(false));
      hls.on(Hls.Events.ERROR, () => {
        this.playerLoading.set(false);
        this.playerError.set('The stream player could not load this stream.');
      });
      hls.loadSource(url);
      hls.attachMedia(video);
      return;
    }

    // Native HLS (e.g. Safari / WebKit): the <video> can play the manifest URL.
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      const onError = () => {
        this.playerLoading.set(false);
        this.playerError.set('The stream player could not load this stream.');
      };
      this.mediaErrorHandler = onError;
      video.addEventListener('error', onError);
      video.addEventListener('loadeddata', () => this.playerLoading.set(false), { once: true });
      video.src = url;
      return;
    }

    // Neither path is available in this browser.
    this.playerLoading.set(false);
    this.playerError.set(
      'In-platform playback is not supported by this browser. Open the stream in a player that supports HLS.',
    );
  }

  private teardownPlayer(): void {
    if (this.hls) {
      try {
        this.hls.destroy();
      } catch {
        /* ignore teardown errors */
      }
      this.hls = null;
    }
    const video = this.playerRef?.nativeElement;
    if (video && this.mediaErrorHandler) {
      video.removeEventListener('error', this.mediaErrorHandler);
    }
    this.mediaErrorHandler = null;
  }

  ngOnDestroy(): void {
    this.teardownPlayer();
  }

  private message(e: unknown): string {
    if (e instanceof OwncastApiError && e.isForbidden) {
      return 'The server denied this action — your role does not permit it.';
    }
    return 'Could not save your stream. Please try again.';
  }
}
