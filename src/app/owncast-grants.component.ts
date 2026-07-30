import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { OwncastService, OwncastGrant, OwncastApiError } from './owncast.service';
import { SessionService } from './session.service';

type GrantAction = 'grant' | 'timeout' | 'ban';

const GRANT_ACTIONS: ReadonlyArray<GrantAction> = ['grant', 'timeout', 'ban'];

/** Type-guard validating that a raw string (e.g. a template `<select>` value)
 *  is really one of the {@link GrantAction} literals, rather than blindly
 *  asserting it via `as GrantAction`. */
function isGrantAction(a: string): a is GrantAction {
  return (GRANT_ACTIONS as readonly string[]).includes(a);
}

/**
 * The BROADCAST GRANTS console — the grant / timeout / ban / restore overlay
 * over /bff/owncast/admin/access/** (OwncastBroadcastController) plus the
 * SUPERADMIN-only list-active + history over /bff/owncast/superadmin/access.
 * Manage-gated (owncastManageGuard: ADMIN|SUPERADMIN); a streamer/mod never
 * reaches it. This gates whether a domain-user's stream may broadcast (go
 * public) — broadcast is DEFAULT-DENY and a grant is the ONLY thing that confers
 * it.
 *
 *   grant   → POST /bff/owncast/admin/access/grant    (a permanent broadcast grant)
 *   timeout → POST /bff/owncast/admin/access/timeout  (a bounded ban; auto-restores)
 *   ban     → POST /bff/owncast/admin/access/ban      (a permanent ban; denies even
 *             an active grantee — ban>grant, surfaced clearly)
 *   restore → DELETE /bff/owncast/admin/access/banned/{user}    (lift a ban/timeout)
 *   remove  → DELETE /bff/owncast/admin/access/broadcast/{user} (remove a grant)
 *   list    → GET /bff/owncast/superadmin/access (SUPERADMIN: active overrides)
 *   history → GET /bff/owncast/superadmin/access/{user}/history (SUPERADMIN)
 *
 * The list-active + history reads are SUPERADMIN-only at the bff (the
 * /superadmin/** path gate). So an ADMIN sees the action form only; a SUPERADMIN
 * additionally sees the active-grants list + the per-principal history.
 *
 * a11y: a labelled fieldset for the action form; each control has a <label> +
 * aria-describedby help; the result/error is announced (role="status"/"alert");
 * a clear note that BAN takes precedence over any grant.
 */
@Component({
  selector: 'hug-owncast-grants',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './owncast-grants.component.html',
  styleUrl: './owncast-grants.component.scss',
})
export class OwncastGrantsComponent implements OnInit {
  private readonly owncast = inject(OwncastService);
  private readonly session = inject(SessionService);

  /** SUPERADMIN — gates the list-active + history panels (the bff /superadmin/**). */
  readonly canManageAll = this.session.canManageAll;

  // ── action form ──
  readonly action = signal<GrantAction>('grant');
  readonly userSubject = signal('');
  readonly reason = signal('');
  /** timeout duration in hours (converted to ttlSeconds on submit). */
  readonly timeoutHours = signal(24);

  readonly busy = signal(false);
  readonly error = signal('');
  readonly result = signal<OwncastGrant | null>(null);
  readonly notice = signal('');
  readonly touched = signal(false);

  // ── active list (SUPERADMIN) ──
  readonly active = signal<OwncastGrant[]>([]);
  readonly activeLoading = signal(false);
  readonly activeError = signal('');

  // ── history (SUPERADMIN) ──
  readonly historyUser = signal('');
  readonly history = signal<OwncastGrant[] | null>(null);
  readonly historyLoading = signal(false);
  readonly historyError = signal('');

  readonly actions: ReadonlyArray<{ value: GrantAction; label: string; help: string }> = [
    { value: 'grant', label: 'Grant broadcast', help: 'Give a user permanent broadcast access (lets their stream go public).' },
    { value: 'timeout', label: 'Time out', help: 'Block a user from broadcast for a bounded window; access auto-restores when it expires.' },
    { value: 'ban', label: 'Ban', help: 'Permanently block a user from broadcast. A ban takes precedence over any grant.' },
  ];

  /** The help text for the currently selected action, looked up by matching
   *  {@link action} against `actions` (rather than by hard-coded array
   *  position) so it stays correct even if `actions` is reordered. */
  readonly actionHelp = computed(
    () => this.actions.find((a) => a.value === this.action())?.help ?? '',
  );

