#!/usr/bin/env node
// Exports src/content/*.json to a normalised SQLite database at
// build/discography.db (gitignored). Uses node:sqlite, so there is no native
// dependency to compile.
//
// Run: npm run db:export

import { readFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = join(ROOT, 'src/content');
const OUT_DIR = join(ROOT, 'build');
const OUT = join(OUT_DIR, 'discography.db');

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const index = readJson(join(DATA_DIR, 'index.json'));

mkdirSync(OUT_DIR, { recursive: true });
rmSync(OUT, { force: true });

const db = new DatabaseSync(OUT);
db.exec(`
  CREATE TABLE artists     (id TEXT PRIMARY KEY, name TEXT, origin TEXT,
                            active TEXT, updated TEXT);
  CREATE TABLE albums      (id TEXT, artist_id TEXT, title TEXT, type TEXT,
                            released TEXT, year INTEGER, era TEXT,
                            PRIMARY KEY (artist_id, id));
  CREATE TABLE songs       (id TEXT, artist_id TEXT, title TEXT,
                            year INTEGER, type TEXT, era TEXT,
                            is_cover INTEGER, original_artist TEXT,
                            confidence TEXT, notes TEXT,
                            PRIMARY KEY (artist_id, id));
  CREATE TABLE song_albums (artist_id TEXT, song_id TEXT, album_title TEXT);
  CREATE INDEX song_albums_song ON song_albums (artist_id, song_id);
  CREATE INDEX song_albums_title ON song_albums (artist_id, album_title);
`);

const insertArtist = db.prepare('INSERT INTO artists VALUES (?, ?, ?, ?, ?)');
const insertAlbum = db.prepare('INSERT INTO albums VALUES (?, ?, ?, ?, ?, ?, ?)');
const insertSong = db.prepare('INSERT INTO songs VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
const insertSongAlbum = db.prepare('INSERT INTO song_albums VALUES (?, ?, ?)');

const warnings = [];

for (const entry of index.artists) {
  const { artist, albums, songs } = readJson(join(DATA_DIR, entry.file));
  const knownTitles = new Set(albums.map((a) => a.title));

  insertArtist.run(artist.id, artist.name, artist.origin, artist.active, artist.updated);

  for (const a of albums) {
    insertAlbum.run(a.id, artist.id, a.title, a.type, a.released ?? null, a.year, a.era);
  }

  for (const s of songs) {
    insertSong.run(
      s.id,
      artist.id,
      s.title,
      s.year,
      s.type,
      s.era,
      s.isCover ? 1 : 0,
      s.originalArtist,
      s.confidence,
      s.notes,
    );
    for (const title of s.albums) {
      insertSongAlbum.run(artist.id, s.id, title);
      // An album name on a song but not in albums[] is almost always a typo.
      if (!knownTitles.has(title)) {
        warnings.push(`${artist.id}: song "${s.id}" references unknown album "${title}"`);
      }
    }
  }
}

const count = (sql) => db.prepare(sql).get()['n'];
const stats = {
  artists: count('SELECT COUNT(*) AS n FROM artists'),
  albums: count('SELECT COUNT(*) AS n FROM albums'),
  songs: count('SELECT COUNT(*) AS n FROM songs'),
  song_albums: count('SELECT COUNT(*) AS n FROM song_albums'),
  multi_album_songs: count(
    'SELECT COUNT(*) AS n FROM (SELECT song_id FROM song_albums GROUP BY artist_id, song_id HAVING COUNT(*) > 1)',
  ),
};

db.close();

console.log(`Wrote ${OUT}`);
for (const [k, v] of Object.entries(stats)) console.log(`  ${k.padEnd(18)} ${v}`);

if (warnings.length) {
  console.log(`\nData-quality warnings (${warnings.length}):`);
  for (const w of warnings) console.log(`  ${w}`);
} else {
  console.log('\nEvery album title on a song matched an entry in albums[].');
}
