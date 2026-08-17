/**
 * GENERATED FILE. Do not edit by hand.
 *
 * Source: schemas/discography.schema.json, schemas/index.schema.json
 * Regenerate with: npm run types:gen
 */

/**
 * Registry of every artist file. Loaded first; the artist list page renders straight from it.
 */
export interface ArtistIndex {
  /**
   * ISO 8601 date the registry itself was last revised.
   */
  updated: string;
  /**
   * @minItems 1
   */
  artists: [ArtistIndexEntry, ...ArtistIndexEntry[]];
}
export interface ArtistIndexEntry {
  /**
   * Must equal the artist.id inside the referenced file.
   */
  id: string;
  name: string;
  /**
   * Name to sort by, for example "Beatles, The".
   */
  sortName: string;
  origin: string;
  active: string;
  /**
   * Must equal songs.length in the referenced file. Checked by scripts/validate-data.mjs.
   */
  songCount: number;
  /**
   * Filename relative to src/assets/data/.
   */
  file: string;
}

/**
 * Artist slug. Must equal the filename stem and the matching index.json entry id.
 */
export type ArtistId = string;
/**
 * Lowercase kebab-case identifier. Unique within its collection in a single artist file.
 */
export type Slug = string;
/**
 * Shared vocabulary for albums[].type and songs[].type.
 */
export type ReleaseType =
  | 'studio'
  | 'deluxe'
  | 'reissue'
  | 'compilation'
  | 'ep'
  | 'live'
  | 'soundtrack'
  | 'single'
  | 'remix'
  | 'demo'
  | 'unreleased'
  | 'album-track';
/**
 * Song slug, unique within the file. Titles that collide are disambiguated with a year suffix, for example closer-2004 and closer-2025.
 */
export type SongId = string;
/**
 * How well verified this record is. See docs/SCHEMA.md for what each level means.
 */
export type Confidence = 'high' | 'medium' | 'low' | 'unverified';

/**
 * One artist's complete catalogue. One file per artist, loaded at runtime from src/assets/data/{id}.json.
 */
export interface Discography {
  artist: Artist;
  /**
   * @minItems 1
   */
  eras: [Era, ...Era[]];
  albums: Album[];
  /**
   * @minItems 1
   */
  songs: [Song, ...Song[]];
}
export interface Artist {
  id: ArtistId;
  name: string;
  /**
   * Other names the act has recorded under. Empty array if none.
   */
  aliases: string[];
  origin: string;
  /**
   * Free text, for example "1994-present".
   */
  active: string;
  genres: string[];
  /**
   * ISO 8601 date this file was last revised.
   */
  updated: string;
  /**
   * What this dataset includes and excludes. Shown on the artist page.
   */
  scopeNotes: string;
}
/**
 * A named period in the artist's history. Songs and albums reference an era by id.
 */
export interface Era {
  id: Slug;
  label: string;
  /**
   * Free text, for example "2002-present".
   */
  range: string;
}
/**
 * Any release a song can appear on: studio albums, editions, compilations, soundtracks, demo sets.
 */
export interface Album {
  id: Slug;
  /**
   * Exact title. Every string in songs[].albums must match one of these exactly.
   */
  title: string;
  type: ReleaseType;
  /**
   * Full ISO 8601 release date. Omit the key entirely when only the year is known.
   */
  released?: string;
  /**
   * Release year, or null for material that was never released.
   */
  year: number | null;
  era: Slug;
}
export interface Song {
  id: SongId;
  title: string;
  /**
   * Always an array, even for a single album. Empty for non-album singles and unreleased material. Each entry must match an albums[].title exactly.
   */
  albums: string[];
  /**
   * Year of FIRST commercial release, which may precede the parent album's year. Null when never released.
   */
  year: number | null;
  type: ReleaseType;
  era: Slug;
  /**
   * Guest artists credited on the release. Empty array if none.
   */
  features: string[];
  isCover: boolean;
  /**
   * Must be null when isCover is false. May be null for a cover whose original performer is not recorded.
   */
  originalArtist: string | null;
  confidence: Confidence;
  /**
   * Free text. Empty string when there is nothing to say.
   */
  notes: string;
}
