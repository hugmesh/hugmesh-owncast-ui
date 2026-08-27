import { Injectable, InjectionToken, inject } from '@angular/core';

/**
 * Where the HugMesh Games API lives. The games portal is its OWN host
 * (`games.<CLUSTER_DOMAIN>`, see the generator's gateway route), so from this
 * remote every call is cross-origin with the session cookie — the same shape
 * hugmesh-matrix-ui's chat3d bridge uses, and the games backend's CORS
 * allowlist (WebConfig) admits the mesh's own origins. The host may pin it
 * with `globalThis.__HUG_GAMES_URL__` (the owncast/wiki/forum precedent); the
 * default derives it from the page's own host so no brand literal lives here.
 */
export const GAMES_BASE_URL = new InjectionToken<string>('GAMES_BASE_URL', {
  factory: () => {
    const pinned = (globalThis as Record<string, unknown>)['__HUG_GAMES_URL__'];
    if (typeof pinned === 'string' && pinned) {
      return pinned.replace(/\/+$/, '');
    }
    const host = typeof location !== 'undefined' ? location.hostname : '';
    return host ? `https://games.${host}` : '';
  },
});

/** One saved parametric avatar (mirrors games' UserAvatarDto, minus the document). */
export interface GamesAvatar {
  id: string;
  name: string;
  active: boolean;
}

/** The expressions the games renderer accepts (CharacterSpec.EXPRESSIONS). */
export const AVATAR_EXPRESSIONS: readonly string[] = [
  'neutral', 'happy', 'sad', 'angry', 'surprised', 'wink', 'sleepy', 'determined', 'shout',
];

export class GamesApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

/**
 * The games avatar API as the avatar cam needs it: the caller's saved avatars,
 * and a rendered SVG frame of one — `expression` layered with `mouth` openness
 * (0 closed … 1 wide open), which is what turns a still avatar into a talking
 * one. Frames are fetched as text and handed back as data: URLs, so the image
 * never needs a cross-origin `<img>` (no cookie) or a blob: CSP entry.
 */
@Injectable({ providedIn: 'root' })
export class GamesAvatarService {
  private readonly base = inject(GAMES_BASE_URL);

  /** GET /api/avatars → the caller's avatars, active first. */
  async listMine(): Promise<GamesAvatar[]> {
    const res = await this.get('/api/avatars');
    const rows = (await res.json()) as Array<Partial<GamesAvatar>>;
    return rows
      .filter((r): r is GamesAvatar => typeof r.id === 'string' && typeof r.name === 'string')
      .map(r => ({ id: r.id, name: r.name, active: !!r.active }))
      .sort((a, b) => Number(b.active) - Number(a.active));
  }

  /** The URL of one rendered frame (also what a viewer could embed). */
  frameUrl(id: string, expression: string, mouth: number, size = 512): string {
    const q = new URLSearchParams({
      expression,
      portrait: 'false',
      w: String(size),
      h: String(Math.round(size * 1.5)),
      mouth: String(clamp01(mouth)),
    });
    return `${this.base}/api/avatars/${encodeURIComponent(id)}/image.svg?${q}`;
  }

  /** GET one frame → a data: URL of the SVG (text fetched with the session cookie). */
  async frame(id: string, expression: string, mouth: number, size = 512): Promise<string> {
    const res = await this.get(this.frameUrl(id, expression, mouth, size));
    const svg = await res.text();
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  private async get(pathOrUrl: string): Promise<Response> {
    const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${this.base}${pathOrUrl}`;
    let res: Response;
    try {
      res = await fetch(url, { credentials: 'include', headers: { Accept: 'application/json, image/svg+xml' } });
    } catch {
      throw new GamesApiError(0, 'The games service could not be reached.');
    }
    if (!res.ok) {
      throw new GamesApiError(res.status, res.status === 401 ? 'Sign in to the games portal first.' : `games ${res.status}`);
    }
    return res;
  }
}

function clamp01(v: number): number {
  return !Number.isFinite(v) || v <= 0 ? 0 : v >= 1 ? 1 : v;
}
