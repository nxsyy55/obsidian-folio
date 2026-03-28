# Project Structure

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

# Architecture

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

**Cache keys:** `book_<id>`, `movie_<id>` (Douban), `gb_<id>` (Google Books), `imdb_<id>`, `ol_<id>`. Delete `.obsidian/plugins/folio/cache.json` entries to force a re-fetch.

# Troubleshooting

| Problem | Fix |
|---|---|
| Douban fetch fails or fields are empty | Check Firecrawl API key in Settings → Folio |
| Wrong or stale metadata | Delete the cache entry for that ID and re-run |
| Inbox folder missing | Create the folder in your vault first |
| No results for a title | Try the original-language title, or use ISBN for books |
| Note not opening after creation | Find it manually in your inbox folder |
| Wrong film picked from IMDB | Multiple results shown — pick the correct one from the list |
