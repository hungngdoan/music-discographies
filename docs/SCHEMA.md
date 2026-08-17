# Data schema

Two JSON Schemas define the data and are enforced in CI:

- `schemas/index.schema.json` for `src/assets/data/index.json`
- `schemas/discography.schema.json` for `src/assets/data/{artist-id}.json`

`src/app/models/discography.model.ts` is generated from those schemas with
`npm run types:gen`. Never edit it by hand. CI regenerates it and fails if the
committed copy differs, so the validator and the compile-time types cannot drift
apart.

Run `npm run validate` to check the data. It applies the schemas plus the
cross-file and ordering rules further down this page.

---

## `index.json`

The registry. It is loaded first and the artist list page renders from it alone,
so a visitor never downloads an artist file they did not ask for.

| Field                 | Type    | Required | Notes                                                       |
| :-------------------- | :------ | :------- | :---------------------------------------------------------- |
| `updated`             | string  | yes      | ISO 8601 date (`YYYY-MM-DD`) the registry was last revised. |
| `artists`             | array   | yes      | At least one entry.                                         |
| `artists[].id`        | string  | yes      | Kebab-case slug. Must equal `artist.id` in the target file. |
| `artists[].name`      | string  | yes      | Display name. Must equal `artist.name` in the target file.  |
| `artists[].sortName`  | string  | yes      | Name to sort by, e.g. `Beatles, The`.                       |
| `artists[].origin`    | string  | yes      | Must equal `artist.origin` in the target file.              |
| `artists[].active`    | string  | yes      | Must equal `artist.active` in the target file.              |
| `artists[].songCount` | integer | yes      | Must equal `songs.length` in the target file.               |
| `artists[].file`      | string  | yes      | Filename relative to `src/assets/data/`.                    |

Key order is fixed: `updated`, `artists`; and within an entry `id`, `name`,
`sortName`, `origin`, `active`, `songCount`, `file`.

---

## `{artist-id}.json`

Four top-level keys, in this order: `artist`, `eras`, `albums`, `songs`.

### `artist`

| Field        | Type     | Required | Notes                                                         |
| :----------- | :------- | :------- | :------------------------------------------------------------ |
| `id`         | string   | yes      | Kebab-case. Must equal the filename stem and the registry id. |
| `name`       | string   | yes      | Display name.                                                 |
| `aliases`    | string[] | yes      | Other names the act recorded under. `[]` if none.             |
| `origin`     | string   | yes      | Free text.                                                    |
| `active`     | string   | yes      | Free text, e.g. `1994-present`.                               |
| `genres`     | string[] | yes      | `[]` if none.                                                 |
| `updated`    | string   | yes      | ISO 8601 date.                                                |
| `scopeNotes` | string   | yes      | What the dataset includes and excludes. Shown on the page.    |

### `eras`

A named period. Songs and albums reference an era by id. At least one required.

| Field   | Type   | Required | Notes                           |
| :------ | :----- | :------- | :------------------------------ |
| `id`    | string | yes      | Kebab-case, unique in the file. |
| `label` | string | yes      | Display label.                  |
| `range` | string | yes      | Free text, e.g. `2002-present`. |

### `albums`

Any release a song can appear on, including other artists' albums when a song
was released there.

| Field      | Type         | Required | Notes                                                                      |
| :--------- | :----------- | :------- | :------------------------------------------------------------------------- |
| `id`       | string       | yes      | Kebab-case, unique in the file.                                            |
| `title`    | string       | yes      | Exact title. Every string in `songs[].albums` must match one of these.     |
| `type`     | enum         | yes      | See the type enum below.                                                   |
| `released` | string       | no       | Full ISO 8601 date. **Omit the key entirely** when only the year is known. |
| `year`     | integer/null | yes      | Release year, or `null` for material never released.                       |
| `era`      | string       | yes      | Must match an `eras[].id`.                                                 |

### `songs`

| Field            | Type         | Required | Notes                                                                                      |
| :--------------- | :----------- | :------- | :----------------------------------------------------------------------------------------- |
| `id`             | string       | yes      | Kebab-case, unique in the file. See "Title collisions".                                    |
| `title`          | string       | yes      | Display title, including any `(feat. X)` / `(with X)` credit.                              |
| `albums`         | string[]     | yes      | **Always an array.** See "Multi-album songs".                                              |
| `year`           | integer/null | yes      | Year of **first commercial release**. See "Year".                                          |
| `type`           | enum         | yes      | See the type enum below.                                                                   |
| `era`            | string       | yes      | Must match an `eras[].id`.                                                                 |
| `features`       | string[]     | yes      | Guest artists. `[]` if none.                                                               |
| `isCover`        | boolean      | yes      | True if the recording is a cover.                                                          |
| `originalArtist` | string/null  | yes      | **Must be `null` when `isCover` is false.** May be null for an unknown original performer. |
| `confidence`     | enum         | yes      | `high`, `medium`, `low`, `unverified`.                                                     |
| `notes`          | string       | yes      | Free text. `""` when there is nothing to say.                                              |

---

## Enums

### `type`

Shared by `albums[].type` and `songs[].type`.

