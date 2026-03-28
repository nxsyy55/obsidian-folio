# Folio Cleanup & Documentation Design

**Date:** 2026-03-28
**Status:** Approved

## Goal

Remove all Python legacy files, reorganize the project root, bump version to 0.98.0, and rewrite documentation to reflect Folio as a multi-source Obsidian plugin ready for marketplace submission.

## File Deletions (Python Legacy)

Remove entirely:
- `backend/` (Python CLI and its venv, cache, config)
- `tests/` (Python test suite)
- `pytest.ini`
- `config.example.json`
- `.env.example`
- `__pycache__/` (root level)

## File Moves

- `esbuild.config.mjs` → `build/esbuild.config.mjs`
  - Update `package.json` scripts: `node esbuild.config.mjs` → `node build/esbuild.config.mjs`
- `ROADMAP.md` → `docs/ROADMAP.md`

## Final Root Structure

```
├── .github/workflows/release.yml   ← unchanged
├── src/                            ← TypeScript source (unchanged)
│   ├── main.ts
│   ├── settings.ts
│   ├── modal.ts
│   ├── douban.ts
│   ├── sources.ts
│   ├── notes.ts
│   └── cache.ts
├── docs/
│   ├── ROADMAP.md
│   └── superpowers/
│       ├── specs/
│       └── plans/
├── build/
│   └── esbuild.config.mjs
├── manifest.json     ← Obsidian marketplace requirement (root)
├── styles.css        ← Obsidian marketplace requirement (root)
├── package.json      ← npm (root)
├── package-lock.json
├── tsconfig.json
├── README.md
├── CLAUDE.md
└── LICENSE
```

`main.js` (gitignored, generated at root by esbuild — Obsidian requirement) and `.gitignore`, `.github/`, `.claude/` remain as-is.

## Version Bump

- `manifest.json`: `"version": "0.4.0"` → `"0.98.0"`, description updated
- `package.json`: `"version": "0.1.0"` → `"0.98.0"`, name → `"folio"`, description updated

## README.md Rewrite

Full rewrite. Sections:

**Header:** Plugin name "Folio" — create Obsidian notes for books and movies.

**Prerequisites:**
- Obsidian desktop (desktop-only plugin)
- Firecrawl API key — *optional*, only needed for Douban book/movie detail fetching. English content (IMDB, Open Library, Google Books) works without it.

**Setup:** Build from source (`npm install && npm run build`), copy `main.js` + `manifest.json` + `styles.css` to `.obsidian/plugins/douban-obsidian/`, enable in Settings → Community Plugins.

**Configuration:** Settings → Folio:
| Setting | Purpose |
|---|---|
| Firecrawl API key | Optional. Used only for Douban detail fetches. |
| Inbox folder | Where new notes land (default: `inbox`) |
| Request delay | Seconds between Douban requests (default: 2) |

**Usage:** Command Palette → `Folio: Add Note`. Modal has Search field, ISBN field (books only), and Template selector. One command does everything.

**Source Routing:**
| Query type | Sources searched |
|---|---|
| Chinese / Japanese (CJK) | Douban + Google Books |
| English / Latin | IMDB + Open Library |
| ISBN | Douban + Open Library + Google Books (parallel, first hit wins) |

If all sources return no results, a blank note is created with `title`, `type`, and `createTime` for the user to fill in.

**Project Structure:**
```
├── src/
│   ├── main.ts       Plugin entry point, command registration
│   ├── settings.ts   Settings tab
│   ├── modal.ts      Search modal, disambiguation, blank note
│   ├── douban.ts     Douban search + Firecrawl detail fetch
│   ├── sources.ts    IMDB, Open Library, Google Books + routing
│   ├── notes.ts      Note renderers (book, movie, blank)
│   └── cache.ts      Vault-backed metadata cache
├── build/
│   └── esbuild.config.mjs
├── manifest.json
├── styles.css
└── package.json
```

**Architecture:**
```
User submits query
  ├── ISBN → searchByIsbnAll (Douban + OL + GB parallel)
  └── Title
        ├── CJK  → Douban + Google Books
        └── Latin → IMDB + Open Library
              ├── 1 result  → fetch detail → create note
              ├── 2+ results → DisambiguationModal → fetch detail → create note
              └── 0 results → BlankNoteModal → create minimal note
```

| Module | Responsibility |
|---|---|
| `main.ts` | Command wiring, orchestration |
| `settings.ts` | Firecrawl key, inbox dir, request delay, templates |
| `modal.ts` | Search input, disambiguation list, blank note type picker |
| `douban.ts` | Douban search/ISBN APIs, Firecrawl book/movie detail |
| `sources.ts` | Language detection, IMDB/OL/Google Books search + detail |
| `notes.ts` | Render book, movie, and blank note markdown |
| `cache.ts` | JSON cache via vault adapter |

**Cache keys:** `book_<id>`, `movie_<id>` (Douban), `gb_<id>` (Google Books), `imdb_<id>`, `ol_<id>`.
Delete `.obsidian/plugins/douban-obsidian/cache.json` entries to force re-fetch.

**Troubleshooting:**

| Problem | Fix |
|---|---|
| Douban fetch fails / empty fields | Check Firecrawl API key in Settings → Folio |
| Wrong or stale metadata | Delete the cache entry for that ID and re-run |
| Inbox folder missing | Create the folder in your vault first |
| No results for a title | Try the original-language title, or use ISBN for books |
| Note not opening after creation | Find it manually in your inbox folder |
| IMDB returns wrong film | Multiple results shown — pick the correct one from the list |

## CLAUDE.md Updates (targeted, not full rewrite)

- Setup section: remove Python/backend instructions, remove `.env.example` / `config.example.json` references
- Running section: remove Python CLI commands
- Architecture section: update module table to add `sources.ts`, update data flow description
- Key Constraints: update "Firecrawl required" → "Firecrawl optional, only for Douban detail fetches"
- Documentation Rule: keep as-is

## docs/ROADMAP.md Updates

- Add v0.4 milestone (multi-source search, complete)
- Add v0.98 milestone (cleanup + marketplace prep, current)
- Mark v1.0 as "pending 3-day field validation"
- Remove the Python-era Config & Secrets section (`.env`, `config.json` — deleted)
- Update folder structure diagram to final layout

## Constraints

- `manifest.json`, `styles.css`, `main.js` stay at root — Obsidian marketplace requires it
- `tsconfig.json`, `package.json`, `package-lock.json` stay at root — npm/TypeScript require it
- `release.yml` unchanged — already attaches correct assets
- All changes in one commit so docs never reference deleted files
