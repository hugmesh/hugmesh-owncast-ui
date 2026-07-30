import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { owncastAuthInterceptor } from './owncast-auth.interceptor';

describe('owncastAuthInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([owncastAuthInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('sends credentials (the HttpOnly bff_ cookie) and NO bearer on /bff/owncast/** calls', () => {
    http.get('/bff/owncast/user/stream').subscribe();
    const req = httpMock.expectOne('/bff/owncast/user/stream');
    expect(req.request.withCredentials).toBeTrue();
    expect(req.request.headers.has('Authorization')).toBeFalse();
    expect(req.request.headers.get('Accept')).toBe('application/json');
    req.flush({});
  });

  it('does NOT touch non-owncast requests (no credentials, no Authorization)', () => {
    http.get('/assets/config.json').subscribe();
    const req = httpMock.expectOne('/assets/config.json');
    expect(req.request.withCredentials).toBeFalse();
    expect(req.request.headers.has('Authorization')).toBeFalse();
    req.flush({});
  });
});
