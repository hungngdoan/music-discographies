import { HttpErrorResponse } from '@angular/common/http';
import { Observable, catchError, map, of, startWith } from 'rxjs';

import { UnknownArtistError } from './discography.service';

/** Every remote read is in exactly one of these three states, and every template handles all three. */
export type AsyncState<T> =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'ready'; readonly value: T };

export const LOADING: AsyncState<never> = { status: 'loading' };

/** Wraps a request so the template never sees a raw error or an undefined value. */
export function asAsyncState<T>(source: Observable<T>): Observable<AsyncState<T>> {
  return source.pipe(
    map((value): AsyncState<T> => ({ status: 'ready', value })),
    startWith(LOADING as AsyncState<T>),
    catchError((error: unknown) =>
      of<AsyncState<T>>({ status: 'error', message: describe(error) }),
    ),
  );
}

function describe(error: unknown): string {
  if (error instanceof UnknownArtistError) return error.message;

  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) {
      return 'Could not reach the data files. Check your connection and try again.';
    }
    if (error.status === 404) {
      return 'That data file is missing from the site. It may not have been deployed yet.';
    }
    return `The data file could not be loaded (HTTP ${error.status}).`;
  }

  if (error instanceof SyntaxError) {
    return 'The data file is not valid JSON. It is probably corrupt in the deployed build.';
  }

  return error instanceof Error ? error.message : 'Something went wrong loading the data.';
}
