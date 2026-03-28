# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Setup

**Plugin (TypeScript):**

```bash
npm install
npm run build
```

Copy `main.js`, `manifest.json`, `styles.css` to `.obsidian/plugins/douban-obsidian/` in your vault. Configure Firecrawl API key and inbox folder in Settings → Douban Notes.

**Standalone Python CLI** (optional, not required by the plugin):

```bash
cd backend
pip install requests beautifulsoup4 thefuzz firecrawl-py python-dotenv
# or with uv:
uv sync
```

Copy `.env.example` → `.env` and fill in your values:
```
FIRECRAWL_API_KEY=your_key_here
OBSIDIAN_VAULT_PATH=/path/to/your/obsidian/vault
```

Copy `config.example.json` → `backend/config.json` and set `vault_name` and directory names.

## Running

The plugin is self-contained — install it in Obsidian, configure your Firecrawl API key in Settings → Douban Notes, and use the Command Palette to add book/movie notes.

**Standalone Python CLI** (for power users, not required by the plugin):

```bash
cd backend
python vault_tool.py book "书名"
python vault_tool.py book --isbn 9787544291552
python vault_tool.py movie "电影名"
python vault_tool.py movie "剧名" --type teleplay
```

## Architecture

Five TypeScript modules in `src/`:

- `src/main.ts` — Plugin entry point: registers commands, wires search → disambiguation → fetch → write
- `src/settings.ts` — Settings tab: `firecrawlApiKey`, `inboxDir`, `requestDelay`
- `src/modal.ts` — Search input modal + disambiguation list modal (unchanged from v0.3)
- `src/douban.ts` — All Douban HTTP: `searchDouban`, `searchByIsbn`, `fetchBookDetail`, `fetchMovieDetail`
- `src/notes.ts` — Pure renderers: `renderBookNote`, `renderMovieNote` → markdown string
- `src/cache.ts` — Cache read/write via vault adapter (`book_<id>` / `movie_<id>` keys)

**Data flow:** Command → search Douban JSON API (`requestUrl`) → disambiguate → fetch detail (Firecrawl primary, `requestUrl`+`DOMParser` fallback) → render note → `vault.create(inboxDir/title.md)`

**Firecrawl integration:** `POST https://api.firecrawl.dev/v1/scrape` with `Authorization: Bearer <key>`. Structured extraction with schema for books and movies. Falls back to HTML parse on failure.

**Cache:** JSON file at `.obsidian/plugins/douban-obsidian/cache.json` via `vault.adapter`. Delete an entry to force re-fetch.

**Python backend** (`backend/`) is kept as a standalone CLI for power users. The plugin no longer depends on it.

## Key Constraints

- Notes land in `inboxDir` first; user moves them to final location
- Plugin uses Obsidian's `requestUrl` for Douban JSON APIs; Firecrawl handles all HTML detail page fetches
- Python backend is standalone; plugin has no dependency on it

## Documentation Rule

Any code change affecting architecture, CLI interface, dependencies, or scraping strategy must update both `CLAUDE.md` and `README.md` in the same commit.
