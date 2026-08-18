# Sources

Per-artist provenance. Add a section here whenever you add an artist file.

The narrative research notes each dataset was built from live in
`docs/source-notes/`. Those files are historical records of the compilation
pass. **The JSON under `src/content/` is canonical.** If a source note and
the JSON disagree, the JSON wins and the note is stale.

---

## Maroon 5

- File: `src/content/maroon-5.json`
- Source notes: `docs/source-notes/maroon-5.md`
- Entries: 215 (148 under the Maroon 5 name, 64 Kara's Flowers, 3 unreleased)
- Compiled: August 2026

### Primary sources, Wikipedia

- https://en.wikipedia.org/wiki/List_of_songs_recorded_by_Maroon_5
- https://en.wikipedia.org/wiki/Maroon_5_discography
- https://en.wikipedia.org/wiki/Songs_About_Jane
- https://en.wikipedia.org/wiki/It_Won%27t_Be_Soon_Before_Long
- https://en.wikipedia.org/wiki/Hands_All_Over_(album)
- https://en.wikipedia.org/wiki/Overexposed_(album)
- https://en.wikipedia.org/wiki/V_(Maroon_5_album)
- https://en.wikipedia.org/wiki/Red_Pill_Blues
- https://en.wikipedia.org/wiki/Jordi_(album)
- https://en.wikipedia.org/wiki/Love_Is_Like
- https://en.wikipedia.org/wiki/The_B-Side_Collection
- https://en.wikipedia.org/wiki/Rhythms_del_Mundo

### Cross-checks

- Apple Music, artist and album pages
- Amazon Music, Will Be Loved EP tracklist
- Interscope Records, Love Is Like product page
- Discogs, Rhythms del Mundo: Cuba release data
- AllMusic, Love Is Like review and credits

### Confidence by area

| Area                                         | Confidence | Basis                                                        |
| :------------------------------------------- | :--------- | :----------------------------------------------------------- |
| Studio album track lists                     | high       | Verified against each album's Wikipedia page and Apple Music |
| Non-album singles and soundtracks            | high       | Cross-checked across multiple sources                        |
| Deluxe and territory-specific edition labels | medium     | Sources disagree on "deluxe" vs "Japanese" vs both           |
| Live EP contents                             | medium     | Two main live albums verified, not every EP                  |
| Kara's Flowers demo sets                     | low        | Fan-documented, dates approximate                            |
| Japan Singles Collection tracklist           | unverified | Not checked; contributes no entries                          |

### Scope

Included: every recording released under the Maroon 5 name, covering studio
albums, deluxe and territory-specific editions, re-releases, compilations,
covers, soundtrack contributions, non-album singles, and charting remix singles.
Kara's Flowers material is included as a separate era.

Excluded: live versions of songs already listed; all tracks on _Call and
Response: The Remix Album_ (2008); guest features by individual members on other
artists' records.

### Known gap

The one plausible remaining gap is a territory-exclusive bonus track undocumented
on Wikipedia. Japanese, Korean and Australian editions are where those hide.
Closing it requires a Discogs query by release rather than by song, which is a
separate research pass.

---

## Adding an artist

Record, at minimum:

- the file path and source-notes path
- the primary source URLs
- what was cross-checked and against what
- which areas are less than `high` confidence, and why
- what the dataset deliberately excludes
