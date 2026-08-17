import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, shareReplay, switchMap, throwError } from 'rxjs';

import { ArtistIndex, ArtistIndexEntry, Discography } from '../models/discography.model';

/** Thrown when a route asks for an artist id that is not in the registry. */
export class UnknownArtistError extends Error {
  constructor(readonly artistId: string) {
    super(`There is no artist with the id "${artistId}" in this collection.`);
    this.name = 'UnknownArtistError';
  }
}

/**
 * Reads the JSON data files over HTTP at runtime.
 *
 * The paths are relative and carry no leading slash on purpose. They resolve
 * against the document base URL, which the build sets with --base-href, so the
 * same code works at the domain root under `ng serve` and under the
 * /music-discographies/ subpath on GitHub Pages.
 *
 * Nothing here is imported statically. Bundling the data would inline every
 * artist into the JS bundle and force a visitor to download the whole
 * collection to read one page.
 */
@Injectable({ providedIn: 'root' })
export class DiscographyService {
  private readonly http = inject(HttpClient);

  private readonly index$ = this.http
    .get<ArtistIndex>('assets/data/index.json')
    .pipe(shareReplay({ bufferSize: 1, refCount: false }));

  private readonly files = new Map<string, Observable<Discography>>();

  index(): Observable<ArtistIndex> {
    return this.index$;
  }

  /**
   * Resolves the id through the registry before fetching anything, so an
   * unknown id produces a readable message instead of a 404, and a crafted id
   * can never be interpolated into a request path.
   */
  discography(artistId: string): Observable<Discography> {
    return this.index$.pipe(
      switchMap((index) => {
        const entry = index.artists.find((a) => a.id === artistId);
        return entry ? this.file(entry) : throwError(() => new UnknownArtistError(artistId));
      }),
    );
  }

  private file(entry: ArtistIndexEntry): Observable<Discography> {
    let cached = this.files.get(entry.id);
    if (!cached) {
      cached = this.http
        .get<Discography>(`assets/data/${entry.file}`)
        .pipe(shareReplay({ bufferSize: 1, refCount: false }));
      this.files.set(entry.id, cached);
    }
    return cached;
  }
}
