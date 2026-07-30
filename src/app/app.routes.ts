import { Routes } from '@angular/router';
import { OWNCAST_ROUTES } from './owncast.routes';

/** Dev-shell routes: mount the exposed Owncast routes under /owncast so the
 *  remote is browsable standalone (`ng serve owncast`) AT THE SAME mount path
 *  the host uses — so the in-remote guard redirect to /owncast/forbidden
 *  resolves identically in the dev shell and under the host. The host ignores
 *  this file and loads the exposed `./Owncast` module (OWNCAST_ROUTES) directly
 *  at /owncast. */
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'owncast' },
  { path: 'owncast', children: OWNCAST_ROUTES },
];
