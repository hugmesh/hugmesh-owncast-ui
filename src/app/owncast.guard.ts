import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SessionService } from './session.service';

/**
 * Route guards for the owncast console — the UI half of the owncast role model.
 * Each mirrors a hugmesh-owncast-bff-api gate (defence-in-depth; the bff is
 * authoritative):
 *
 *   owncastStreamGuard — STREAM   = ROLE_OWNCAST. Gates the streamer's OWN
 *                        "My Stream" console (/bff/owncast/user/**). A user
 *                        without ROLE_OWNCAST is sent to /owncast/forbidden.
 *   owncastManageGuard — MANAGE   = ADMIN | SUPERADMIN. Gates the Broadcast
 *                        Grants console (grant/timeout/ban/restore + list/history).
 *   owncastModGuard    — MODERATE = MOD | ADMIN | SUPERADMIN. Gates the
 *                        moderation view (list/flag streams). The mod moderates.
 *
 * A denied activation routes to the IN-REMOTE mount-path forbidden screen —
 * router.parseUrl('/owncast/forbidden') — NOT '/forbidden' and NOT '/login'.
 * The host already authgated the user in (route-access /owncast=ROLE_OWNCAST),
 * so a denial here is a WITHIN-SERVICE privilege boundary, not an auth failure.
 * (Shipping the bare '/forbidden' was a real wiki-ui bug — the mount-prefixed
 * path is the correct in-remote target.) The forbidden screen explains the
 * missing role + offers a route back.
 */

/** The in-remote forbidden screen, at the host mount path /owncast. A DENY MUST
 *  route here (NOT '/forbidden', NOT '/login'). */
export const OWNCAST_FORBIDDEN = '/owncast/forbidden';

export const owncastStreamGuard: CanActivateFn = () => {
  const session = inject(SessionService);
  const router = inject(Router);
  return session.canStream() ? true : router.parseUrl(OWNCAST_FORBIDDEN);
};

export const owncastManageGuard: CanActivateFn = () => {
  const session = inject(SessionService);
  const router = inject(Router);
  return session.canManage() ? true : router.parseUrl(OWNCAST_FORBIDDEN);
};

export const owncastModGuard: CanActivateFn = () => {
  const session = inject(SessionService);
  const router = inject(Router);
  return session.canModerate() ? true : router.parseUrl(OWNCAST_FORBIDDEN);
};
