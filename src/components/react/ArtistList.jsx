import { useMemo, useRef, useState } from 'react';

import './ArtistList.css';

// Build-time constant, identical on the server and in the browser, so the
// prerendered href and the hydrated one match.
const base = import.meta.env.BASE_URL.replace(/\/$/, '');

export default function ArtistList({ artists, updated, onOpen }) {
  const [filter, setFilter] = useState('');
  const filterRef = useRef(null);

  // The "Clear the filter" button lives inside the empty state it clears, so
  // pressing it removes the element that has focus and drops the caret to
  // <body>. Same self-removing-control problem as clearFilters in
  // ArtistDetail, same fix: hand focus back to the input that is still there.
  const clearFilter = () => {
    setFilter('');
    filterRef.current?.focus();
  };

  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return artists;
    return artists.filter((artist) =>
      `${artist.name} ${artist.origin} ${artist.active}`.toLowerCase().includes(needle),
    );
  }, [artists, filter]);

  return (
    <>
      <h1 className="page-title">Artists</h1>
      <p className="meta">
        {artists.length} {artists.length === 1 ? 'artist' : 'artists'} · registry updated{' '}
        <time dateTime={updated}>{updated}</time>
      </p>

      <div className="filter-row">
        <label className="field">
          <span className="field__label">Filter artists</span>
          <input
            ref={filterRef}
            type="search"
            name="artist-filter"
            autoComplete="off"
            placeholder="Name, origin or years"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
        </label>
        <p className="count" role="status" aria-live="polite">
          Showing {visible.length} of {artists.length}
        </p>
      </div>

      {visible.length === 0 ? (
        <p className="status">
          No artist matches “{filter}”.{' '}
          <button
            type="button"
            className="link-button"
            data-testid="clear-artist-filter"
            onClick={clearFilter}
          >
            Clear the filter
          </button>
        </p>
      ) : (
        <ul className="artist-grid">
          {visible.map((artist) => (
            <li key={artist.id}>
              {/* A real href, so the card keeps middle-click, "open in new tab"
                  and a readable status bar target. It has to be an absolute
                  path rather than a bare "#id": a fragment-only href resolves
                  against the current URL, so a modified click would carry this
                  page's query string into the artist and apply one catalogue's
                  filters to another. The handler covers the ordinary click,
                  where the transition and the same query-drop happen in JS. */}
              <a
                className="artist-card"
                data-testid="artist-card"
                href={`${base}/#${artist.id}`}
                onClick={(event) => {
                  if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0)
                    return;
                  event.preventDefault();
                  onOpen(artist);
                }}
                // Warm the artist chunk as soon as intent shows, so the click
                // itself usually has nothing to wait for. pointerenter covers
                // mouse and pen, focus covers keyboard, and pointerdown is the
                // last chance on touch, where there is no hover but a press
                // still precedes the click. Repeat calls are free while the
                // load is pending or already resolved; after a rejection the
                // registry drops its memo, so the next call starts real work
                // again.
                onPointerEnter={() => artist.preload?.()}
                onPointerDown={() => artist.preload?.()}
                onFocus={() => artist.preload?.()}
              >
                <h2>{artist.name}</h2>
                <dl>
                  <div>
                    <dt>Active</dt>
                    <dd>{artist.active}</dd>
                  </div>
                  <div>
                    <dt>Origin</dt>
                    <dd>{artist.origin}</dd>
                  </div>
                  <div>
                    <dt>Songs</dt>
                    <dd>{artist.songCount}</dd>
                  </div>
                </dl>
              </a>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
