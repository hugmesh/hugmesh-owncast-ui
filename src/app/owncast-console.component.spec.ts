import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';

import { OwncastConsoleComponent } from './owncast-console.component';
import { SessionService } from './session.service';
import { accessibleName } from './accessible-name';

/** A stub SessionService with settable capability signals so each role scenario
 *  is exercised by flipping canStream/canManage/canModerate. */
function sessionStub() {
  return {
    canStream: signal(false),
    canManage: signal(false),
    canModerate: signal(false),
  };
}

describe('OwncastConsoleComponent (role-gated nav)', () => {
  let fixture: ComponentFixture<OwncastConsoleComponent>;
  let session: ReturnType<typeof sessionStub>;

  beforeEach(async () => {
    session = sessionStub();
    await TestBed.configureTestingModule({
      imports: [OwncastConsoleComponent],
      providers: [provideRouter([]), { provide: SessionService, useValue: session }],
    }).compileComponents();
    fixture = TestBed.createComponent(OwncastConsoleComponent);
  });

  function el(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }
  function navTestIds(): string[] {
    return Array.from(el().querySelectorAll('[data-testid^="owncast-nav-"]')).map(
      (n) => n.getAttribute('data-testid')!,
    );
  }

  it('a NON-role user sees NOTHING (empty menubar)', () => {
    fixture.detectChanges();
    expect(navTestIds()).toEqual([]);
    expect(el().querySelector('[role="menubar"]')).withContext('no menubar when no items').toBeNull();
  });

  it('a STREAMER sees ONLY My Stream', () => {
    session.canStream.set(true);
    fixture.detectChanges();
    expect(navTestIds()).toEqual(['owncast-nav-stream']);
  });

  it('a MOD sees ONLY Moderation', () => {
    session.canModerate.set(true);
    fixture.detectChanges();
    expect(navTestIds()).toEqual(['owncast-nav-moderation']);
  });

  it('an ADMIN sees Broadcast grants + Moderation (admin inherits mod)', () => {
    session.canManage.set(true);
    session.canModerate.set(true);
    fixture.detectChanges();
    expect(navTestIds()).toEqual(['owncast-nav-grants', 'owncast-nav-moderation']);
  });

  it('an ADMIN who also streams sees ALL three', () => {
    session.canStream.set(true);
    session.canManage.set(true);
    session.canModerate.set(true);
    fixture.detectChanges();
    expect(navTestIds()).toEqual([
      'owncast-nav-stream',
      'owncast-nav-grants',
      'owncast-nav-moderation',
    ]);
  });

  it('renders the menubar with roving tabindex + arrow-key roving (a11y)', () => {
    session.canStream.set(true);
    session.canManage.set(true);
    session.canModerate.set(true);
    fixture.detectChanges();
    const menubar = el().querySelector('[role="menubar"]')!;
    expect(menubar).not.toBeNull();
    const items = Array.from(el().querySelectorAll('[role="menuitem"]')) as HTMLElement[];
    // Exactly one item is tabbable (tabindex=0); the rest are -1.
    expect(items.map((i) => i.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);

    const component = fixture.componentInstance;
    component.onKey(new KeyboardEvent('keydown', { key: 'ArrowRight' }), 0);
    fixture.detectChanges();
    expect(component.active).toBe(1);
    component.onKey(new KeyboardEvent('keydown', { key: 'End' }), 1);
    expect(component.active).toBe(2);
    component.onKey(new KeyboardEvent('keydown', { key: 'Home' }), 2);
    expect(component.active).toBe(0);
  });

  it('every nav link carries an accessibleName + describedby help (a11y)', () => {
    session.canStream.set(true);
    session.canManage.set(true);
    session.canModerate.set(true);
    fixture.detectChanges();
    const links = Array.from(el().querySelectorAll('[role="menuitem"]')) as HTMLElement[];
    for (const link of links) {
      expect(accessibleName(link)).withContext('accessibleName').toBeTruthy();
      const describedby = link.getAttribute('aria-describedby');
      expect(describedby).toBeTruthy();
      expect(el().querySelector('#' + describedby)).withContext('help element exists').not.toBeNull();
    }
  });
});
