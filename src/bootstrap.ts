/**
 * Angular bootstrap for the owncast-ui DEV SHELL. Mounts {@link AppComponent}
 * with the OWNCAST_ROUTES under the `/owncast` prefix so the remote is
 * browsable standalone via `ng serve owncast`.
 *
 * In production this file is NOT loaded — the hugmesh.systems host
 * federates `./Owncast` (OWNCAST_ROUTES) directly at the /owncast mount.
 *
 * {@link provideHttpClient} with `withFetch()` (the fetch-backed HttpClient) is
 * required here: since the ng-openapi-gen adoption, {@link OwncastService}
 * delegates every call to the generated, `HttpClient`-based
 * `OwncastStreamSelfService` / `OwncastBroadcastAccessService` /
 * `OwncastModerationService` (see owncast.service.ts) instead of hand-rolling
 * `fetch` itself, so HttpClient must be provided for the remote to work at all.
 */
import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';
import { owncastAuthInterceptor } from './app/owncast-auth.interceptor';

bootstrapApplication(AppComponent, {
  providers: [
    provideRouter(routes),
    provideHttpClient(withFetch(), withInterceptors([owncastAuthInterceptor])),
  ],
}).catch((err) => console.error(err));
