import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs';

import { AsyncState, LOADING, asAsyncState } from '../../core/async-state';
import { copyToClipboard, toCsv } from '../../core/clipboard';
import { DiscographyService } from '../../core/discography.service';
import { Confidence, Discography, ReleaseType, Song } from '../../models/discography.model';

type SortKey = 'title' | 'year';
type SortDir = 'asc' | 'desc';

/** Worst to best, so the select reads in a sensible order and unknown values sort last. */
const CONFIDENCE_ORDER: readonly Confidence[] = ['high', 'medium', 'low', 'unverified'];

const SEARCH_DEBOUNCE_MS = 150;

const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true });

@Component({
  selector: 'app-artist-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './artist-detail.html',
  styleUrl: './artist-detail.css',
})
export class ArtistDetailPage {
  private readonly service = inject(DiscographyService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  /** Route parameter. */
  readonly id = input.required<string>();

  /**
   * Query parameters, bound by withComponentInputBinding(). The URL is the only
   * source of truth for filter and sort state, which is what makes a filtered
   * view shareable and survive a refresh. Each is optional, so each is typed
   * as possibly undefined and normalised below rather than trusted.
   */
  readonly q = input<string | undefined>(undefined);
  readonly era = input<string | undefined>(undefined);
  readonly type = input<string | undefined>(undefined);
  readonly album = input<string | undefined>(undefined);
  readonly confidence = input<string | undefined>(undefined);
  readonly sort = input<string | undefined>(undefined);
  readonly dir = input<string | undefined>(undefined);

  // ------------------------------------------------------------------ data

  protected readonly state = toSignal(
    toObservable(this.id).pipe(switchMap((id) => asAsyncState(this.service.discography(id)))),
    { initialValue: LOADING as AsyncState<Discography> },
  );

  private readonly data = computed<Discography | null>(() => {
    const current = this.state();
    return current.status === 'ready' ? current.value : null;
  });

  protected readonly artist = computed(() => this.data()?.artist ?? null);
  protected readonly eras = computed(() => this.data()?.eras ?? []);
  protected readonly allSongs = computed<readonly Song[]>(() => this.data()?.songs ?? []);

  // --------------------------------------------------------- filter options

  protected readonly typeOptions = computed<readonly ReleaseType[]>(() =>
    [...new Set(this.allSongs().map((s) => s.type))].sort(),
  );

  protected readonly albumOptions = computed<readonly string[]>(() =>
    (this.data()?.albums ?? []).map((a) => a.title).sort((a, b) => collator.compare(a, b)),
  );

  protected readonly confidenceOptions = computed<readonly Confidence[]>(() =>
    CONFIDENCE_ORDER.filter((level) => this.allSongs().some((s) => s.confidence === level)),
  );

  // ------------------------------------------------- normalised URL state
  // An unrecognised query param value is ignored rather than producing an
  // empty table, so a stale or hand-edited link degrades to "no filter".

  protected readonly search = computed(() => (this.q() ?? '').trim().toLowerCase());

  protected readonly eraFilter = computed(() =>
    pick(
      this.era(),
      this.eras().map((e) => e.id),
    ),
  );
  protected readonly typeFilter = computed(() => pick(this.type(), this.typeOptions()));
  protected readonly albumFilter = computed(() => pick(this.album(), this.albumOptions()));
  protected readonly confidenceFilter = computed(() =>
    pick(this.confidence(), this.confidenceOptions()),
  );

  protected readonly sortKey = computed<SortKey>(() => (this.sort() === 'year' ? 'year' : 'title'));
  protected readonly sortDir = computed<SortDir>(() => (this.dir() === 'desc' ? 'desc' : 'asc'));

  protected readonly hasActiveFilter = computed(
    () =>
      !!this.search() ||
      !!this.eraFilter() ||
      !!this.typeFilter() ||
      !!this.albumFilter() ||
      !!this.confidenceFilter(),
  );

  // ------------------------------------------------------------- pipeline

  private readonly filtered = computed<readonly Song[]>(() => {
    const needle = this.search();
    const era = this.eraFilter();
    const type = this.typeFilter();
    const album = this.albumFilter();
    const level = this.confidenceFilter();

    return this.allSongs().filter((song) => {
      if (era && song.era !== era) return false;
      if (type && song.type !== type) return false;
      if (album && !song.albums.includes(album)) return false;
      if (level && song.confidence !== level) return false;
      if (needle) {
        const haystack = `${song.title} ${song.albums.join(' ')}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  });

  /**
   * The rendered rows. A plain table is fine up to roughly 500 songs for one
   * artist; past that, swap in a virtual scroller. Maroon 5 is 215.
   */
  protected readonly rows = computed<readonly Song[]>(() => {
    const key = this.sortKey();
    const factor = this.sortDir() === 'desc' ? -1 : 1;

    return [...this.filtered()].sort((a, b) => {
      if (key === 'year') {
        // Undated material sorts last in both directions; it is not "year zero".
        if (a.year === null && b.year === null) return collator.compare(a.title, b.title);
        if (a.year === null) return 1;
        if (b.year === null) return -1;
        return (a.year - b.year) * factor || collator.compare(a.title, b.title);
      }
      return collator.compare(a.title, b.title) * factor || (a.year ?? 0) - (b.year ?? 0);
    });
  });

  // ------------------------------------------------------- search box state
  // The box updates instantly; the URL and therefore the table follow after a
  // short pause. Navigating back or opening a shared link moves the box too.

  protected readonly searchText = signal('');
  private lastPushedSearch = '';

  protected readonly copyStatus = signal('');
  private copyTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    const initial = (this.route.snapshot.queryParamMap.get('q') ?? '').trim();
    this.searchText.set(initial);
    this.lastPushedSearch = initial;

    toObservable(this.searchText)
      .pipe(
        debounceTime(SEARCH_DEBOUNCE_MS),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((value) => {
        const trimmed = value.trim();
        if (trimmed === this.lastPushedSearch) return;
        this.lastPushedSearch = trimmed;
        this.patch({ q: trimmed || null });
      });

    effect(() => {
      const fromUrl = (this.q() ?? '').trim();
      if (fromUrl !== this.lastPushedSearch) {
        this.lastPushedSearch = fromUrl;
        this.searchText.set(fromUrl);
      }
    });

    this.destroyRef.onDestroy(() => clearTimeout(this.copyTimer));
  }

  // -------------------------------------------------------------- handlers

  protected onSearch(value: string): void {
    this.searchText.set(value);
  }

  protected onEra(value: string): void {
    this.patch({ era: value || null });
  }

  protected onType(value: string): void {
    this.patch({ type: value || null });
  }

  protected onAlbum(value: string): void {
    this.patch({ album: value || null });
  }

  protected onConfidence(value: string): void {
    this.patch({ confidence: value || null });
  }

  protected toggleSort(key: SortKey): void {
    const next: SortDir = this.sortKey() === key && this.sortDir() === 'asc' ? 'desc' : 'asc';
    this.patch({ sort: key, dir: next });
  }

  protected ariaSort(key: SortKey): 'ascending' | 'descending' | 'none' {
    if (this.sortKey() !== key) return 'none';
    return this.sortDir() === 'asc' ? 'ascending' : 'descending';
  }

  protected clearFilters(): void {
    this.searchText.set('');
    this.lastPushedSearch = '';
    this.patch({ q: null, era: null, type: null, album: null, confidence: null });
  }

  protected async copyCsv(): Promise<void> {
    const rows = this.rows();
    const csv = toCsv([
      ['Song', 'Album(s)', 'Year', 'Type'],
      ...rows.map((song) => [
        song.title,
        song.albums.join('; '),
        song.year === null ? '' : String(song.year),
        song.type,
      ]),
    ]);

    const copied = await copyToClipboard(csv);
    this.copyStatus.set(
      copied
        ? `Copied ${rows.length} ${rows.length === 1 ? 'row' : 'rows'} as CSV.`
        : 'Copy failed. Your browser blocked clipboard access.',
    );
    clearTimeout(this.copyTimer);
    this.copyTimer = setTimeout(() => this.copyStatus.set(''), 4000);
  }

  /** Merges into the existing query params. A null value removes that param. */
  private patch(params: Record<string, string | null>): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: params,
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}

/** Returns the value only if it is one the data actually offers, otherwise ''. */
function pick<T extends string>(value: string | undefined, allowed: readonly T[]): T | '' {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : '';
}
