import React, { Suspense, useEffect, useRef, useState, useTransition } from 'react';

import ArtistList from './ArtistList.jsx';
import { artistById, artistRegistry, registryUpdated } from '../../config/artists.jsx';
import './DiscographyBrowser.css';

// A lazy chunk that fails to arrive throws while rendering, and without a
// boundary React unmounts the whole island: header, footer and the artist list
// all disappear, not just the table. That is not a rare case. Chunk filenames
// are content-hashed and the old ones are deleted on every deploy, so anyone
// holding the page open across a deploy asks for a file that is already gone.
// Keyed by artist id so a failed artist does not poison the next one, and
// reloading is offered because a stale build really is the likely cause.
class ArtistBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="status status--error" role="alert">
        <h1>This artist could not be loaded</h1>
        <p>
          The data file did not arrive. If the site was deployed while this page was open, a reload
          will pick up the current build.
        </p>
        <p>
          <button type="button" className="button" onClick={() => window.location.reload()}>
            Reload the page
          </button>
        </p>
      </div>
    );
  }
}

export default function DiscographyBrowser() {
  // null is the artist list. Anything else is an id that came out of the
  // registry, so `artistById.get` below can never miss.
  const [artistId, setArtistId] = useState(null);
  // View changes are transitions, so the list stays on screen instead of
  // collapsing to a spinner while the artist chunk loads. That also means a
  // click has no visible effect until the chunk lands, which is what `isPending`
  // covers on the slow path that preloading did not already catch.
  const [isPending, startTransition] = useTransition();
  const mainRef = useRef(null);

  // The open artist lives in the URL hash, so a refresh or a shared link
  // restores it and back/forward walk through previously opened artists.
  // Applied after mount rather than in the initial state, so the hydrated
  // markup matches the prerendered HTML exactly.
  //
  // The hash carries the artist; the query string carries that artist's filter
  // and sort state, which ArtistDetail owns. Splitting them this way means the
  // shell never has to parse or preserve filters it knows nothing about.
  useEffect(() => {
    const applyHash = () => {
      // decodeURIComponent throws URIError on a malformed escape such as "#%".
      // Unguarded, that throw escapes this effect during mount, the listeners
      // below are never attached and the island renders nothing at all. Artist
      // ids are ASCII kebab-case per the schema, so the raw fragment is a
      // perfectly good fallback.
      const raw = window.location.hash.slice(1);
      let hash;
      try {
        hash = decodeURIComponent(raw);
      } catch {
        hash = raw;
      }
      // An unknown id falls back to the list rather than an error page: a stale
      // or hand-edited link degrades to "here is everything" instead of a dead end.
      const next = artistById.has(hash) ? hash : null;
      startTransition(() => setArtistId(next));
    };

    applyHash();
    window.addEventListener('popstate', applyHash);
    window.addEventListener('hashchange', applyHash);
    return () => {
      window.removeEventListener('popstate', applyHash);
      window.removeEventListener('hashchange', applyHash);
    };
  }, []);

  /** Current URL minus the origin, for comparing against a navigation target. */
  const here = () => window.location.pathname + window.location.search + window.location.hash;

  // Both navigations push only when the URL actually changes. Without the
  // guard, clicking the wordmark three times on the list stacks three
  // identical entries and Back appears to do nothing.
  const navigate = (target) => {
    if (here() !== target) window.history.pushState(null, '', target);
  };

  const openArtist = (artist) => {
    startTransition(() => setArtistId(artist.id));
    // Drops any query string along with the hash change. Filter state belongs
    // to the artist that was open, and carrying it onto a different catalogue
    // would silently apply an album filter that matches nothing.
    navigate(`${window.location.pathname}#${artist.id}`);
  };

  const showList = () => {
    startTransition(() => setArtistId(null));
    navigate(window.location.pathname);
  };

  // Moving between views unmounts whatever had focus, which drops the caret to
  // <body>: keyboard users lose their place and screen readers announce
  // nothing. Focusing the main region instead makes the new view the next
  // thing read. Skipped on first paint so the page does not steal focus on load.
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    mainRef.current?.focus();
  }, [artistId]);

  const artist = artistId ? artistById.get(artistId) : null;

  return (
    <>
      {/* The hash is the router. A real jump to "#main" would fire hashchange,
          resolve "main" as an unknown artist and throw the reader back to the
          artist list, so this moves focus directly instead. */}
      <a
        className="skip-link"
        href="#main"
        onClick={(event) => {
          event.preventDefault();
          mainRef.current?.focus();
          mainRef.current?.scrollIntoView();
        }}
      >
        Skip to content
      </a>

      <header className="site-header">
        <div className="shell">
          <a
            className="wordmark"
            href="#"
            onClick={(event) => {
              event.preventDefault();
              showList();
            }}
          >
            Music Discographies
          </a>
          <p className="tagline">
            A hand-curated reference. Song titles, the albums they appear on, and years.
          </p>
        </div>
      </header>

      <main
        id="main"
        ref={mainRef}
        className="shell"
        tabIndex={-1}
        data-pending={isPending ? 'true' : undefined}
      >
        {/* Keyed so React remounts the subtree on every view change, which is
            what restarts the CSS entry animation. framer-motion would give an
            exit animation too, and cost 114 kB of JavaScript to do it; the
            reduced-motion opt-out lives in the stylesheet either way. */}
        <div className="view" key={artistId ?? '__list__'}>
          {artist ? (
            <ArtistBoundary key={artist.id}>
              <Suspense
                fallback={
                  <p className="status" role="status">
                    Loading discography…
                  </p>
                }
              >
                <artist.component onBack={showList} />
              </Suspense>
            </ArtistBoundary>
          ) : (
            <ArtistList artists={artistRegistry} updated={registryUpdated} onOpen={openArtist} />
          )}
        </div>
      </main>

      <footer className="site-footer">
        <div className="shell">
          <p>
            Factual discography data compiled from Wikipedia, Discogs, AllMusic and Apple Music.
            Contains no lyrics, artwork, photographs or audio.
          </p>
          <p>
            Unofficial and not affiliated with, endorsed by or sponsored by any artist or label.
            Artist and album names are used descriptively for identification.
          </p>
        </div>
      </footer>
    </>
  );
}
