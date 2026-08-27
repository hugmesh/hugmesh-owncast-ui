import { Routes } from '@angular/router';
import { OwncastConsoleComponent } from './owncast-console.component';
import { OwncastStreamComponent } from './owncast-stream.component';
import { OwncastGrantsComponent } from './owncast-grants.component';
import { OwncastModerationComponent } from './owncast-moderation.component';
import { OwncastForbiddenComponent } from './owncast-forbidden.component';
import { AvatarCamComponent } from './avatar-cam/avatar-cam.component';
import { owncastStreamGuard, owncastManageGuard, owncastModGuard } from './owncast.guard';

/**
 * The exposed `./Owncast` module — mounted by the hugmesh.net host at the
 * apex path /owncast (the federation-api owncast module row: mountAt '/owncast',
 * remote_entry_url http://hugmesh-owncast-ui:8080/remoteEntry.json,
 * requiresRole 'owncast', visibility internal). The host gates the WHOLE
 * /owncast mount behind route-access ROLE_OWNCAST; THESE child guards then
 * enforce the per-VIEW role boundary so a streamer sees only "My Stream", a MOD
 * additionally sees moderation, an ADMIN additionally sees the grants console,
 * and a SUPERADMIN sees everything.
 *
 * View → role gate (mirrors hugmesh-owncast-bff-api):
 *   ''             OwncastConsole     — shell + role-aware nav (no extra gate beyond /owncast)
 *   stream         OwncastStream      — "My Stream" (owncastStreamGuard: ROLE_OWNCAST)
 *   grants         OwncastGrants      — Broadcast Grants (owncastManageGuard: ADMIN|SUPERADMIN)
 *   moderation     OwncastModeration  — moderation view (owncastModGuard: MOD|ADMIN|SUPERADMIN)
 *   forbidden      OwncastForbidden   — the within-service privilege-boundary screen
 *
 * The guard `false`-paths route to /owncast/forbidden (the IN-REMOTE mount-path
 * screen — NOT '/forbidden', NOT '/login'): the host already authgated the user
 * in; a denial here is a within-owncast privilege boundary.
 */
export const OWNCAST_ROUTES: Routes = [
  {
    path: '',
    component: OwncastConsoleComponent,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'stream' },
      { path: 'stream', component: OwncastStreamComponent, canActivate: [owncastStreamGuard] },
      // The avatar cam is a streamer's tool, gated exactly like My Stream.
      { path: 'avatar-cam', component: AvatarCamComponent, canActivate: [owncastStreamGuard] },
      { path: 'grants', component: OwncastGrantsComponent, canActivate: [owncastManageGuard] },
      { path: 'moderation', component: OwncastModerationComponent, canActivate: [owncastModGuard] },
      { path: 'forbidden', component: OwncastForbiddenComponent },
    ],
  },
];
