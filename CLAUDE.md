# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Setup

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

```bash
cd backend
python vault_tool.py book "书名"
python vault_tool.py book --isbn 9787544291552
python vault_tool.py movie "电影名"
python vault_tool.py movie "剧名" --type teleplay
```

## Architecture

Three-module pipeline in `backend/`:

- `backend/vault_tool.py` — CLI entry point (argparse), config loading, orchestrates book/movie commands
- `backend/douban.py` — Scraping engine: search → detail fetch → cache. All HTTP logic lives here
- `backend/notes.py` — Pure renderer: takes metadata dicts → YAML frontmatter + markdown body → writes file

**Data flow:** CLI args → search Douban (JSON API via `requests`) → disambiguate → fetch detail page (via Firecrawl) → parse HTML (BeautifulSoup) → render note → write to `inbox/`.

**Config/secrets split:**
- `OBSIDIAN_VAULT_PATH` — vault absolute path, from `.env`
- `FIRECRAWL_API_KEY` — Firecrawl API key, from `.env`
- `backend/config.json` — non-sensitive settings (`vault_name`, `book_dir`, `watch_dir`, `inbox_dir`, `cache_file`, `request_delay`)
- `cache_file` in config.json is a relative path resolved from `backend/` via `Path(__file__).parent`

**Caching:** `backend/cache.json` stores fetched metadata keyed `book_<id>` / `movie_<id>`. Delete an entry to force re-fetch.

**Scraping strategy (`backend/douban.py`):**
- Search: `subject_suggest` JSON API via `requests` (no auth, no JS needed)
- ISBN lookup: `requests` GET with redirect follow (extracts ID from final URL)
- Movie basic data: `subject_abstract` JSON API via `requests` (no auth needed)
- Book detail page + movie detail page: **Firecrawl** (`_scrape_page(url)`) → HTML parsed by BeautifulSoup

**Config keys** (`backend/config.json`): `vault_name`, `book_dir`, `watch_dir`, `inbox_dir`, `cache_file`, `request_delay`

## Key Constraints

- Notes land in `inbox/` first; user moves them to final location
- `requests` is kept for lightweight JSON APIs only; Firecrawl handles all HTML page fetches
- `douban_cookies` in config is kept for legacy compatibility but no longer used for page fetches

## Documentation Rule

Any code change affecting architecture, CLI interface, dependencies, or scraping strategy must update both `CLAUDE.md` and `README.md` in the same commit.
