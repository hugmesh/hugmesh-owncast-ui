import { Injectable, signal, computed } from '@angular/core';

export interface SnapSession {
  id: string;                 // casdoor identity, e.g. google:alice@gmail.com
  label: string;              // display (email or discord handle)
  provider: 'google' | 'discord';
  roles: string[];
  registrationComplete: boolean;
}

/** Holds the logged-in session (persisted to localStorage) and derives the
 *  Casdoor-style role flags the owncast console gates its views on.
 *
 *  This is the canonical HugMesh SessionService (copied from hugmesh-wiki-ui /
 *  hugmesh-mod-ui / hugmesh-admin-ui, the references with the full role-tier
 *  accessors) so this remote gates on the SAME JWT-derived signals as the other
 *  consoles. Roles are the lowercase Casdoor roles 'user'/'mod'/'admin'/'superadmin'
 *  (+ the per-service 'owncast' access role). The reserved-prefix ROLE_/DOMAIN_ has
 *  already been stripped upstream (the gateway / BFF converter), so the role strings
 *  here are the bare lowercase tokens.
 *
 *  ── The owncast role model (mirrors hugmesh-owncast-bff-api SecurityConfig +
 *     OwncastBroadcastController / OwncastStreamController) ──
 *  STREAM   = ROLE_OWNCAST                 → the streamer's OWN "My Stream" console
 *                                            (get/upsert title+description, flip
 *                                            visibility; a PUBLIC flip is gated
 *                                            server-side on an active broadcast grant).
 *  MANAGE   = ADMIN | SUPERADMIN           → the Broadcast Grants console
 *                                            (grant/timeout/ban/restore + list/history).
 *  MODERATE = MOD | ADMIN | SUPERADMIN     → the moderation view (list/flag streams).
 *
 *  The signals here are DEFENCE-IN-DEPTH (convenience gating). The owncast-bff
 *  @PreAuthorize + OwncastBroadcastGuard are authoritative; the UI never SHOWS an
 *  option the role cannot use, and still handles a 403 gracefully if the server
 *  disagrees (canonically: a PUBLIC flip with no active broadcast grant). */
@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly key = 'hug.session';
  private readonly channel = 'hug-session-change';
  readonly session = signal<SnapSession | null>(this.load());
  readonly loggedIn = computed(() => this.session() !== null);

  /** The raw Casdoor roles of the current session (empty when logged out). */
  private readonly roles = computed(() => this.session()?.roles ?? []);

  /** USER tier: every authenticated user. Casdoor always grants 'user'; we treat
   *  any logged-in session as the USER tier. */
  readonly isUser = computed(() => this.loggedIn());

  /** ADMIN tier: a Casdoor 'admin' role. (A SUPERADMIN is NOT automatically an
   *  admin in the raw role set — the owncast composites below add SUPERADMIN where
   *  the cascade requires it, matching the bff SpEL exactly.) */
  readonly isAdmin = computed(() => this.roles().includes('admin'));

  /** SUPERADMIN tier: a Casdoor 'superadmin' role. */
  readonly isSuperadmin = computed(() => this.roles().includes('superadmin'));

  /** MOD tier: a Casdoor 'mod' OR 'admin' role (matching the platform-wide
   *  defence-in-depth hasAnyRole('MOD','ADMIN')). */
  readonly isMod = computed(() => {
    const r = this.roles();
    return r.includes('mod') || r.includes('admin');
  });

  /** The per-service owncast access role (ROLE_OWNCAST) — the base service-role
   *  floor that lets a domain user reach the streamer self-service surface. */
  readonly hasOwncastRole = computed(() => this.roles().includes('owncast'));

  // ── Owncast role composites (mirror the owncast-bff SecurityConfig path gates
  //    + the OwncastBroadcastController @PreAuthorize composites) ──

  /** STREAM = ROLE_OWNCAST. Gates the streamer's OWN "My Stream" console
   *  (/bff/owncast/user/**). A user without ROLE_OWNCAST is sent to /owncast/
   *  forbidden — they cannot reach the streamer surface at all. */
  readonly canStream = computed(() => this.hasOwncastRole());

  /** MANAGE = ADMIN | SUPERADMIN. Gates the Broadcast Grants console
   *  (grant/timeout/ban/restore over /bff/owncast/admin/access/** + the
   *  list/history over /bff/owncast/superadmin/access). An admin governs only
   *  their own brand; a superadmin is cross-domain. */
  readonly canManage = computed(() => this.isAdmin() || this.isSuperadmin());

  /** SUPERADMIN — the manage-all read surface (/bff/owncast/superadmin/**:
   *  list-active + history). An ADMIN can grant/timeout/ban but the list-all +
   *  history reads are SUPERADMIN-only at the bff, so the console shows those
   *  panels only to a superadmin (an admin still grants via the action form). */
  readonly canManageAll = computed(() => this.isSuperadmin());

  /** MODERATE = MOD | ADMIN | SUPERADMIN. Gates the moderation view (list/flag
   *  streams). The mod moderates; admin/superadmin inherit. */
  readonly canModerate = computed(() => this.isMod() || this.isSuperadmin());

  constructor() {
    // The host shell and each federated remote each hold their OWN SessionService
    // instance over the same localStorage key. Re-read on a same-document broadcast
    // (dispatched by whichever instance wrote) and on cross-tab storage events, so
    // every nav/guard reading this signal stays in sync.
    if (typeof window !== 'undefined') {
      window.addEventListener(this.channel, () => this.session.set(this.load()));
      window.addEventListener('storage', (e) => { if (e.key === this.key) this.session.set(this.load()); });
    }
  }

  private load(): SnapSession | null {
    try { const raw = localStorage.getItem(this.key); return raw ? JSON.parse(raw) : null; }
    catch { return null; }
  }
  set(s: SnapSession): void { localStorage.setItem(this.key, JSON.stringify(s)); this.session.set(s); this.broadcast(); }
  patch(p: Partial<SnapSession>): void { const s = this.session(); if (s) this.set({ ...s, ...p }); }
  clear(): void { localStorage.removeItem(this.key); this.session.set(null); this.broadcast(); }
  /** Notify the other in-page SessionService instances (host + remotes) to re-read. */
  private broadcast(): void { if (typeof window !== 'undefined') window.dispatchEvent(new Event(this.channel)); }
}
