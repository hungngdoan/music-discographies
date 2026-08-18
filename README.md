# music-discographies

A personal reference site listing songs by artist, the album or albums each song
appeared on, and the year of first release. The data is hand-curated JSON,
committed to this repo, and bundled into the site at build time.

**Live site:** https://hungngdoan.github.io/music-discographies/

Contains no lyrics, artwork, photographs or audio, and never will.

Currently one artist: **Maroon 5**, 215 entries covering the Maroon 5 and
Kara's Flowers eras plus three unreleased tracks. The dataset is complete
against its stated scope; see `docs/SOURCES.md` for the one known gap.

---

## Stack

- Astro 5, static output, one prerendered page
- React 18 as a single hydrated island
- Tailwind CSS 3 for layout, component stylesheets for everything else
- JSON Schema plus a custom validator, enforced in CI and on pre-commit
- Deployed to GitHub Pages by GitHub Actions

---

## Local development

```bash
npm ci
npm start          # dev server at http://localhost:4210/music-discographies/
```

| Script                 | What it does                                                     |
| :--------------------- | :--------------------------------------------------------------- |
| `npm start`            | Dev server on port 4210. See "Dev server port".                  |
| `npm run build`        | Production build into `dist/`. This is what the workflow runs.   |
| `npm run preview`      | Serves the built `dist/` exactly as Pages will.                  |
| `npm run validate`     | Validates the data against the schemas and the cross-file rules. |
| `npm run db:export`    | Exports the data to `build/discography.db` (SQLite, gitignored). |
| `npm run format`       | Prettier over the repo.                                          |
| `npm run format:check` | Prettier in check mode, as CI runs it.                           |

A husky pre-commit hook runs Prettier and `validate-data.mjs` on staged files.

### Dev server port

This project serves on **4210**, pinned in the `dev` and `preview` scripts, so
it can run alongside the other sites in this workspace without a clash:

| Port        | Project                                              |
| :---------- | :--------------------------------------------------- |
| 4210        | **music-discographies** (this repo)                  |
| 4321        | goc-cua-hung (Astro)                                 |
| 4322        | ut-msai-archive (Astro)                              |
| 8080        | hung-blog (Eleventy default)                         |
| 8081        | BiKipCuaGai (Eleventy)                               |
| 8082 and up | MSAI-2026-Prep, which increments when a port is busy |

Override for a one-off run without editing anything:

```bash
npm run dev -- --port 4399
```

---

## GitHub Pages

This is a **project site** served from a subpath, not a user site at the domain
root. `base: '/music-discographies'` in `astro.config.mjs` is what makes that
work: Astro rewrites every asset and script URL to sit under that prefix at
build time.

If the repo is ever renamed, that one string must change.

There is no SPA fallback to maintain and no `404.html` to keep in sync. The
open artist lives in the URL **hash**, and a hash never reaches the server, so
`https://hungngdoan.github.io/music-discographies/#maroon-5` is served by the
real `index.html` and returns HTTP 200. `src/pages/404.astro` is therefore an
actual not-found page rather than a copy of the app shell.

---

## Architecture

```
src/pages/index.astro          the only real page; mounts the island
src/pages/404.astro            a genuine 404, not an SPA fallback
src/layouts/Base.astro         head, Open Graph, the base-URL helper
src/config/artists.jsx         the registry: lazy loaders, one per artist
src/components/react/          the island and its two views
src/content/                   the data
src/lib/csv.js                 CSV serialisation and clipboard access
src/styles/global.css          tokens, base elements, shared primitives
```

The whole browser is one `client:load` island, `DiscographyBrowser.jsx`, which
switches between two views:

- `ArtistList.jsx`, bundled with the island because it is always the first thing shown.
- `ArtistDetail.jsx`, lazy, because most visits read one artist and never need the rest.

### The registry

`src/config/artists.jsx` is the piece worth understanding. It imports
`index.json` eagerly, which is small and always needed, and resolves every
artist file through `import.meta.glob` into a map of dynamic imports that Vite
splits into one chunk per artist.

Each registry entry exposes a loader that resolves the detail component and
that artist's data as a single promise, so `React.lazy` suspends once rather
than twice. The same loader is exposed as `preload` and fired on pointer enter,
pointer down and focus, so the chunk is usually already there by the time the
click lands. Repeat calls are free: a dynamic import resolves from the module
cache after the first.

