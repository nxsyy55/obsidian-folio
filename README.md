# Folio

An Obsidian plugin that creates notes for books and movies from multiple sources.

## Prerequisites

- **Obsidian desktop** (desktop-only plugin)
- **Firecrawl API key** — optional, free tier at https://www.firecrawl.dev/. Only needed for Douban book and movie detail fetches. English sources (IMDB, Open Library, Google Books) work without it.

## Setup

### 1. Install the plugin

**Build from source:**

```bash
npm install
npm run build
```

Create the plugin folder in your vault if it doesn't exist:

```
<vault>/.obsidian/plugins/douban-obsidian/
```

Copy these three files into it:

```
main.js
manifest.json
styles.css
```

Then in Obsidian: **Settings → Community Plugins → reload**, find **Folio**, and enable it.

### 2. Configure

After enabling, go to **Settings → Folio**:

| Setting | What to enter |
|---|---|
| **Firecrawl API key** | Optional. From https://www.firecrawl.dev/app/api-keys. Only used for Douban fetches. |
| **Inbox folder** | Vault subfolder for new notes (default: `inbox`) |
| **Request delay** | Seconds between Douban requests (default: 2) |

> Make sure the inbox folder exists in your vault before running.

## Usage

Open the Command Palette (`Ctrl+P`) and run **Folio: Add Note**.

The modal has three fields:
- **Search** — title, author, or keyword
- **ISBN** — for exact book lookup (bypasses title search)
- **Template** — optional note template

Sources are selected automatically by query language:

| Query type | Sources searched |
|---|---|
| Chinese / Japanese (CJK characters) | Douban + Google Books |
| English / Latin | IMDB + Open Library |
| ISBN | Douban + Open Library + Google Books (parallel, first hit wins) |

If multiple results are found, a disambiguation list lets you pick the right one. If no results are found at all, a blank note is created with `title`, `type`, and `createTime` for you to fill in.

Notes land in your configured inbox folder. Move them to their final location after reviewing.

## Project Structure

```
├── src/
│   ├── main.ts        Plugin entry point, command registration
│   ├── settings.ts    Settings tab
│   ├── modal.ts       Search, disambiguation, and blank-note modals
│   ├── douban.ts      Douban search + Firecrawl detail fetch
│   ├── sources.ts     IMDB, Open Library, Google Books + language routing
│   ├── notes.ts       Note renderers (book, movie, blank)
│   └── cache.ts       Vault-backed metadata cache
├── build/
│   └── esbuild.config.mjs
├── manifest.json
├── styles.css
└── package.json
```

## Architecture

```
User submits query
  ├── ISBN → searchByIsbnAll (Douban + Open Library + Google Books, parallel)
  └── Title
        ├── CJK   → Douban + Google Books (parallel)
        └── Latin → IMDB + Open Library (parallel)
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
| `sources.ts` | Language detection, IMDB/Open Library/Google Books search + detail |
| `notes.ts` | Render book, movie, and blank note markdown |
| `cache.ts` | JSON cache via vault adapter |

**Cache keys:** `book_<id>`, `movie_<id>` (Douban), `gb_<id>` (Google Books), `imdb_<id>`, `ol_<id>`. Delete `.obsidian/plugins/douban-obsidian/cache.json` entries to force a re-fetch.

## Troubleshooting

| Problem | Fix |
|---|---|
| Douban fetch fails or fields are empty | Check Firecrawl API key in Settings → Folio |
| Wrong or stale metadata | Delete the cache entry for that ID and re-run |
| Inbox folder missing | Create the folder in your vault first |
| No results for a title | Try the original-language title, or use ISBN for books |
| Note not opening after creation | Find it manually in your inbox folder |
| Wrong film picked from IMDB | Multiple results shown — pick the correct one from the list |
