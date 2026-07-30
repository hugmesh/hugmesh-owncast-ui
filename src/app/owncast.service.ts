import { Injectable, InjectionToken, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ApiConfiguration } from './api/api-configuration';
import { OwncastStreamSelfService } from './api/services/owncast-stream-self.service';
import { OwncastBroadcastAccessService } from './api/services/owncast-broadcast-access.service';
import { OwncastModerationService } from './api/services/owncast-moderation.service';
import { AccessList as GenAccessList } from './api/models/access-list';
import { ActionResult as GenActionResult } from './api/models/action-result';
import { StreamList as GenStreamList } from './api/models/stream-list';

/** Base URL of the owncast BFF. The fe-gateway proxies same-origin
 *  /bff/owncast/** to hugmesh-owncast-bff-api (the streamer self-service +
 *  broadcast grant/timeout/ban overlay), so the default is the empty string =
 *  same origin. `globalThis.__HUG_OWNCAST_URL__` lets the host override the
 *  target at runtime (mirrors the other remotes' __HUG_*_URL__ globals).
 *
 *  The ng-openapi-gen client's {@link ApiConfiguration.rootUrl} is seeded from
 *  this token in the {@link OwncastService} constructor, so the host override
 *  still steers every generated call. */
export const OWNCAST_BASE_URL = new InjectionToken<string>('OWNCAST_BASE_URL', {
  factory: () => (globalThis as Record<string, unknown>)['__HUG_OWNCAST_URL__'] as string ?? '',
});

// ---------------------------------------------------------------------------
// Contract — mirrors hugmesh-owncast-bff-api OwncastStreamDto + OwncastAccessDto.
// These are the EXACT JSON shapes the bff returns. As of the ng-openapi-gen
// adoption, src/app/api/ is GENERATED from the bff's committed openapi.json
// (`npm run gen:spec`) and this service is the thin wrapper over the generated,
// typed client — the public method signatures + DTO types HERE are the stable
// contract the components consume, and the generated models are bridged at the
// delegation boundary. See README "Typed API client".
// ---------------------------------------------------------------------------

/** OwncastStreamDto.Stream — an owncast_stream row as returned to its OWNING
 *  streamer. visibility = 'internal' (default, fail-closed) | 'public' (only an
 *  owner who holds an active broadcast grant may set/keep this). playbackUrl is
 *  the in-platform HLS manifest URL for the stream (may be absent when the bff
 *  has no playback origin to offer yet). */
export interface OwncastStream {
  id: string;
  domain: string;
  userSubject: string;
  title: string;
  description: string;
  visibility: string;
  createdAt: string;
  updatedAt: string;
  playbackUrl?: string;
}

/** OwncastStreamDto.Upsert — PUT /bff/owncast/user/stream (owner + domain
 *  stamped from the JWT). Both fields optional free text. */
export interface UpsertStream {
  title: string;
  description: string;
}

/** The two canonical visibility values (OwncastStream.VISIBILITY_*). */
export type Visibility = 'internal' | 'public';

/** OwncastAccessDto.Access — an owncast_grant overlay row. accessType =
 *  'broadcast' (a GRANT letting a USER broadcast) | 'banned' (a ban/timeout);
 *  state = 'active' | 'revoked'. expiresAt set (future) = a timeout; null =
 *  permanent. */
export interface OwncastGrant {
  id: string;
  domain: string;
  userSubject: string;
  accessType: string;
  state: string;
  grantedBySubject: string;
  reason: string | null;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
}

/** OwncastAccessDto.AccessList. */
export interface GrantList {
  access: OwncastGrant[];
}

/** OwncastModDto.ModStream — a stream row as returned to a MODERATOR over
 *  /bff/owncast/mod/streams. Scoped to the moderator's brand; read-only here
 *  (the hide/ban/restore actions mutate it). `banned` reflects the active
 *  owncast_grant banned override on the owner; `visibility` is the current
 *  stream visibility. */
export interface ModStream {
  ownerSubject: string;
  domain: string;
  title: string;
  visibility: Visibility;
  banned: boolean;
}

/** OwncastAccessDto.GrantOrBan — POST .../access/grant and .../access/ban. */
export interface GrantOrBan {
  userSubject: string;
  reason?: string;
}

/** OwncastAccessDto.Timeout — POST .../access/timeout (banned override, future expiry). */
export interface TimeoutBody {
  userSubject: string;
  ttlSeconds: number;
  reason?: string;
}

/** A typed error the service raises so components can surface the EXACT failure
 *  the bff returned — in particular the 403 the OwncastBroadcastGuard returns on
 *  a PUBLIC visibility flip WITHOUT an active broadcast grant (the canonical
 *  default-deny signal), and the 404 when a streamer has no stream yet. */
