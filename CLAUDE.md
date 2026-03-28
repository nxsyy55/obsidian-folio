# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Setup

**Plugin (TypeScript):**

```bash
npm install
npm run build
```

Copy `main.js`, `manifest.json`, `styles.css` to `.obsidian/plugins/folio/` in your vault. Configure Firecrawl API key (optional) and inbox folder in Settings → Folio.

## Running

The plugin is self-contained — install it in Obsidian and use the Command Palette to run **Folio: Add Note**.

Firecrawl API key is optional: only needed for Douban book and movie detail fetches. English sources (IMDB, Open Library, Google Books) work without it.

## Architecture

Seven TypeScript modules in `src/`:

- `src/main.ts` — Plugin entry point: registers commands, wires search → disambiguation → fetch → write
- `src/settings.ts` — Settings tab: `firecrawlApiKey`, `inboxDir`, `requestDelay`, `templates`
- `src/modal.ts` — Search input modal, disambiguation list modal, blank-note type modal
- `src/douban.ts` — Douban HTTP: `searchDouban`, `searchByIsbn`, `fetchBookDetail`, `fetchMovieDetail`
- `src/sources.ts` — Multi-source: `detectLanguage`, `searchAll`, `searchByIsbnAll`, IMDB/Open Library/Google Books search + detail fetchers
- `src/notes.ts` — Pure renderers: `renderBookNote`, `renderMovieNote`, `renderBlankNote` → markdown string
- `src/cache.ts` — Cache read/write via vault adapter (`book_<id>` / `movie_<id>` / `gb_<id>` / `imdb_<id>` / `ol_<id>` keys)

**Data flow:**
```
Command → DoubanModal (query + ISBN + template)
  ├── ISBN  → searchByIsbnAll (Douban + OL + GB parallel) → fetchAndCreate
  └── Title → searchAll (language-routed, parallel)
                ├── CJK   → searchDouban + searchGoogleBooks
                └── Latin → searchIMDB + searchOpenLibrary
                      ├── 1 result  → fetchAndCreate → renderNote → vault.create
                      ├── 2+ results → DisambiguationModal → fetchAndCreate
                      └── 0 results → BlankNoteModal → renderBlankNote → vault.create
```

**Firecrawl integration:** `POST https://api.firecrawl.dev/v1/scrape` with `Authorization: Bearer <key>`. Used only by `fetchBookDetail` and `fetchMovieDetail` in `douban.ts`. Falls back to HTML parse on failure.

**Cache:** JSON file at `.obsidian/plugins/folio/cache.json` via `vault.adapter`. Delete an entry to force re-fetch.

## Key Constraints

- Notes land in `inboxDir` first; user moves them to final location
- Firecrawl is optional — only Douban detail fetches use it; all other sources use `requestUrl` directly
- `requestDelay` applies only to Douban fetches; IMDB/Open Library/Google Books fire immediately
- `manifest.json`, `styles.css`, `main.js` must stay at repo root (Obsidian marketplace requirement)

## Documentation Rule

Any code change affecting architecture, CLI interface, dependencies, or scraping strategy must update both `CLAUDE.md` and `README.md` in the same commit.
