import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  TestRequest,
} from '@angular/common/http/testing';
import { owncastAuthInterceptor } from './owncast-auth.interceptor';
import {
  OwncastService,
  OwncastApiError,
  OWNCAST_BASE_URL,
} from './owncast.service';
import { SessionService } from './session.service';

/** Drive the service against the Angular HttpTestingController so the EXACT
 *  path/method/body for each bff endpoint is asserted (the load-bearing
 *  endpoint-consumption contract) plus the 403 (broadcast-deny / @PreAuthorize)
 *  and 404 (no stream yet) error paths.
 *
 *  As of the ng-openapi-gen adoption the service delegates to the generated,
 *  HttpClient-based client (rootUrl '' = same origin), so the wire calls are the
 *  same {@code /bff/owncast/**} paths/methods/bodies the prior fetch-based
 *  implementation made — only the transport (fetch -> HttpClient) changed, hence
 *  this spec drives HttpTestingController rather than spying on global fetch. */
describe('OwncastService (BFF endpoint contract)', () => {
  let service: OwncastService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.setItem(
      'hug.session',
      JSON.stringify({ roles: ['owncast'] }),
    );
    TestBed.configureTestingModule({
      providers: [
        OwncastService,
        SessionService,
        { provide: OWNCAST_BASE_URL, useValue: '' },
        provideHttpClient(withInterceptors([owncastAuthInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(OwncastService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  /** Expect exactly one request to `url`+`method`, flush `body` with `status`,
   *  and return the matched request so the body/params can be asserted. */
  function expectOne(method: string, url: string): TestRequest {
    const req = httpMock.expectOne(url);
    expect(req.request.method).toBe(method);
    return req;
  }

  // ── streamer self-service ──

  it('getMyStream → GET /bff/owncast/user/stream with credentials (bff_ cookie), no bearer', async () => {
    const p = service.getMyStream();
    const req = expectOne('GET', '/bff/owncast/user/stream');
    expect(req.request.withCredentials).toBeTrue();
    expect(req.request.headers.has('Authorization')).toBeFalse();
    req.flush({ id: '1', visibility: 'internal' });
    const s = await p;
    expect(s.id).toBe('1');
  });

  it('getMyStream surfaces a 404 (no stream yet) as OwncastApiError.isNotFound', async () => {
    const p = service.getMyStream();
    expectOne('GET', '/bff/owncast/user/stream').flush(
      { error: 'no stream' },
      { status: 404, statusText: 'Not Found' },
    );
    try {
      await p;
      fail('expected rejection');
    } catch (e) {
      expect(e instanceof OwncastApiError).toBeTrue();
      expect((e as OwncastApiError).isNotFound).toBeTrue();
    }
  });

  it('upsertMyStream → PUT /bff/owncast/user/stream with the body', async () => {
    const p = service.upsertMyStream({ title: 'T', description: 'D' });
    const req = expectOne('PUT', '/bff/owncast/user/stream');
    expect(req.request.body).toEqual({ title: 'T', description: 'D' });
    req.flush({ id: '1' });
    await p;
  });

  it('setVisibility → PUT /bff/owncast/user/stream/visibility with {visibility}', async () => {
    const p = service.setVisibility('public');
    const req = expectOne('PUT', '/bff/owncast/user/stream/visibility');
    expect(req.request.body).toEqual({ visibility: 'public' });
    req.flush({ id: '1', visibility: 'public' });
    await p;
  });

  it('setVisibility(public) surfaces a 403 (no broadcast grant) as OwncastApiError.isForbidden', async () => {
    const p = service.setVisibility('public');
    expectOne('PUT', '/bff/owncast/user/stream/visibility').flush(
      { error: 'no active broadcast grant' },
      { status: 403, statusText: 'Forbidden' },
    );
    try {
      await p;
      fail('expected rejection');
    } catch (e) {
      expect(e instanceof OwncastApiError).toBeTrue();
      expect((e as OwncastApiError).isForbidden).toBeTrue();
    }
  });

  // ── broadcast grants: govern ──

  it('grant/timeout/ban → POST the right /bff/owncast/admin/access/* endpoints', async () => {
    const row = { accessType: 'broadcast', state: 'active' };

    const pg = service.grant({ userSubject: 'u' });
    expectOne('POST', '/bff/owncast/admin/access/grant').flush(row);
    await pg;

    const pt = service.timeout({ userSubject: 'u', ttlSeconds: 3600 });
    expectOne('POST', '/bff/owncast/admin/access/timeout').flush(row);
    await pt;

    const pb = service.ban({ userSubject: 'u' });
    expectOne('POST', '/bff/owncast/admin/access/ban').flush(row);
    await pb;
  });

  it('revoke → DELETE /bff/owncast/admin/access/{type}/{user} (url-encoded)', async () => {
    const p1 = service.revoke('banned', 'google:bob@x.com');
    expectOne('DELETE', '/bff/owncast/admin/access/banned/google%3Abob%40x.com').flush({});
    await p1;

    const p2 = service.revoke('broadcast', 'u');
    expectOne('DELETE', '/bff/owncast/admin/access/broadcast/u').flush({});
    await p2;
  });

  // ── broadcast grants: manage-all (superadmin) ──

  it('listActiveGrants + grantHistory → the superadmin endpoints', async () => {
    const pl = service.listActiveGrants();
    expectOne('GET', '/bff/owncast/superadmin/access').flush({ access: [] });
    expect(await pl).toEqual({ access: [] });

    const ph = service.grantHistory('u');
    expectOne('GET', '/bff/owncast/superadmin/access/u/history').flush({ access: [] });
    await ph;
  });

  it('surfaces a 403 as OwncastApiError.isForbidden (the bff @PreAuthorize denial)', async () => {
    const p = service.grant({ userSubject: 'u' });
    expectOne('POST', '/bff/owncast/admin/access/grant').flush(
      { error: 'forbidden' },
      { status: 403, statusText: 'Forbidden' },
    );
    try {
      await p;
      fail('expected rejection');
    } catch (e) {
      expect(e instanceof OwncastApiError).toBeTrue();
      expect((e as OwncastApiError).isForbidden).toBeTrue();
    }
  });

  // ── moderation (MOD | ADMIN | SUPERADMIN) ──

  it('listModStreams → GET /bff/owncast/mod/streams with credentials (bff_ cookie), no bearer (unwraps {streams})', async () => {
    const p = service.listModStreams();
    const req = expectOne('GET', '/bff/owncast/mod/streams');
    expect(req.request.withCredentials).toBeTrue();
    expect(req.request.headers.has('Authorization')).toBeFalse();
    req.flush({
      streams: [{ ownerSubject: 'u', visibility: 'internal', banned: false }],
    });
    const list = await p;
    expect(list.length).toBe(1);
    expect(list[0].ownerSubject).toBe('u');
  });

  it('hideStream → POST /bff/owncast/mod/streams/{owner}/hide (url-encoded)', async () => {
    const p = service.hideStream('google:bob@x.com');
    expectOne('POST', '/bff/owncast/mod/streams/google%3Abob%40x.com/hide').flush({
      ownerSubject: 'u',
      visibility: 'internal',
    });
    await p;
  });

  it('killStream → POST /bff/owncast/mod/streams/{owner}/ban (url-encoded)', async () => {
    const p = service.killStream('google:bob@x.com');
    expectOne('POST', '/bff/owncast/mod/streams/google%3Abob%40x.com/ban').flush({
      ownerSubject: 'u',
      banned: true,
    });
    await p;
  });

  it('restoreStream → POST /bff/owncast/mod/streams/{owner}/restore (url-encoded)', async () => {
    const p = service.restoreStream('google:bob@x.com');
    expectOne('POST', '/bff/owncast/mod/streams/google%3Abob%40x.com/restore').flush({
      ownerSubject: 'u',
      banned: false,
    });
    await p;
  });

  it('hideStream surfaces a 404 (no such stream) as OwncastApiError.isNotFound', async () => {
    const p = service.hideStream('u');
    expectOne('POST', '/bff/owncast/mod/streams/u/hide').flush(
      { error: 'no stream' },
      { status: 404, statusText: 'Not Found' },
    );
    try {
      await p;
      fail('expected rejection');
    } catch (e) {
      expect(e instanceof OwncastApiError).toBeTrue();
      expect((e as OwncastApiError).isNotFound).toBeTrue();
    }
  });
});