`studio`, `deluxe`, `reissue`, `compilation`, `ep`, `live`, `soundtrack`,
`single`, `remix`, `demo`, `unreleased`, `album-track`

For an album it describes the release. For a song it describes how that
recording reached the public:

- `album-track` is the default for a song on a studio, deluxe, reissue or EP release.
- `single` is a non-album single.
- `remix` is a remix issued as its own release.
- `compilation`, `soundtrack`, `live` mean the song's first home was that kind of release.
- `demo` is a demo recording, whether or not it was ever distributed.
- `unreleased` is material that was never released at all.

`demo` and `unreleased` overlap deliberately: a demo tape that circulated but
was never sold is `demo` with `year: null`, while a track that was recorded and
shelved is `unreleased`.

### `confidence`

- `high` — verified against the release itself or two independent sources.
- `medium` — sources agree on the recording but disagree on the exact edition it
  belongs to. Deluxe, Japanese, Korean and Australian editions land here often.
- `low` — fan-documented, or dates are approximate.
- `unverified` — carried over from a single source and not checked.

---

## Rules the schema alone cannot express

`scripts/validate-data.mjs` enforces all of these and fails the build on any
violation:

1. `artist.id` equals the filename stem and the registry `id`.
2. `index.json` `songCount`, `name`, `origin` and `active` match the artist file.
3. Every file on disk is registered, and every registered file exists.
4. Song ids, album ids, album titles and era ids are unique within a file.
5. Every `songs[].era` and `albums[].era` references a declared era.
6. Every string in `songs[].albums` matches an `albums[].title` exactly.
7. Every declared album is referenced by at least one song.
8. `originalArtist` is `null` whenever `isCover` is false.
9. `songs` is sorted by `id`; `albums` is sorted by `id`.
10. Keys appear in the canonical order listed above, in every object.
11. `released`, when present, is a real date whose year matches `year`.

Rules 9 and 10 exist for diff stability. This data is hand-edited for years, and
unstable ordering turns a one-field change into a 200-line diff.

---

## Year

`songs[].year` is the year of **first commercial release**, not the parent
album's year. The two often differ and must not be normalised to match.

```json
{
  "id": "memories",
  "title": "Memories",
  "albums": ["Jordi", "Love Is Like (Japan Special Edition)"],
  "year": 2019,
  "type": "album-track",
  "era": "maroon-5",
  "features": [],
  "isCover": false,
  "originalArtist": null,
  "confidence": "high",
  "notes": "Released as a single in 2019, two years before Jordi. The year column is first release, not album year."
}
```

`Jordi` is a 2021 album. `Memories` is a 2019 song. Both are correct.

`year` is `null` only for material that was never released.

---

## Multi-album songs

`songs[].albums` is **always an array of strings**, even for one album. Never
collapse it to a bare string. This is the central relationship in the dataset:
one row per song, listing every release it appeared on.

A three-album example:

```json
{
  "id": "sugar",
  "title": "Sugar",
  "albums": ["V", "Love Is Like (Japan Special Edition)", "Will Be Loved EP"],
  "year": 2014,
  "type": "album-track",
  "era": "maroon-5",
  "features": [],
  "isCover": false,
  "originalArtist": null,
  "confidence": "high",
  "notes": ""
}
```

The app renders this as a single row with three album chips and a "3 albums"
marker, never as three rows.

An **empty** `albums` array is meaningful: it marks a non-album single or
unreleased material. The app shows "No album release" or "Never released"
accordingly. Do not invent a placeholder album title for these.

---

## Title collisions

`songs[].id` is lowercase kebab-case derived from the title, ignoring any
`(feat. X)` or `(with X)` credit and any `(X cover)` annotation. When two
different songs reduce to the same slug, append the year:

```json
{
  "id": "closer-2004",
  "title": "Closer",
  "albums": ["\"She Will Be Loved\" Australian CD single B-side"],
  "year": 2004,
  "type": "single",
  "era": "maroon-5",
  "features": [],
  "isCover": true,
  "originalArtist": "Nine Inch Nails",
  "confidence": "medium",
  "notes": "Nine Inch Nails cover, B-side of the Australian \"She Will Be Loved\" CD single. A different song from closer-2025."
}
```

```json
{
  "id": "closer-2025",
  "title": "Closer (with Marshmello)",
  "albums": ["Love Is Like (Deluxe)"],
  "year": 2025,
  "type": "album-track",
  "era": "maroon-5",
  "features": ["Marshmello"],
  "isCover": false,
  "originalArtist": null,
  "confidence": "medium",
  "notes": "A different song from closer-2004, the 2004 Nine Inch Nails cover."
}
```

Two unrelated songs, one slug, disambiguated by year, and each `notes` field
points at the other so nobody merges them later.

Escalation when the year does not disambiguate either:

- If both entries share a year, append the credit as well:
  `middle-ground-2023` and `middle-ground-2023-with-mickey-guyton`.
- If one of the pair was never released and has `year: null`, use `unreleased`
  in place of the year: `locked-up-2000` and `locked-up-unreleased`.

Never key anything on title alone.