export class OwncastApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'OwncastApiError';
  }
  /** A 403 — the OwncastBroadcastGuard denying a PUBLIC flip (no active broadcast
   *  grant) or the @PreAuthorize denying a govern/manage action. The
   *  server-authoritative denial (the UI gating is only convenience). */
  get isForbidden(): boolean {
    return this.status === 403;
  }
  /** A 404 — the streamer has no owncast_stream row yet (a first upsert creates it). */
  get isNotFound(): boolean {
    return this.status === 404;
  }
}

/**
 * Thin reactive wrapper over hugmesh-owncast-bff-api /bff/owncast/**. Auth
 * piggybacks on the shared HttpOnly `bff_` session cookie (sent with
 * credentials by the owncastAuthInterceptor; the fe-gateway turns it into the
 * upstream Bearer server-side) — the browser holds no bearer, the host injects
 * nothing, and the module never renders a login form.
 *
 * <p><b>ng-openapi-gen migration:</b> every method now DELEGATES to the
 * generated, typed {@link OwncastStreamSelfService} /
 * {@link OwncastBroadcastAccessService} / {@link OwncastModerationService}
 * (under {@code src/app/api}, generated from the owncast-bff-api OpenAPI spec)
 * instead of hand-rolling {@code fetch} URLs. The generated clients call the
 * SAME same-origin {@code /bff/owncast/**} paths (their {@code rootUrl} is seeded
 * from {@link OWNCAST_BASE_URL}, default ''), so the wire behaviour is unchanged.
 * This service keeps its OWN public {@link OwncastStream} / {@link ModStream} /
 * {@link OwncastGrant} / … types and its Promise-returning, {@link OwncastApiError}-
 * raising signature so the consuming components need NO change; the generated
 * models are bridged at the delegation boundary and the generated
 * {@code HttpErrorResponse} is normalised to {@link OwncastApiError} (preserving
 * the 403/404 the views key off).
 *
 * The methods map 1:1 to the bff endpoints (see each method). The role gating is
 * UI-convenience (the views are guarded; the controls are role-shown) — the bff
 * @PreAuthorize + OwncastBroadcastGuard are the AUTHORITATIVE gates, so every
 * method surfaces a 403 as an OwncastApiError(403) the caller renders
 * gracefully. There is NO can-broadcast/status endpoint on the bff: the streamer
 * console treats a 403 on the PUBLIC visibility flip as the broadcast-deny
 * signal and reflects it (fail-closed = the public option stays disabled).
 */
@Injectable({ providedIn: 'root' })
export class OwncastService {
  private readonly base = inject(OWNCAST_BASE_URL);
  private readonly apiConfig = inject(ApiConfiguration);
  private readonly streamApi = inject(OwncastStreamSelfService);
  private readonly accessApi = inject(OwncastBroadcastAccessService);
  private readonly modApi = inject(OwncastModerationService);

  constructor() {
    // Seed the generated client's rootUrl from the host-overridable token so the
    // __HUG_OWNCAST_URL__ override still steers every generated call (parity
    // with the prior fetch(`${base}/bff/owncast…`) behaviour). Default '' = same
    // origin, which is also the generated default.
    if (this.base) {
      this.apiConfig.rootUrl = this.base;
    }
  }

  // ----- delegation helpers ------------------------------------------------

  /** Await a generated Promise<T>, normalising any
   *  {@link HttpErrorResponse} to the {@link OwncastApiError} the components key
   *  off (preserving the bff's HTTP status — notably 403 / 404). */
  private async call<T>(promise: Promise<T>): Promise<T> {
    try {
      return await promise;
    } catch (e) {
      if (e instanceof HttpErrorResponse) {
        const body = e.error;
        const detail =
          (body && (body.message ?? body.error)) ||
          (typeof body === 'string' ? body : '') ||
          e.message ||
          `request failed: ${e.status}`;
        throw new OwncastApiError(e.status, detail);
      }
      throw e;
    }
  }

  // ----- STREAMER self-service (STREAM = ROLE_OWNCAST) --------------------

  /** GET /bff/owncast/user/stream → OwncastStreamDto.Stream. 404 when the
   *  streamer has no stream yet (a first upsert creates it internal). */
  getMyStream(): Promise<OwncastStream> {
    return this.call(this.streamApi.getMyStream()).then((s) => s as OwncastStream);
  }

  /** PUT /bff/owncast/user/stream → create-or-update the streamer's OWN title +
   *  description. A first upsert creates the stream visibility=internal
   *  (fail-closed); visibility is changed only via setVisibility(). */
  upsertMyStream(body: UpsertStream): Promise<OwncastStream> {
    return this.call(this.streamApi.upsertMyStream({ body })).then((s) => s as OwncastStream);
  }

  /** PUT /bff/owncast/user/stream/visibility → flip the streamer's OWN stream to
   *  'public' or 'internal'. A flip to PUBLIC is ALLOWED ONLY when the owner holds
   *  an active broadcast grant (403 otherwise — the OwncastBroadcastGuard deny;
   *  SUPERADMIN exempt); a flip to INTERNAL is always allowed. */
  setVisibility(visibility: Visibility): Promise<OwncastStream> {
    return this.call(this.streamApi.setMyStreamVisibility({ body: { visibility } })).then(
      (s) => s as OwncastStream,
    );
  }

