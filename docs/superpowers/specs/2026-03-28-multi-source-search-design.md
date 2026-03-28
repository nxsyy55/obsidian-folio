# Multi-Source Search Design

**Date:** 2026-03-28
**Status:** Approved

## Problem

The plugin currently relies entirely on Douban for search and metadata. Douban is Chinese-first — English books and international films return poor or no results. When all searches fail the plugin hard-stops with a notice and creates no note, leaving the user with nothing.

## Goals

1. Add English-capable search sources (IMDB, Open Library, Google Books)
2. Route queries automatically by language — no user configuration needed
3. If all sources return zero results, still create a minimal note the user can fill in
4. No new API keys or settings required

## Source Routing

Language is detected with a single regex on CJK unicode ranges:

| Query language | Sources queried (parallel) |
|---|---|
| CJK characters | Douban + Google Books |
| Latin / other | IMDB + Open Library |

ISBN lookup bypasses language detection — all three book sources (Douban, Open Library, Google Books) are tried in parallel; first non-null result wins.

## API Endpoints

### Google Books (books, CJK + Latin)
- Search: `GET https://www.googleapis.com/books/v1/volumes?q={query}&maxResults=10`
- Detail: `GET https://www.googleapis.com/books/v1/volumes/{id}`
- No API key required at low frequency
- Fields: title, authors, publishedDate, publisher, ISBN-13 from `industryIdentifiers`
- Cache key: `gb_{id}`

### IMDB (movies/TV, Latin)
- Search: `GET https://v3.sg.media-imdb.com/suggestion/x/{query}.json` (unofficial autocomplete, stable, no key)
- Detail: `GET https://www.imdb.com/title/{id}/` — parse `<script type="application/ld+json">` embedded in HTML
- Fields from JSON-LD: name, datePublished, genre, director, duration → `time`, aggregateRating.ratingValue → `score`, id → `IMDb`
- Cache key: `imdb_{id}`

### Open Library (books, Latin)
- Search: `GET https://openlibrary.org/search.json?q={query}&fields=key,title,author_name,first_publish_year,isbn&limit=10`
- Detail: `GET https://openlibrary.org/works/{id}.json`
- Fields: title, author_name → `author`, first_publish_year → `datePublished`, isbn[0] → `isbn`, publisher left blank
- Cache key: `ol_{id}`

## File Changes

### New: `src/sources.ts`
All new provider logic. Exports:
- `detectLanguage(query)` → `'cjk' | 'latin'`
- `searchAll(query)` → `Promise<Candidate[]>` — routes by language, fires parallel fetches, merges results
- `searchGoogleBooks(query)` → `Promise<Candidate[]>`
- `searchIMDB(query)` → `Promise<Candidate[]>`
- `searchOpenLibrary(query)` → `Promise<Candidate[]>`
- `searchByIsbnAll(isbn)` → `Promise<Candidate | null>` — tries Douban + Open Library + Google Books in parallel, returns first hit
- `fetchGoogleBooksDetail(id, vault)` → `Promise<BookMetadata | null>`
- `fetchIMDBDetail(id, vault)` → `Promise<MovieMetadata | null>`
- `fetchOpenLibraryDetail(id, vault)` → `Promise<BookMetadata | null>`

### Modified: `src/modal.ts`
- `Candidate` interface: add `source: 'douban' | 'imdb' | 'openlibrary' | 'googlebooks'`
- `DisambiguationModal`: each row shows source label, e.g. `Dune / Frank Herbert (2021, book, Open Library)`
- New `BlankNoteModal`: shown when all sources return zero results. Displays "No results for '{query}'. Create blank note as:" with **Book** / **Movie** / **Cancel** buttons

### Modified: `src/main.ts`
- `runBackend`: replace `searchDouban()` with `searchAll()` from sources.ts
- Replace `searchByIsbn()` with `searchByIsbnAll()` from sources.ts
- Detail-fetch dispatch keyed on `candidate.source`:
  - `'douban'` → existing `fetchBookDetail` / `fetchMovieDetail` (unchanged)
  - `'googlebooks'` → `fetchGoogleBooksDetail`
  - `'openlibrary'` → `fetchOpenLibraryDetail`
  - `'imdb'` → `fetchIMDBDetail`
- Notice text reflects active source: `"Fetching from IMDB..."` etc.
- Zero-results path: open `BlankNoteModal` instead of returning early
- Blank note path: call `renderBlankNote(title, type, template)` → `vault.create()`

### Modified: `src/notes.ts`
- Add `renderBlankNote(title: string, type: 'book' | 'movie', template?: FolioTemplate | null)` → minimal YAML:
  - Fields: `title`, `type`, `createTime` only
  - No tags (even if template has tags configured)
  - Template body appended if present

### Untouched
`src/douban.ts`, `src/cache.ts`, `src/settings.ts` — no changes.

## Full Search Flow

```
User submits query
    │
    ├─ ISBN entered
    │       └─ searchByIsbnAll() → Douban + Open Library + Google Books in parallel
    │               ├─ first hit → fetch detail by source → create note
    │               └─ all null → BlankNoteModal
    │
    └─ Title query
            │
            ├─ CJK → parallel: searchDouban() + searchGoogleBooks()
            └─ Latin → parallel: searchIMDB() + searchOpenLibrary()
                    │
                    ├─ 1 result → auto-select, fetch detail by source
                    ├─ 2+ results → DisambiguationModal (source label on each row)
                    └─ 0 results → BlankNoteModal → Book / Movie / Cancel
                                        └─ renderBlankNote() → vault.create()
```

## Blank Note Format

```yaml
---
title: Dune
type: book
createTime: 2026-03-28 14:00:00
---

## 读后感

## 摘录
```

No tags, no author, no isbn — user fills everything in.

## Constraints

- All new sources are zero-config (no API key, no settings changes)
- `douban.ts` is not modified — existing Douban HTML fallback preserved as-is
- Existing cache format unchanged; new sources add `gb_`, `imdb_`, `ol_` prefixed keys
- `requestDelay` setting applies only to Douban fetches; new sources fire immediately
