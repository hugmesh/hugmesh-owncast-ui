import { TestBed } from '@angular/core/testing';
import { AVATAR_EXPRESSIONS, GAMES_BASE_URL, GamesApiError, GamesAvatarService } from './games-avatar.service';

describe('GamesAvatarService', () => {
  let svc: GamesAvatarService;
  let fetchSpy: jasmine.Spy;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [{ provide: GAMES_BASE_URL, useValue: 'https://games.example.test/' .replace(/\/+$/, '') }] });
    svc = TestBed.inject(GamesAvatarService);
    fetchSpy = spyOn(globalThis, 'fetch');
  });

  it('lists the caller\'s avatars with the session cookie, active first', async () => {
    fetchSpy.and.resolveTo(new Response(JSON.stringify([
      { id: 'b', name: 'Bee', document: {}, active: false },
      { id: 'a', name: 'Ay', document: {}, active: true },
      { id: 42, name: 'not-a-string-id' },
    ]), { status: 200 }));
    const rows = await svc.listMine();
    expect(rows).toEqual([{ id: 'a', name: 'Ay', active: true }, { id: 'b', name: 'Bee', active: false }]);
    const [url, init] = fetchSpy.calls.mostRecent().args as [string, RequestInit];
    expect(url).toBe('https://games.example.test/api/avatars');
    expect(init.credentials).toBe('include');
  });

  it('builds a frame URL with the expression, size and clamped mouth openness', () => {
    const u = new URL(svc.frameUrl('a b', 'happy', 7, 256));
    expect(u.pathname).toBe('/api/avatars/a%20b/image.svg');
    expect(u.searchParams.get('expression')).toBe('happy');
    expect(u.searchParams.get('mouth')).toBe('1');
    expect(u.searchParams.get('w')).toBe('256');
    expect(u.searchParams.get('h')).toBe('384');
    expect(new URL(svc.frameUrl('a', 'sad', Number.NaN)).searchParams.get('mouth')).toBe('0');
    expect(AVATAR_EXPRESSIONS).toContain('neutral');
  });

  it('returns a frame as a data: URL of the fetched SVG', async () => {
    fetchSpy.and.resolveTo(new Response('<svg xmlns="http://www.w3.org/2000/svg"/>', { status: 200 }));
    const src = await svc.frame('a', 'neutral', 0.45);
    expect(src.startsWith('data:image/svg+xml;charset=utf-8,')).toBeTrue();
    expect(decodeURIComponent(src.split(',')[1])).toContain('<svg');
  });

  it('maps a 401 to a sign-in message and a network failure to unreachable', async () => {
    fetchSpy.and.resolveTo(new Response('', { status: 401 }));
    await expectAsync(svc.listMine()).toBeRejectedWithError(GamesApiError, /Sign in/);
    fetchSpy.and.rejectWith(new TypeError('Failed to fetch'));
    await expectAsync(svc.listMine()).toBeRejectedWithError(GamesApiError, /could not be reached/);
  });
});

describe('GAMES_BASE_URL', () => {
  afterEach(() => { delete (globalThis as Record<string, unknown>)['__HUG_GAMES_URL__']; });

  it('prefers the host pin and strips a trailing slash', () => {
    (globalThis as Record<string, unknown>)['__HUG_GAMES_URL__'] = 'https://games.pinned.test/';
    expect(TestBed.inject(GAMES_BASE_URL)).toBe('https://games.pinned.test');
  });

  it('derives games.<host> from the page otherwise', () => {
    expect(TestBed.inject(GAMES_BASE_URL)).toBe(`https://games.${location.hostname}`);
  });
});
