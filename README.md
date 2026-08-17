# music-discographies

A personal reference site listing songs by artist, the album or albums each song
appeared on, and the year of first release. The data is hand-curated JSON,
committed to this repo, and loaded by the app at runtime.

**Live site:** https://hungngdoan.github.io/music-discographies/

Contains no lyrics, artwork, photographs or audio, and never will.

Currently one artist: **Maroon 5**, 215 entries covering the Maroon 5 and
Kara's Flowers eras plus three unreleased tracks. The dataset is complete
against its stated scope; see `docs/SOURCES.md` for the one known gap.

---

## Stack

- Angular 22, standalone components, no NgModules
- Angular Signals for state; RxJS only at the HTTP boundary
- TypeScript strict mode
- Hand-written CSS, no UI component library
- Deployed to GitHub Pages by GitHub Actions

---

## Local development

Requires Node `^22.22.3 || ^24.15.0 || >=26.0.0` (Angular 22's supported range).

```bash
npm ci
npm start          # dev server at http://localhost:4210/
```

| Script                 | What it does                                                     |
| :--------------------- | :--------------------------------------------------------------- |
| `npm start`            | Dev server on port 4210. See "Dev server port".                  |
| `npm run build`        | Production build at the domain root. For local checks only.      |
| `npm run build:gh`     | **The deploy build.** Sets `--base-href` and writes `404.html`.  |
| `npm run validate`     | Validates the data against the schemas and the cross-file rules. |
| `npm run types:gen`    | Regenerates the TypeScript model from the schemas.               |
| `npm run db:export`    | Exports the data to `build/discography.db` (SQLite, gitignored). |
| `npm run format`       | Prettier over the repo.                                          |
| `npm run format:check` | Prettier in check mode, as CI runs it.                           |

A husky pre-commit hook runs Prettier and `validate-data.mjs` on staged files.

### Dev server port

This project serves on **4210**, pinned in `angular.json` under
`projects.music-discographies.architect.serve.options.port`, so it can run
alongside the other sites in this workspace without a clash:

| Port        | Project                                              |
| :---------- | :--------------------------------------------------- |
| 4210        | **music-discographies** (this repo)                  |
| 4321        | goc-cua-hung (Astro)                                 |
| 4322        | ut-msai-archive (Astro)                              |
| 8080        | hung-blog (Eleventy default)                         |
| 8081        | BiKipCuaGai (Eleventy)                               |
| 8082 and up | MSAI-2026-Prep, which increments when a port is busy |

Angular's default is 4200. It is deliberately not used here: it is the port
every Angular project grabs by default, so a second Angular repo in this
workspace would collide with it on day one. 4210 also sits clear of the 808x
range, where MSAI-2026-Prep walks upward whenever a port is taken.

Override for a one-off run without editing anything:

```bash
npm start -- --port 4399
```

`ng serve` fails rather than silently moving if the port is occupied, so a
clash is loud instead of confusing.

---

## The two GitHub Pages requirements

This is a **project site** served from a subpath, not a user site at the domain
root. Two things follow from that, and both are easy to get wrong because
everything works fine under `ng serve` either way.

### 1. `--base-href /music-discographies/`

Every asset and data request in the app is relative and resolves against the
document's `<base href>`. `src/index.html` ships `<base href="/">` for the dev
server; the deploy build rewrites it:

```bash
ng build --base-href /music-discographies/
```

Get this wrong and you get a blank page with a 404 on every bundle, because the
browser asks for `https://hungngdoan.github.io/main-ABC123.js` instead of
`https://hungngdoan.github.io/music-discographies/main-ABC123.js`.

It is wired into `npm run build:gh`, which is what the workflow calls. If the
repo is ever renamed, this string must change in `package.json`.

### 2. `404.html` must be a copy of `index.html`

The app uses Angular's default pushState router, not hash routing. GitHub Pages
serves static files with no rewrite rules, so a request for
`/music-discographies/artist/maroon-5` matches no file on disk and returns 404.
That breaks refreshes and every shared deep link.

Pages serves `404.html` for any unmatched path. Making it a byte-identical copy
of `index.html` means the app boots on that response and the router resolves the
route from the URL. `scripts/copy-404.mjs` does the copy as a post-build step in
`npm run build:gh`, and the workflow fails if the file is missing.

The visitor still gets an HTTP 404 status on a deep link. The page renders
correctly, which is what matters here.

---

## Data

```
src/assets/data/index.json      artist registry
src/assets/data/maroon-5.json   one file per artist
schemas/                        JSON Schemas, enforced in CI
scripts/validate-data.mjs       validation
scripts/to-sqlite.mjs           SQLite exporter
docs/SCHEMA.md                  every field, with worked examples
docs/SOURCES.md                 per-artist source URLs
docs/source-notes/              the research notes each dataset came from
```

Data files are fetched over HTTP at runtime, never imported. Importing them
would inline every artist into the JS bundle, grow it with each artist added,
and make a visitor download the whole collection to read one page.

`docs/SCHEMA.md` is the reference. The two rules worth repeating:

- `songs[].albums` is **always an array**, even for one album. A song on three
  albums is one row with three album names, never three rows.
- `songs[].year` is the year of **first commercial release**, which may precede
  the parent album's year. `Memories` is a 2019 song on a 2021 album. Do not
  normalise these to match.

### Adding an artist

1. Create `src/assets/data/{artist-id}.json`. The id is lowercase kebab-case and
   must equal the filename stem.
2. Fill in `artist`, `eras`, `albums`, `songs` in that key order, following
   `docs/SCHEMA.md`. Keep `songs` and `albums` sorted by `id`.
3. Add the entry to `src/assets/data/index.json`, keeping `artists` sorted by
   `sortName`. Set `songCount` to the exact number of songs in the file.
4. Add a section to `docs/SOURCES.md` recording where the data came from and
   which parts are below `high` confidence.
5. Run `npm run format` then `npm run validate`. Fix everything it reports.
6. Commit. The pre-commit hook re-runs both.

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

- Every component is `OnPush`; the app is zoneless.
- Filtering and sorting are computed signals over the loaded array.
- The search input is debounced at 150ms before it reaches the URL.
- Routes are lazy-loaded, so the artist list does not pull in the detail page.
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
