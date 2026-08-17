import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-not-found',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <div class="status status--error" role="alert">
      <h1>Page not found</h1>
      <p>There is nothing at this address.</p>
      <p><a routerLink="/">Back to the artist list</a></p>
    </div>
  `,
})
export class NotFoundPage {}