  // ----- BROADCAST GRANTS: govern (MANAGE = ADMIN|SUPERADMIN) -------------

  /** POST /bff/owncast/admin/access/grant → OwncastAccessDto.Access (a permanent
   *  broadcast grant — the ONLY way to confer broadcast, default-deny). */
  grant(body: GrantOrBan): Promise<OwncastGrant> {
    return this.call(this.accessApi.grantBroadcast({ body })).then((g) => g as OwncastGrant);
  }

  /** POST /bff/owncast/admin/access/timeout → OwncastAccessDto.Access (a bounded
   *  ban; auto-restores when expires_at passes). */
  timeout(body: TimeoutBody): Promise<OwncastGrant> {
    return this.call(this.accessApi.timeoutBroadcast({ body })).then((g) => g as OwncastGrant);
  }

  /** POST /bff/owncast/admin/access/ban → OwncastAccessDto.Access (a permanent
   *  ban; denies even an active grantee — ban > grant). */
  ban(body: GrantOrBan): Promise<OwncastGrant> {
    return this.call(this.accessApi.banBroadcast({ body })).then((g) => g as OwncastGrant);
  }

  /** DELETE /bff/owncast/admin/access/{accessType}/{userSubject} — revoke an
   *  active override (CAS active->revoked, row retained = audit). accessType =
   *  'broadcast' (remove a grant) | 'banned' (restore a banned/timed-out user).
   *  The bff returns an untyped Mono<Map> (generated {@code {[k:string]:{}}});
   *  the result is discarded (void) — cast at the boundary. */
  revoke(accessType: 'broadcast' | 'banned', userSubject: string): Promise<void> {
    return this.call(
      this.accessApi.revokeBroadcastAccess({ accessType, userSubject }),
    ).then(() => undefined);
  }

  // ----- BROADCAST GRANTS: manage-all (SUPERADMIN) -----------------------

  /** GET /bff/owncast/superadmin/access → OwncastAccessDto.AccessList (all ACTIVE
   *  overrides scoped to the caller's brand; SUPERADMIN sees all). SUPERADMIN. */
  listActiveGrants(): Promise<GrantList> {
    return this.call(this.accessApi.listActiveBroadcastAccess()).then(
      (l: GenAccessList) => ({ access: (l.access ?? []) as unknown as OwncastGrant[] }),
    );
  }

  /** GET /bff/owncast/superadmin/access/{userSubject}/history → the full
   *  grant/timeout/ban HISTORY (active + revoked = audit) for a principal. */
  grantHistory(userSubject: string): Promise<GrantList> {
    return this.call(this.accessApi.broadcastAccessHistory({ userSubject })).then(
      (l: GenAccessList) => ({ access: (l.access ?? []) as unknown as OwncastGrant[] }),
    );
  }

  // ----- MODERATION (MODERATE = MOD | ADMIN | SUPERADMIN) ----------------

  /** GET /bff/owncast/mod/streams → OwncastModDto.ModStream[] — every stream in
   *  the moderator's brand (read-only). The hide/kill/restore actions below
   *  mutate them. A 403 (role denial) surfaces as OwncastApiError.isForbidden.
   *  The bff wraps the rows in {@code {streams:[…]}}; this service keeps its
   *  flat {@code ModStream[]} contract by unwrapping at the boundary. */
  listModStreams(): Promise<ModStream[]> {
    return this.call(this.modApi.listModerationStreams()).then(
      (l: GenStreamList) => (l.streams ?? []) as unknown as ModStream[],
    );
  }

  /** POST /bff/owncast/mod/streams/{ownerSubject}/hide → force the stream to
   *  visibility=internal. 404 (OwncastApiError.isNotFound) when no such stream in
   *  the brand. */
  hideStream(ownerSubject: string): Promise<ModStream> {
    return this.call(this.modApi.hideStream({ ownerSubject })).then(
      (r: GenActionResult) => r as unknown as ModStream,
    );
  }

  /** POST /bff/owncast/mod/streams/{ownerSubject}/ban → KILL: ban the owner from
   *  broadcasting (owncast_grant banned) AND force the stream internal.
   *  Idempotent on an already-active ban. */
  killStream(ownerSubject: string): Promise<ModStream> {
    return this.call(this.modApi.banStream({ ownerSubject })).then(
      (r: GenActionResult) => r as unknown as ModStream,
    );
  }

  /** POST /bff/owncast/mod/streams/{ownerSubject}/restore → revoke the ban (does
   *  NOT auto-republish — the stream stays internal). */
  restoreStream(ownerSubject: string): Promise<ModStream> {
    return this.call(this.modApi.restoreStream({ ownerSubject })).then(
      (r: GenActionResult) => r as unknown as ModStream,
    );
  }
}
