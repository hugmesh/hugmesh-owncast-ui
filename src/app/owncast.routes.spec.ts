import { Route } from '@angular/router';

import { OWNCAST_ROUTES } from './owncast.routes';
import { OwncastModerationComponent } from './owncast-moderation.component';
import { owncastModGuard, owncastStreamGuard } from './owncast.guard';
import { AvatarCamComponent } from './avatar-cam/avatar-cam.component';

/**
 * Route wiring — pins that the moderation VIEW stays behind the existing
 * owncastModGuard (MODERATE = MOD|ADMIN|SUPERADMIN). The bff /bff/owncast/mod/**
 * is the authority; this guard is defence-in-depth and must not be weakened.
 */
describe('OWNCAST_ROUTES (moderation role gating)', () => {
  function child(path: string): Route {
    const shell = OWNCAST_ROUTES[0];
    const r = (shell.children ?? []).find((c) => c.path === path);
    expect(r).withContext(`route ${path} exists`).toBeDefined();
    return r!;
  }

  it('mounts the avatar cam behind owncastStreamGuard, exactly like My Stream', () => {
    const cam = child('avatar-cam');
    expect(cam.component).toBe(AvatarCamComponent);
    expect(cam.canActivate).toContain(owncastStreamGuard);
    expect(cam.canActivate).not.toContain(owncastModGuard);
  });

  it('mounts the moderation view behind owncastModGuard', () => {
    const mod = child('moderation');
    expect(mod.component).toBe(OwncastModerationComponent);
    expect(mod.canActivate).toContain(owncastModGuard);
  });
});
