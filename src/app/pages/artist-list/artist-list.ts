import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';

import { AsyncState, LOADING, asAsyncState } from '../../core/async-state';
import { DiscographyService } from '../../core/discography.service';
import { ArtistIndex, ArtistIndexEntry } from '../../models/discography.model';

@Component({
  selector: 'app-artist-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './artist-list.html',
  styleUrl: './artist-list.css',
})
export class ArtistListPage {
  private readonly service = inject(DiscographyService);

  protected readonly state = toSignal(asAsyncState(this.service.index()), {
    initialValue: LOADING as AsyncState<ArtistIndex>,
  });

  protected readonly filter = signal('');

  protected readonly artists = computed<readonly ArtistIndexEntry[]>(() => {
    const current = this.state();
    return current.status === 'ready' ? current.value.artists : [];
  });

  protected readonly updated = computed(() => {
    const current = this.state();
    return current.status === 'ready' ? current.value.updated : '';
  });

  protected readonly visible = computed<readonly ArtistIndexEntry[]>(() => {
    const needle = this.filter().trim().toLowerCase();
    if (!needle) return this.artists();
    return this.artists().filter((artist) =>
      `${artist.name} ${artist.origin} ${artist.active}`.toLowerCase().includes(needle),
    );
  });

  protected onFilter(value: string): void {
    this.filter.set(value);
  }
}
