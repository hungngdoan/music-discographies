import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { copyToClipboard, toCsv } from '../../lib/csv.js';
import './ArtistDetail.css';

/** Best to worst, so the select reads in a sensible order. */
const CONFIDENCE_ORDER = ['high', 'medium', 'low', 'unverified'];

const SEARCH_DEBOUNCE_MS = 150;

const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true });

const readParams = () =>
  typeof window === 'undefined'
    ? {}
    : Object.fromEntries(new URLSearchParams(window.location.search).entries());

/** Returns the value only if it is one the data actually offers, otherwise ''. */
const pick = (value, allowed) => (value && allowed.includes(value) ? value : '');

export default function ArtistDetail({ data, onBack }) {
  const { artist, eras, albums, songs } = data;

  // ------------------------------------------------- filter and sort state
  // The query string is the only source of truth for filter and sort, which is
  // what makes a filtered view shareable and lets it survive a refresh. The
  // hash, which carries the artist, is preserved on every write.
  const [params, setParams] = useState(readParams);

  const patch = useCallback((changes) => {
    setParams((current) => {
      const next = { ...current };
      for (const [key, value] of Object.entries(changes)) {
        if (value === null || value === '') delete next[key];
        else next[key] = value;
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const search = new URLSearchParams(params).toString();
    // replaceState, not pushState: dragging a select through four options
    // should not bury the artist list under four back-button presses.
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`,
    );
  }, [params]);

  // ------------------------------------------------------- search box state
  // The box updates instantly; the query string, and therefore the table,
  // follow after a short pause so a burst of typing is one URL write.
  const [searchText, setSearchText] = useState(() => (readParams().q ?? '').trim());

  // The query string is read when this component mounts, and history traversal
  // between two entries for the same artist does not remount it. Re-reading on
  // popstate keeps the URL, the search box and the table from drifting apart.
  // searchText is reset alongside params so the pending debounce below
  // re-fires with the restored value rather than overwriting it with the old one.
  useEffect(() => {
    const resync = () => {
      const next = readParams();
      setParams(next);
      setSearchText((next.q ?? '').trim());
    };
    window.addEventListener('popstate', resync);
    return () => window.removeEventListener('popstate', resync);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => patch({ q: searchText.trim() || null }), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchText, patch]);

  // ------------------------------------------------------- filter options

  const typeOptions = useMemo(() => [...new Set(songs.map((song) => song.type))].sort(), [songs]);

  const albumOptions = useMemo(
    () => albums.map((album) => album.title).sort((a, b) => collator.compare(a, b)),
    [albums],
  );

  const confidenceOptions = useMemo(
    () => CONFIDENCE_ORDER.filter((level) => songs.some((song) => song.confidence === level)),
    [songs],
  );

  // --------------------------------------------------- normalised URL state
  // An unrecognised value is ignored rather than producing an empty table, so a
  // stale or hand-edited link degrades to "no filter" instead of "no results".

  const search = (params.q ?? '').trim().toLowerCase();
  const eraFilter = pick(
    params.era,
    eras.map((era) => era.id),
  );
  const typeFilter = pick(params.type, typeOptions);
  const albumFilter = pick(params.album, albumOptions);
  const confidenceFilter = pick(params.confidence, confidenceOptions);

  const sortKey = params.sort === 'year' ? 'year' : 'title';
  const sortDir = params.dir === 'desc' ? 'desc' : 'asc';

  const hasActiveFilter = Boolean(
    search || eraFilter || typeFilter || albumFilter || confidenceFilter,
  );

  // ------------------------------------------------------------- pipeline

  const filtered = useMemo(
    () =>
      songs.filter((song) => {
        if (eraFilter && song.era !== eraFilter) return false;
        if (typeFilter && song.type !== typeFilter) return false;
        if (albumFilter && !song.albums.includes(albumFilter)) return false;
        if (confidenceFilter && song.confidence !== confidenceFilter) return false;
        if (search) {
          const haystack = `${song.title} ${song.albums.join(' ')}`.toLowerCase();
          if (!haystack.includes(search)) return false;
        }
        return true;
      }),
    [songs, search, eraFilter, typeFilter, albumFilter, confidenceFilter],
  );

  /**
   * The rendered rows. A plain table is fine up to roughly 500 songs for one
   * artist; past that, swap in a virtual scroller. Maroon 5 is 215.
   */
  const rows = useMemo(() => {
    const factor = sortDir === 'desc' ? -1 : 1;
    return [...filtered].sort((a, b) => {
      if (sortKey === 'year') {
        // Undated material sorts last in both directions; it is not "year zero".
        if (a.year === null && b.year === null) return collator.compare(a.title, b.title);
        if (a.year === null) return 1;
        if (b.year === null) return -1;
        return (a.year - b.year) * factor || collator.compare(a.title, b.title);
      }
      return collator.compare(a.title, b.title) * factor || (a.year ?? 0) - (b.year ?? 0);
    });
  }, [filtered, sortKey, sortDir]);

  // ------------------------------------------------------------- handlers

  const toggleSort = (key) => {
    patch({ sort: key, dir: sortKey === key && sortDir === 'asc' ? 'desc' : 'asc' });
  };

  // Only the sorted column carries aria-sort. React omits the attribute for
  // undefined, which is what the ARIA table pattern expects on the others.
  const ariaSort = (key) => {
    if (sortKey !== key) return undefined;
    return sortDir === 'asc' ? 'ascending' : 'descending';
  };

  const searchRef = useRef(null);

  // Both entry points to this are buttons that remove themselves by clearing
  // the state that renders them, so focus would land on <body>. The search box
  // is the stable control nearest the thing that just changed.
  const clearFilters = () => {
    setSearchText('');
    patch({ q: null, era: null, type: null, album: null, confidence: null });
    searchRef.current?.focus();
  };

  const [copyStatus, setCopyStatus] = useState('');
  const copyTimer = useRef(undefined);

  useEffect(() => () => clearTimeout(copyTimer.current), []);

  const copyCsv = async () => {
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
    setCopyStatus(
      copied
        ? `Copied ${rows.length} ${rows.length === 1 ? 'row' : 'rows'} as CSV.`
        : 'Copy failed. Your browser blocked clipboard access.',
    );
    clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopyStatus(''), 4000);
  };

  // --------------------------------------------------------------- render

  return (
    <article>
      <header className="artist-header">
        <p className="crumb">
          <a
            data-testid="back-to-list"
            href="#"
            onClick={(event) => {
              event.preventDefault();
              onBack();
            }}
          >
            Artists
          </a>
        </p>
        <h1>{artist.name}</h1>

        <dl className="facts">
          <div>
            <dt>Origin</dt>
            <dd>{artist.origin}</dd>
          </div>
          <div>
            <dt>Active</dt>
            <dd>{artist.active}</dd>
          </div>
          <div>
            <dt>Songs</dt>
            <dd>{songs.length}</dd>
          </div>
          <div>
            <dt>Updated</dt>
            <dd>
              <time dateTime={artist.updated}>{artist.updated}</time>
            </dd>
          </div>
          {artist.aliases.length > 0 && (
            <div>
              <dt>Also as</dt>
              <dd>{artist.aliases.join(', ')}</dd>
            </div>
          )}
          {artist.genres.length > 0 && (
            <div>
              <dt>Genres</dt>
              <dd>{artist.genres.join(', ')}</dd>
            </div>
          )}
        </dl>

        <details className="scope">
          <summary>Scope and method</summary>
          <p>{artist.scopeNotes}</p>
        </details>
      </header>

      <section className="controls" aria-label="Filter and sort">
        <div className="controls__grid">
          <label className="field field--wide">
            <span className="field__label">Search</span>
            <input
              ref={searchRef}
              type="search"
              name="song-search"
              autoComplete="off"
              placeholder="Song title or album name"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />
          </label>

          <label className="field">
            <span className="field__label">Era</span>
            <select
              name="era"
              value={eraFilter}
              onChange={(event) => patch({ era: event.target.value || null })}
            >
              <option value="">All eras</option>
              {eras.map((era) => (
                <option key={era.id} value={era.id}>
                  {era.label} ({era.range})
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span className="field__label">Type</span>
            <select
              name="type"
              value={typeFilter}
              onChange={(event) => patch({ type: event.target.value || null })}
            >
              <option value="">All types</option>
              {typeOptions.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>

          <label className="field field--wide">
            <span className="field__label">Album</span>
            <select
              name="album"
              value={albumFilter}
              onChange={(event) => patch({ album: event.target.value || null })}
            >
              <option value="">All albums</option>
              {albumOptions.map((title) => (
                <option key={title} value={title}>
                  {title}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span className="field__label">Confidence</span>
            <select
              name="confidence"
              value={confidenceFilter}
              onChange={(event) => patch({ confidence: event.target.value || null })}
            >
              <option value="">Any confidence</option>
              {confidenceOptions.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="controls__bar">
          <p className="result-count" data-testid="result-count" role="status" aria-live="polite">
            <strong>{rows.length}</strong> of {songs.length} songs
            {hasActiveFilter && <span className="muted"> after filtering</span>}
          </p>

          <div className="actions">
            {hasActiveFilter && (
              <button
                type="button"
                className="button"
                data-testid="clear-filters"
                onClick={clearFilters}
              >
                Clear filters
              </button>
            )}
            <button
              type="button"
              className="button button--primary"
              data-testid="copy-csv"
              onClick={copyCsv}
            >
              Copy as CSV
            </button>
          </div>
        </div>

        <p className="copy-status" data-testid="copy-status" role="status" aria-live="polite">
          {copyStatus}
        </p>
      </section>

      {rows.length === 0 ? (
        <p className="status">
          No song matches these filters.{' '}
          <button
            type="button"
            className="link-button"
            data-testid="clear-filters-empty"
            onClick={clearFilters}
          >
            Clear them
          </button>{' '}
          to see all {songs.length} songs.
        </p>
      ) : (
        <div
          className="table-scroll"
          data-testid="table-scroll"
          tabIndex={0}
          role="region"
          aria-label={`${artist.name} songs`}
        >
          <table className="songs" data-testid="song-table">
            <caption className="visually-hidden">
              {rows.length} songs, sorted by {sortKey}{' '}
              {sortDir === 'asc' ? 'ascending' : 'descending'}. Songs released on more than one
              album list every album in the Album(s) column.
            </caption>
            <thead>
              <tr>
                <th scope="col" aria-sort={ariaSort('title')}>
                  <button
                    type="button"
                    className="sort"
                    data-testid="sort-title"
                    onClick={() => toggleSort('title')}
                  >
                    Song
                    <span className="sort__mark" aria-hidden="true">
                      {sortKey === 'title' ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
                    </span>
                  </button>
                </th>
                <th scope="col">Album(s)</th>
                <th scope="col" aria-sort={ariaSort('year')}>
                  <button
                    type="button"
                    className="sort"
                    data-testid="sort-year"
                    onClick={() => toggleSort('year')}
                  >
                    Year
                    <span className="sort__mark" aria-hidden="true">
                      {sortKey === 'year' ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
                    </span>
                  </button>
                </th>
                <th scope="col">Type</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((song) => (
                <tr
                  key={song.id}
                  data-testid="song-row"
                  className={song.albums.length > 1 ? 'is-multi' : undefined}
                >
                  <th scope="row" className="cell-song">
                    <span className="song-title" data-testid="song-title">
                      {song.title}
                    </span>
                    <span className="song-marks">
                      {song.isCover && (
                        <span className="badge badge--cover">
                          {song.originalArtist ? `cover · ${song.originalArtist}` : 'cover'}
                        </span>
                      )}
                      {song.confidence !== 'high' && (
                        <span className="badge badge--confidence" data-level={song.confidence}>
                          {song.confidence} confidence
                        </span>
                      )}
                    </span>
                    {song.notes && <span className="song-note">{song.notes}</span>}
                  </th>

                  <td className="cell-albums" data-testid="song-albums">
                    {song.albums.length > 0 ? (
                      <>
                        {song.albums.length > 1 && (
                          <span className="album-count">{song.albums.length} albums</span>
                        )}
                        <ul className="chips">
                          {song.albums.map((title) => (
                            <li key={title} className="chip">
                              {title}
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : (
                      <span className="no-album">
                        {song.type === 'unreleased' ? 'Never released' : 'No album release'}
                      </span>
                    )}
                  </td>

                  <td className="cell-year" data-testid="song-year">
                    {song.year === null ? 'n/a' : song.year}
                  </td>
                  <td className="cell-type" data-testid="song-type">
                    <span className="tag">{song.type}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}
