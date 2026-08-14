import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/**
 * Standalone dev shell for the Owncast remote. Only used when this remote is run
 * on its own (`ng serve owncast`); in production the hugmesh.net host
 * federates `./Owncast` (OWNCAST_ROUTES) directly and mounts them at /owncast —
 * this shell is not loaded.
 */
@Component({
  selector: 'hug-owncast-root',
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {}