  /** Stable @for trackBy for the active-grants and history lists. */
  trackGrantId = (_: number, g: OwncastGrant): string => g.id;

  ngOnInit(): void {
    // Eagerly load the active-grants list for superadmins so the panel is
    // pre-populated when the view renders (admins skip this — no list panel).
    if (this.canManageAll()) void this.reloadActive();
  }

  /** Switch the active action and clear the previous result/error/notice.
   *  Falls back to 'grant' when `a` isn't a recognised {@link GrantAction}
   *  (e.g. an unexpected control value) rather than accepting it as-is. */
  setAction(a: string): void {
    this.action.set(isGrantAction(a) ? a : 'grant');
    this.result.set(null);
    this.error.set('');
    this.notice.set('');
  }

  /** True when the user-subject field is empty after the form was touched
   *  (drives the aria-invalid + validation-message binding). */
  userInvalid(): boolean {
    return this.touched() && this.userSubject().trim().length === 0;
  }
  /** True when the timeout-hours field is invalid after the form was touched
   *  (must be > 0 for a timeout action). */
  ttlInvalid(): boolean {
    return this.action() === 'timeout' && this.touched() && !(this.timeoutHours() > 0);
  }
  /** Overall form validity — gates the submit call (also checked in submit()
   *  after marking touched, as a belt-and-braces check). */
  formValid(): boolean {
    if (this.userSubject().trim().length === 0) return false;
    if (this.action() === 'timeout' && !(this.timeoutHours() > 0)) return false;
    return true;
  }

  async submit(): Promise<void> {
    this.touched.set(true);
    this.error.set('');
    this.notice.set('');
    this.result.set(null);
    if (!this.formValid()) return;
    this.busy.set(true);
    const user = this.userSubject().trim();
    const reason = this.reason().trim() || undefined;
    try {
      let row: OwncastGrant;
      switch (this.action()) {
        case 'grant':
          row = await this.owncast.grant({ userSubject: user, reason });
          break;
        case 'ban':
          row = await this.owncast.ban({ userSubject: user, reason });
          break;
        case 'timeout':
        default:
          row = await this.owncast.timeout({
            userSubject: user,
            ttlSeconds: Math.round(this.timeoutHours() * 3600),
            reason,
          });
          break;
      }
      this.result.set(row);
      if (this.canManageAll()) void this.reloadActive();
    } catch (e) {
      this.error.set(this.message(e));
    } finally {
      this.busy.set(false);
    }
  }

  /** Lift a ban/timeout (restore broadcast). */
  async restore(user: string): Promise<void> {
    await this.runRevoke('banned', user, `Ban lifted for ${user} — broadcast restored.`);
  }
  /** Remove a grant. */
  async removeGrant(user: string): Promise<void> {
    await this.runRevoke('broadcast', user, `Broadcast grant removed for ${user}.`);
  }

  private async runRevoke(type: 'broadcast' | 'banned', user: string, ok: string): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      await this.owncast.revoke(type, user);
      this.notice.set(ok);
      this.result.set(null);
      if (this.canManageAll()) void this.reloadActive();
    } catch (e) {
      this.error.set(this.message(e));
    } finally {
      this.busy.set(false);
    }
  }

  async reloadActive(): Promise<void> {
    this.activeLoading.set(true);
    this.activeError.set('');
    try {
      const res = await this.owncast.listActiveGrants();
      this.active.set(res.access ?? []);
    } catch (e) {
      this.activeError.set(this.message(e, 'active grants'));
    } finally {
      this.activeLoading.set(false);
    }
  }

  async loadHistory(): Promise<void> {
    const user = this.historyUser().trim();
    if (user.length === 0) return;
    this.historyLoading.set(true);
    this.historyError.set('');
    try {
      const res = await this.owncast.grantHistory(user);
      this.history.set(res.access ?? []);
    } catch (e) {
      this.history.set(null);
      this.historyError.set(this.message(e, 'history'));
    } finally {
      this.historyLoading.set(false);
    }
  }

  private message(e: unknown, what = ''): string {
    if (e instanceof OwncastApiError && e.isForbidden) {
      return what
        ? `The server denied access to the ${what} — superadmin is required.`
        : 'The server denied this action — your role does not permit managing broadcast grants.';
    }
    return what
      ? `Could not load the ${what}. Please try again.`
      : 'Could not apply the broadcast change. Please try again.';
  }
}