The effect is that opening one artist downloads one artist. Adding the
hundredth artist does not change what the first ninety-nine cost to load.

### URL state

- The **hash** carries the open artist: `#maroon-5`.
- The **query string** carries that artist's filter and sort state, for example
  `?q=sugar&era=maroon-5&sort=year&dir=desc`.

Splitting them means the shell never has to parse or preserve filters it knows
nothing about, and a filtered view stays shareable and survives a refresh.
Filter changes use `replaceState`, so dragging a select through four options
does not bury the artist list under four back-button presses. Opening an artist
uses `pushState` and drops the query string, because carrying one artist's album
filter onto a different catalogue would silently match nothing.

An unrecognised value in either place is ignored rather than honoured, so a
stale or hand-edited link degrades to "no filter" instead of a dead end.

---

## Data

```
src/content/index.json          artist registry
src/content/maroon-5.json       one file per artist
schemas/                        JSON Schemas, enforced in CI
scripts/validate-data.mjs       validation
scripts/to-sqlite.mjs           SQLite exporter
docs/SCHEMA.md                  every field, with worked examples
docs/SOURCES.md                 per-artist source URLs
docs/source-notes/              the research notes each dataset came from
```

`docs/SCHEMA.md` is the reference. The two rules worth repeating:

- `songs[].albums` is **always an array**, even for one album. A song on three
  albums is one row with three album names, never three rows.
- `songs[].year` is the year of **first commercial release**, which may precede
  the parent album's year. `Memories` is a 2019 song on a 2021 album. Do not
  normalise these to match.

### Adding an artist

1. Create `src/content/{artist-id}.json`. The id is lowercase kebab-case and
   must equal the filename stem.
2. Fill in `artist`, `eras`, `albums`, `songs` in that key order, following
   `docs/SCHEMA.md`. Keep `songs` and `albums` sorted by `id`.
3. Add the entry to `src/content/index.json`, keeping `artists` sorted by
   `sortName`. Set `songCount` to the exact number of songs in the file.
4. Add a section to `docs/SOURCES.md` recording where the data came from and
   which parts are below `high` confidence.
5. Run `npm run format` then `npm run validate`. Fix everything it reports.
6. Commit. The pre-commit hook re-runs both.

No wiring is needed beyond step 3. The registry discovers the file through the
glob and code-splits it automatically.

The validator is deliberately strict: it checks key order, sort order, that
every album referenced by a song is declared, and that every declared album is
used by a song. This keeps years of hand edits reviewable.

### SQLite export

`npm run db:export` writes a normalised `build/discography.db` with `artists`,
`albums`, `songs` and a `song_albums` junction table. It uses Node's built-in
`node:sqlite`, so there is no native module to compile. The output is
gitignored. It exists to de-risk a possible move off JSON later, and it reports
any album title on a song that is missing from `albums[]`.

---

## Performance notes

- First load is about 151 kB of JavaScript. The artist data and the detail view
  are not part of it; they arrive only when an artist is opened.
- The artist list is prerendered into `index.html`, so the first paint has real
  content rather than an empty mount point.
- Filtering and sorting are `useMemo` over the loaded array.
- The search input is debounced at 150ms before it reaches the URL.
- View changes are CSS animations, not a JavaScript animation library. A
  library would have added roughly 114 kB to the entry chunk to fade one panel.
- The song table is a plain `<table>`. Above roughly **500 songs for a single
  artist**, replace it with a virtual scroller. Maroon 5 is 215, so a plain
  table is correct today. This is the trigger to revisit, not a TODO.

---

## Licensing

**This repository carries no license file, by choice.** No `LICENSE`, no
`COPYING`. All rights are therefore reserved by default and no reuse rights are
granted to anyone.

If this repo is ever made public and you want the data reusable, that decision
needs making explicitly: the factual content is compiled from Wikipedia, which
is CC BY-SA. Song titles, album names, years and credits are facts and are not
themselves copyrightable, but the selection and arrangement of a compiled list
can attract database rights in the EU and UK. `docs/source-notes/maroon-5.md`
records the original recommendation. That is a decision to make deliberately,
not a default to drift into.

Nothing in this repo is legal advice.

---

## Unofficial

Not affiliated with, endorsed by or sponsored by any artist or record label.
Artist and album names are used descriptively for identification.
