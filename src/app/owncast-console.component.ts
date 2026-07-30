import { Component, ElementRef, QueryList, ViewChildren, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { SessionService } from './session.service';

interface OwncastNavItem {
  path: string;
  label: string;
  /** accessibleName — the screen-reader announce for the link. */
  aria: string;
  /** the inline help text (sighted) linked via aria-describedby (no-sight). */
  help: string;
  show: () => boolean;
}

/**
 * The owncast console shell — a role-aware menubar (roving tabindex, WAI-ARIA
 * APG) over the role-gated child views, plus the swappable content outlet.
 *
 * The nav items are SHOWN BY ROLE (defence-in-depth; the child guards + the bff
 * are authoritative):
 *   My Stream  (stream)     — shown to STREAM   (ROLE_OWNCAST).
 *   Broadcast grants (grants) — shown to MANAGE (admin|superadmin).
 *   Moderation (moderation) — shown to MODERATE (mod|admin|superadmin).
 * So a plain STREAMER sees only My Stream; a MOD additionally sees Moderation;
 * an ADMIN additionally sees Broadcast grants; a SUPERADMIN sees everything.
 * (The host already gates the whole /owncast mount on ROLE_OWNCAST before this
 * component is ever reached, so canStream() — itself just ROLE_OWNCAST — is
 * always true here in practice; the per-view guards below are still enforced
 * as defence-in-depth and are what the bff itself checks.)
 *
 * a11y: <nav role="menubar"> with roving tabindex + Arrow/Home/End keyboard
 * navigation; routerLinkActive marks the current view aria-current="page"; every
 * link carries an accessibleName + an aria-describedby help hint.
 */
@Component({
  selector: 'hug-owncast-console',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './owncast-console.component.html',
  styleUrl: './owncast-console.component.scss',
})
export class OwncastConsoleComponent {
  private readonly session = inject(SessionService);

  @ViewChildren('navlink') navLinks!: QueryList<ElementRef<HTMLAnchorElement>>;

  /** Index of the roving-tabindex'd item that currently holds tabindex=0. */
  active = 0;

  readonly items: OwncastNavItem[] = [
    {
      path: 'stream',
      label: 'My Stream',
      aria: 'My stream — visibility, title and description',
      help: 'View your stream, edit its title and description, and toggle its visibility. Requires the owncast role.',
      show: () => this.session.canStream(),
    },
    {
      path: 'grants',
      label: 'Broadcast grants',
      aria: 'Broadcast grants — grant, time out, ban, restore a user\'s broadcast access',
      help: 'Grant a user broadcast access, time them out, ban them, or restore access. This gates whether a user\'s stream may go public. Requires the admin or superadmin role.',
      show: () => this.session.canManage(),
    },
    {
      path: 'moderation',
      label: 'Moderation',
      aria: 'Moderation — review and flag streams',
      help: 'Review streams and flag ones that violate the rules. Requires the mod, admin or superadmin role.',
      show: () => this.session.canModerate(),
    },
  ];

  /** The items actually rendered for this role. */
  visibleItems(): OwncastNavItem[] {
    return this.items.filter((i) => i.show());
  }

  /** Roving-tabindex helper — only the active item is tabbable; the rest are -1
   *  and reached with Arrow keys (WAI-ARIA menubar pattern). */
  tabindexFor(i: number): number {
    return i === this.active ? 0 : -1;
  }

  /** Arrow/Home/End keyboard navigation across the menubar. */
  onKey(event: KeyboardEvent, i: number): void {
    const count = this.visibleItems().length;
    if (count === 0) return;
    let next = i;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = (i + 1) % count;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        next = (i - 1 + count) % count;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = count - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    this.active = next;
    const links = this.navLinks?.toArray() ?? [];
    links[next]?.nativeElement.focus();
  }
}
