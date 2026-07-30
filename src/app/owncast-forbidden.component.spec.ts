import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';

import { OwncastForbiddenComponent } from './owncast-forbidden.component';
import { SessionService } from './session.service';

describe('OwncastForbiddenComponent', () => {
  const canStream = signal(false);
  const canModerate = signal(false);

  async function setup(): Promise<ComponentFixture<OwncastForbiddenComponent>> {
    await TestBed.configureTestingModule({
      imports: [OwncastForbiddenComponent],
      providers: [
        provideRouter([]),
        { provide: SessionService, useValue: { canStream, canModerate } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(OwncastForbiddenComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('announces the denial in a role="alert" and explains the missing role', async () => {
    const fixture = await setup();
    const el = fixture.nativeElement as HTMLElement;
    const alert = el.querySelector('[role="alert"]')!;
    expect(alert).not.toBeNull();
    expect(alert.textContent).toContain('access');
  });

  it('offers a "Go to my stream" link only when the user is a streamer', async () => {
    canStream.set(false);
    canModerate.set(false);
    let fixture = await setup();
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid="owncast-forbidden-stream"]')).toBeNull();

    TestBed.resetTestingModule();
    canStream.set(true);
    fixture = await setup();
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid="owncast-forbidden-stream"]')).not.toBeNull();
  });

  it('offers a "Moderation" link only when the user can moderate', async () => {
    TestBed.resetTestingModule();
    canStream.set(false);
    canModerate.set(true);
    const fixture = await setup();
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid="owncast-forbidden-moderation"]')).not.toBeNull();
  });
});
