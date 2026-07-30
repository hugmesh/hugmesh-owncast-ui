import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { SessionService } from './session.service';

/**
 * The within-owncast privilege-boundary screen. Reached when a child guard
 * denies activation (a plain USER without ROLE_OWNCAST hitting "My Stream"; a
 * streamer/mod hitting the admin-only Broadcast Grants view). NOT an auth
 * failure — the host already authgated the user in (route-access
 * /owncast=ROLE_OWNCAST) — so this explains the MISSING role rather than
 * bouncing to /login, and offers a route back to a view the user CAN reach.
 *
 * It mirrors how the bff handles the authoritative denial (a 403 from a
 * @PreAuthorize / the OwncastBroadcastGuard): the UI gating only HIDES options;
 * this screen is the graceful landing when a deeper gate says no.
 */
@Component({
  selector: 'hug-owncast-forbidden',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './owncast-forbidden.component.html',
  styleUrl: './owncast-forbidden.component.scss',
})
export class OwncastForbiddenComponent {
  private readonly session = inject(SessionService);

  /** Whether to offer the "Go to my stream" link (only if the user is a streamer). */
  readonly canStream = this.session.canStream;
  /** Whether to offer the "Moderation" link (only if the user can moderate). */
  readonly canModerate = this.session.canModerate;
}
