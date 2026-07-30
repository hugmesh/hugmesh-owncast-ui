import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

import { OwncastService, ModStream, OwncastApiError } from './owncast.service';
import { SessionService } from './session.service';

/**
 * The MODERATION view — the mod/admin/superadmin surface for reviewing streams
 * and acting on ones that break the rules (the mod moderates; admin/superadmin
 * inherit). Mod-gated (owncastModGuard: MOD|ADMIN|SUPERADMIN); a plain streamer
 * never reaches it.
 *
 * It wraps /bff/owncast/mod/** (OwncastModController; defence-in-depth — the bff
 * @PreAuthorize is authoritative, the route guard + the role-shown controls are
 * UX):
 *
 *   list    → GET  /bff/owncast/mod/streams              (every stream in the brand)
 *   hide    → POST /bff/owncast/mod/streams/{owner}/hide (force visibility=internal)
 *   kill    → POST /bff/owncast/mod/streams/{owner}/ban  (ban broadcast + force internal)
 *   restore → POST /bff/owncast/mod/streams/{owner}/restore (revoke the ban)
 *
 * Per-row affordances mirror the bff exactly:
 *   Hide    — shown/enabled only while visibility=='public' (disabled +
 *             help-text "Already private" when internal).
 *   Kill    — shown while NOT banned; confirm-gated (KILL is destructive: the
 *             streamer is banned from broadcasting until restored); disabled +
 *             help-text "Already banned" when banned.
 *   Restore — shown while banned; revokes the ban (does NOT auto-republish).
 *
 * a11y: a labelled feed region; every action button carries an accessible name
 * that includes the stream identity (e.g. "Kill stream of <owner>"); the BANNED
 * badge has TEXT (not just colour); the confirm is the keyboard-accessible
 * native dialog; loading / empty / error states are announced.
 */
@Component({
  selector: 'hug-owncast-moderation',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './owncast-moderation.component.html',
  styleUrl: './owncast-moderation.component.scss',
})
export class OwncastModerationComponent implements OnInit {
  private readonly owncast = inject(OwncastService);
  private readonly session = inject(SessionService);

  /** The confirm prompt shown before a KILL (destructive: bans broadcast). */
  static readonly KILL_CONFIRM =
    'Kill this stream? The streamer is banned from broadcasting until restored.';
  readonly killConfirm = OwncastModerationComponent.KILL_CONFIRM;

  /** Help-text paired with a DISABLED action so the disabled state always has a
   *  visible reason. */
  static readonly ALREADY_PRIVATE_HELP = 'Already private';
  static readonly ALREADY_BANNED_HELP = 'Already banned';
  readonly alreadyPrivateHelp = OwncastModerationComponent.ALREADY_PRIVATE_HELP;
  readonly alreadyBannedHelp = OwncastModerationComponent.ALREADY_BANNED_HELP;

  /** Whether the moderator role can moderate (defence-in-depth; the guard + bff
   *  are authoritative). Always true when this view renders (mod-gated route). */
  readonly canModerate = this.session.canModerate;

  readonly streams = signal<ModStream[]>([]);
  readonly loading = signal(true);
  readonly loadError = signal('');
  /** The ownerSubject of the row whose action is in flight (disables that row). */
  readonly busyOwner = signal<string | null>(null);
  readonly actionError = signal('');
  readonly notice = signal('');

  trackOwner = (_: number, s: ModStream): string => s.ownerSubject;

  ngOnInit(): void {
    void this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.loadError.set('');
    try {
      const list = await this.owncast.listModStreams();
      this.streams.set(list ?? []);
    } catch (e) {
      this.streams.set([]);
      this.loadError.set(this.message(e, 'load'));
    } finally {
      this.loading.set(false);
    }
  }

  /** Force a public stream to internal. */
  async hide(s: ModStream): Promise<void> {
    await this.run(s.ownerSubject, () => this.owncast.hideStream(s.ownerSubject),
      `Stream of ${s.ownerSubject} is now private.`);
  }

  /** KILL — ban the streamer from broadcasting + force internal. Confirm-gated. */
  async kill(s: ModStream): Promise<void> {
    if (!this.confirmKill()) return;
    await this.run(s.ownerSubject, () => this.owncast.killStream(s.ownerSubject),
      `Stream of ${s.ownerSubject} was killed — the streamer is banned from broadcasting.`);
  }

  /** Restore — revoke the ban (the stream stays internal). */
  async restore(s: ModStream): Promise<void> {
    await this.run(s.ownerSubject, () => this.owncast.restoreStream(s.ownerSubject),
      `Ban lifted for ${s.ownerSubject} — they may be re-granted broadcast.`);
  }

  /** Overridable confirm seam (window.confirm is the keyboard-accessible native
   *  dialog; a spec stubs this to assert the confirm-then-POST contract). */
  protected confirmKill(): boolean {
    return typeof window === 'undefined' ? true : window.confirm(this.killConfirm);
  }

  /** Run an action for one row, then optimistically patch that row from the
   *  returned ModStream (and reload to stay in sync with the brand). */
  private async run(
    owner: string,
    op: () => Promise<ModStream>,
    ok: string,
  ): Promise<void> {
    this.busyOwner.set(owner);
    this.actionError.set('');
    this.notice.set('');
    try {
      const updated = await op();
      // Optimistically reflect the new banned/visibility state on the row…
      if (updated) {
        this.streams.update((rows) =>
          rows.map((r) => (r.ownerSubject === owner ? { ...r, ...updated } : r)),
        );
      }
      this.notice.set(ok);
      // …and refresh from the bff so the list is authoritative.
      await this.reload();
    } catch (e) {
      this.actionError.set(this.message(e, 'action', owner));
    } finally {
      this.busyOwner.set(null);
    }
  }

  private message(e: unknown, kind: 'load' | 'action', owner = ''): string {
    if (e instanceof OwncastApiError && e.isForbidden) {
      return 'The server denied this action — your role does not permit moderating streams.';
    }
    if (e instanceof OwncastApiError && e.isNotFound) {
      return owner
        ? `No stream found for ${owner} in your brand — it may have just been removed.`
        : 'That stream no longer exists in your brand.';
    }
    return kind === 'load'
      ? 'Could not load streams to moderate. Please try again.'
      : 'Could not apply the moderation action. Please try again.';
  }
}
