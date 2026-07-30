import { HttpInterceptorFn } from '@angular/common/http';

/**
 * Sends credentials (the HttpOnly {@code bff_} cookie) on every
 * {@code /bff/owncast/**} request, and asks for JSON.
 *
 * <p>Before the ng-openapi-gen adoption, {@code OwncastService} hand-rolled
 * {@code fetch} and added the auth header itself. Now the service delegates to the
 * generated, {@code HttpClient}-based client (which adds no auth), so this
 * functional interceptor centralises the wire auth: it sets
 * {@code withCredentials: true} so the browser attaches the HttpOnly {@code bff_}
 * session cookie. The fe-gateway's BffCookieToBearerWebFilter turns that cookie
 * into the upstream {@code Authorization: Bearer} server-side, so the browser
 * never holds an admin-capable bearer. Requests to other origins/paths are
 * untouched. The cookie only AUTHENTICATES — the bff {@code @PreAuthorize} +
 * OwncastBroadcastGuard remain authoritative.
 */
export const owncastAuthInterceptor: HttpInterceptorFn = (req, next) => {
  // Only decorate owncast BFF traffic; leave federation/asset/other calls alone.
  // Matches same-origin '/bff/owncast/...' and any host-overridden absolute URL
  // whose path contains '/bff/owncast'.
  if (!req.url.includes('/bff/owncast')) {
    return next(req);
  }

  return next(req.clone({ withCredentials: true, setHeaders: { Accept: 'application/json' } }));
};
