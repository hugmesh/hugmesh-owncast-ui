/**
 * Native-federation REMOTE entrypoint for hugmesh-owncast-ui.
 *
 * `initFederation()` registers this remote with the native-federation runtime
 * so the host can resolve `loadRemoteModule('owncast', './Owncast')` at
 * runtime. Once federation wiring is complete, `./bootstrap` bootstraps the
 * standalone Angular dev-shell (AppComponent + OWNCAST_ROUTES under /owncast).
 * In production the hugmesh.net host federates `./Owncast`
 * (OWNCAST_ROUTES) directly without bootstrapping the shell.
 *
 * Errors are logged but NOT rethrown so a misconfigured federation init
 * does not hard-fail the dev shell.
 */
import { initFederation } from '@angular-architects/native-federation';

initFederation()
  .catch(err => console.error(err))
  .then(_ => import('./bootstrap'))
  .catch(err => console.error(err));
