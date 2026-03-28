# Design: Full TypeScript Rewrite — douban-obsidian v0.4

**Date:** 2026-03-27
**Status:** Approved
**Goal:** Make the plugin self-contained — no Python, no manual backend setup. Users install from GitHub/marketplace, enter a Firecrawl API key and inbox folder name, and it works.

---

## Problem

The current plugin is a thin shell that `exec()`s Python scripts. Users must install Python 3.9+, create a venv, install 5 packages, write a `.env`, write a `config.json`, and enter three absolute paths in plugin settings. This is a developer setup, not a plugin.

---

## Solution

Port `douban.py` and `notes.py` to TypeScript. All HTTP calls go through Obsidian's `requestUrl`. Firecrawl is called directly as an HTTP API. HTML fallback parsing uses `DOMParser` (available in Electron/Chromium). File I/O uses the Obsidian vault API.

---

## Architecture

### New `src/` layout

```
src/
├── main.ts      — Commands; replace exec()/stdout-parsing with async douban.ts calls
├── settings.ts  — New fields: firecrawlApiKey, inboxDir, requestDelay (remove pythonPath/backendDir/envPath)
├── modal.ts     — Unchanged
├── douban.ts    — Port of douban.py: search, ISBN lookup, book/movie fetch
├── notes.ts     — Port of notes.py: render book/movie note as markdown string
└── cache.ts     — Cache read/write via vault adapter (JSON file in plugin data dir)
```

### Data flow (new)

```
Command → DoubanModal
  → douban.searchDouban() via requestUrl
  → [if >1 result] DisambiguationModal
  → douban.fetchBookDetail() or fetchMovieDetail()
      → Primary: Firecrawl API (POST to api.firecrawl.dev)
      → Fallback: requestUrl + DOMParser HTML parsing
  → notes.renderBookNote() or renderMovieNote()
  → app.vault.create(inboxDir/title.md, content)
  → Notice("Note created: title.md") + open note
```

### Settings (new)

| Setting | Type | Default | Notes |
|---------|------|---------|-------|
| `firecrawlApiKey` | string | `""` | Required. Free tier at firecrawl.dev |
| `inboxDir` | string | `"inbox"` | Vault subfolder for new notes |
| `bookDir` | string | `"ReadNotes"` | Future use |
| `watchDir` | string | `"WatchNotes"` | Future use |
| `requestDelay` | number | `2` | Seconds between Douban requests |

Removed: `pythonPath`, `backendDir`, `envPath`.

---

## Module Specs

### `cache.ts`

- Cache file stored at `.obsidian/plugins/douban-obsidian/cache.json` via `app.vault.adapter`
- Keyed `book_<id>` / `movie_<id>` — same as Python version
- Async read/write; graceful on missing file

### `douban.ts`

**Search** (`searchDouban(query, mediaType?)`):
- GET `https://book.douban.com/j/subject_suggest?q=...` and/or `https://movie.douban.com/j/subject_suggest?q=...` via `requestUrl`
- Returns `Candidate[]` — same shape as current TypeScript `Candidate` interface

**ISBN lookup** (`searchByIsbn(isbn)`):
- GET `https://book.douban.com/isbn/<isbn>/` via `requestUrl`
- Extract Douban ID from final URL in response headers (`location` or check `url` field)
- Parse title from HTML via `DOMParser`

**Book detail** (`fetchBookDetail(id, settings)`):
- Check cache first
- Primary: POST to Firecrawl `/v1/scrape` with `BOOK_SCHEMA` for structured extraction
- Fallback: GET book page via `requestUrl`, parse `#info` div with `DOMParser`
- Normalize author (`[英] name` → `英/name`), date (various Chinese formats → `YYYY-MM-DD`)
- Save to cache, return metadata dict

**Movie detail** (`fetchMovieDetail(id, settings)`):
- Check cache first
- Primary for basic data: GET `subject_abstract` JSON API via `requestUrl` (no auth needed)
- Supplement with Firecrawl structured extraction for IMDb, full date, countries
- Fallback supplement: GET movie page via `requestUrl`, parse with `DOMParser`
- Save to cache, return metadata dict

### `notes.ts`

- `yamlValue(v)` — port of `_yaml_value`: quote strings with YAML-special chars
- `yamlList(items)` — port of `_yaml_list`: indented `- item` lines
- `renderBookNote(metadata)` → markdown string (identical output to Python version)
- `renderMovieNote(metadata)` → markdown string (identical output to Python version)

### `main.ts`

- Remove `exec()`, `child_process`, `RunOptions`, stdout regex parsing
- `runBackend()` becomes `async runBackend()` calling `douban.ts` and `notes.ts`
- Disambiguation: call `searchDouban()` directly, pass `Candidate[]` to `DisambiguationModal` (no CANDIDATES_JSON stdout hack needed)
- On success: `app.vault.create()` then `app.workspace.openLinkText()`

---

## Firecrawl API Integration

Firecrawl calls go directly from TypeScript via `requestUrl`:

```
POST https://api.firecrawl.dev/v1/scrape
Authorization: Bearer <firecrawlApiKey>
Content-Type: application/json

{ "url": "...", "formats": ["extract"], "extract": { "schema": BOOK_SCHEMA } }
```

If Firecrawl returns an error or the key is empty, fall through to the `requestUrl` + `DOMParser` path.

---

## What Changes

**Removed from plugin requirements** (the plugin no longer needs these):
- Plugin settings: `pythonPath`, `backendDir`, `envPath`
- `.env` file (API key moves into plugin settings)
- `config.json` (settings move into plugin settings)

**Kept intact in repo** (Python backend stays as a standalone CLI tool for power users):
- `backend/` directory — `vault_tool.py`, `douban.py`, `notes.py`, `requirements.txt`, `pyproject.toml`
- `.env.example`, `config.example.json`

The plugin becomes fully independent of the Python backend. Both can coexist in the repo.

---

## Error Handling

- No Firecrawl key set → show Notice prompting user to add it in settings, still attempt direct fetch fallback
- Firecrawl API error → log warning, fall back to direct fetch
- Direct fetch blocked by Douban → show Notice with "Try again or check your network"
- Note already exists → `vault.create` throws; catch and show Notice "Note already exists: filename.md"
- No results → Notice "No results found for '...'"

---

## Testing Plan

- Run existing test suite (`backend/tests/`) against Python code — keep passing (Python backend stays)
- Manual end-to-end test via Obsidian: book by title, book by ISBN, movie, teleplay, disambiguation
- Verify note output is byte-for-byte identical to Python output for known test cases

---

## Unchanged

- `modal.ts` — all GUI stays exactly as-is
- `manifest.json` — no version bump needed until release
- `styles.css` — unchanged
- `esbuild.config.mjs`, `tsconfig.json`, `package.json` — no new npm dependencies needed
- Python backend files — kept intact, still usable as CLI
