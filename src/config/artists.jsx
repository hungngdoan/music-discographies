import { lazy } from 'react';

import indexData from '../content/index.json';

// The registry is small and always needed, so it rides along in the entry
// chunk. The artist files are not: each one is pulled in only when that artist
// is opened.
//
// Vite resolves this glob at build time into a static map of dynamic imports,
// one chunk per artist file. Nothing is requested until a loader is actually
// called, so reading one artist never downloads the rest of the collection: the
// hundredth artist adds a chunk the other ninety-nine never fetch. The entry
// chunk is not perfectly flat, though. index.json metadata and Vite's generated
// loader map both grow by one entry per artist, so first paint creeps by a few
// bytes each time; what stays constant is that no artist's data is loaded until
// it is opened. A bare `import('../content/' + file)` would not survive
// bundling; the glob is what keeps the paths statically analysable.
//
// index.json is excluded rather than filtered afterwards: left in, it would be
// bundled a second time as its own unreachable chunk, since a glob entry that
// is never called still gets emitted.
const artistFiles = import.meta.glob(['../content/*.json', '!../content/index.json']);

const loadDetailComponent = () => import('../components/react/ArtistDetail.jsx');

/**
 * Pairs the detail component with one artist's data behind a single promise,
 * so React.lazy suspends once and resumes with everything it needs to render.
 * Loading them separately would mean a second suspend on the data, and a frame
 * of empty scaffolding between the two.
 *
 * The result is memoised per artist: repeat calls resolve from the module cache,
 * which is what makes `preload` free to fire on every hover.
 */
const withArtistData = (loadData) => {
  let pending;
  return () => {
    pending ??= Promise.all([loadDetailComponent(), loadData()])
      .then(([module, data]) => ({
        default: (props) => <module.default {...props} data={data.default ?? data} />,
      }))
      // Drop the memo on failure so this layer is not a second cache on top of
      // the browser's.
      //
      // Do not assume this buys a working retry. The HTML Standard now removes
      // module-map entries after network and non-OK HTTP failures, so a later
      // import of the same URL is permitted to fetch again, but engines lag the
      // spec and parse or evaluation failures stay cached either way. Measured
      // in Chromium here: after a failed fetch the request count stayed at one
      // across the retry, so nothing was re-requested.
      //
      // The recovery that always works is the reload ArtistBoundary offers,
      // which is also the only option for the case that motivated it: a
      // content-hashed chunk deleted by a deploy is gone from the server, and
      // no amount of retrying will bring that URL back.
      .catch((error) => {
        pending = undefined;
        throw error;
      });
    return pending;
  };
};

export const registryUpdated = indexData.updated;

export const artistRegistry = indexData.artists.map((entry) => {
  const key = `../content/${entry.file}`;
  const loadData = artistFiles[key];

  // scripts/validate-data.mjs already rejects a registered file that is missing
  // from disk, so this only fires if the data moved without the glob following
  // it. Failing here, by name, beats "loadData is not a function" at click time.
  if (!loadData) {
    throw new Error(
      `index.json registers "${entry.file}" but no such file exists under src/content/.`,
    );
  }

  const load = withArtistData(loadData);

  return {
    ...entry,
    component: lazy(load),
    // Speculative, so its failures are not the user's problem yet and must not
    // surface as unhandled rejections. The real attempt is the click, which
    // goes through lazy() and reports through the error boundary.
    preload: () => {
      load().catch(() => {});
    },
  };
});

export const artistById = new Map(artistRegistry.map((artist) => [artist.id, artist]));
