# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install          # install deps
npm run dev          # watch mode (esbuild, no type-check)
npm run build        # type-check + esbuild production bundle
npm run deploy       # build + copy main.js/manifest.json/styles.css to vault plugin folder
```

**First-time deploy setup:** `npm run deploy` reads the vault path from `vault.config.json` (gitignored). Copy the example and set your vault path:
```bash
cp vault.config.json.example vault.config.json
# edit vault.config.json: { "vaultPath": "C:/path/to/your/vault" }
```
Falls back to `../` (parent folder) if no config file exists.

There are no automated tests. Validation is done by installing the built plugin in Obsidian.

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

**Cache:** JSON at `{vault.configDir}/plugins/folio/cache.json` via `vault.adapter`. Delete an entry to force re-fetch.

## Key Constraints

- Notes land in `inboxDir` first; user moves them to final location
- Firecrawl is optional — only Douban detail fetches use it; all other sources use `requestUrl` directly
- `requestDelay` applies only to Douban fetches; IMDB/Open Library/Google Books fire immediately
- `manifest.json`, `styles.css`, `main.js` must stay at repo root (Obsidian marketplace requirement)

## Obsidian Marketplace Validation Rules

These are enforced by the marketplace linter — violations cause submission rejection:

**Config directory:** Never hardcode `.obsidian/`. Always use `this.app.vault.configDir` (from `Plugin`) or pass it through. The cache path must be `normalizePath(`${vault.configDir}/plugins/folio/cache.json`)`.

**String coercion:** `?? ''` is unsafe when the value may be a non-primitive (object, array). Always wrap with `String(...)`: `String(item.title ?? '')`. This applies to every field from external API JSON responses.

**Inline styles:** Do not set `element.style.*` properties. Use CSS classes in `styles.css` and `el.addClass()`/`el.toggleClass()`. The only Obsidian-approved exception is `setCssProps()` for dynamic CSS custom properties.

**Promise handling:** Every unhandled promise must be explicitly marked: `void somePromise()` (fire-and-forget), `.catch(handler)`, or `await`. Passing an async lambda where `void` is expected also needs `void` prefix.

**Settings UI:** Use `new Setting(containerEl).setName('…').setHeading()` instead of `containerEl.createEl('h3', …)` for section headings.

**UI text casing:** All user-visible strings (labels, button text, placeholders, notices) must use sentence case — capitalize only the first word and proper nouns. E.g., `'Add note'` not `'Add Note'`; `'No results found'` not `'No Results Found'`.

**Regex escapes:** Remove unnecessary escapes inside character classes. `[&]` → `[&]`, `[\[]` → `[[]`.

## Documentation Rule

Any code change affecting architecture, CLI interface, dependencies, or scraping strategy must update both `CLAUDE.md` and `README.md` in the same commit.
