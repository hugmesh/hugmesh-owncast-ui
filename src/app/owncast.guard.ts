import { inject } from '@angular/core';
import { CanActivateFn, RedirectFunction, Router } from '@angular/router';
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

/**
 * The console's landing view — where a bare /owncast sends this session. The
 * first child view the session's role can actually open, in nav order:
 *
 *   stream      when canStream   (ROLE_OWNCAST)
 *   grants      when canManage   (ADMIN | SUPERADMIN)
 *   moderation  when canModerate (MOD | ADMIN | SUPERADMIN)
 *   forbidden   when none of the above applies
 *
 * The landing used to be a static redirect to 'stream'. canStream is the bare
 * 'owncast' role and admin/superadmin do not imply it, so an admin, a
 * superadmin or the mesh operator without that role who clicked Owncast was
 * sent to stream, denied by owncastStreamGuard, and shown "You don't have
 * access to this view" although they can open grants and moderation.
 *
 * Returns a path RELATIVE to the console mount, like the old static redirect,
 * so it lands under whatever path the host mounts the remote at (/owncast).
 */
export type OwncastLandingView = 'stream' | 'grants' | 'moderation' | 'forbidden';

export function owncastLandingView(session: Pick<SessionService, 'canStream' | 'canManage' | 'canModerate'>): OwncastLandingView {
  if (session.canStream()) return 'stream';
  if (session.canManage()) return 'grants';
  if (session.canModerate()) return 'moderation';
  return 'forbidden';
}

/** The '' child's redirectTo: run in an injection context by the router on
 *  every navigation to the bare console path, so it reads the CURRENT session. */
export const owncastLandingRedirect: RedirectFunction = () => owncastLandingView(inject(SessionService));
