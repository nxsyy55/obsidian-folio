# douban-obsidian

A Python CLI that creates Obsidian notes from Douban metadata for books and movies. Planned to grow into a full Obsidian plugin with a GUI frontend — see [ROADMAP.md](ROADMAP.md).

## Quick Start

**1. Install Python dependencies:**

```bash
cd backend
uv sync
# or: pip install requests beautifulsoup4 thefuzz firecrawl-py python-dotenv
```

**2. Configure secrets** — copy `.env.example` → `.env` (repo root) and fill in:

```
FIRECRAWL_API_KEY=your_key_here
OBSIDIAN_VAULT_PATH=J:\Notes Library
```

**3. Configure settings** — copy `config.example.json` → `backend/config.json` and set your directory names:

```json
{
  "book_dir": "ReadNotes",
  "watch_dir": "WatchNotes",
  "inbox_dir": "inbox",
  "cache_file": "cache.json",
  "vault_name": "My Notes",
  "request_delay": 2
}
```

**4. Run:**

```bash
cd backend

# Book by title
python vault_tool.py book "百年孤独"

# Book by ISBN (more precise)
python vault_tool.py book --isbn 9787544253994

# Movie
python vault_tool.py movie "盗梦空间"

# TV show
python vault_tool.py movie "3年A班" --type teleplay
```

Notes are created in `inbox/` inside your vault — review and move them to the right folder.

## Requirements

- Python 3.9+ with `uv` (or `pip`)
- Firecrawl API key — free tier at https://www.firecrawl.dev/
- Dependencies: `requests`, `beautifulsoup4`, `thefuzz`, `firecrawl-py`, `python-dotenv`

## Project Structure

```
douban-obsidian/
├── .github/workflows/release.yml  # Auto-publish on git tag
├── src/                           # Obsidian plugin TypeScript (future)
├── backend/                       # Python scraping backend
│   ├── vault_tool.py              # CLI entry point
│   ├── douban.py                  # Douban search + scraping
│   ├── notes.py                   # Markdown note generation
│   ├── config.json                # Your settings (gitignored)
│   ├── cache.json                 # Auto-generated cache (gitignored)
│   ├── pyproject.toml
│   └── uv.lock
├── manifest.json                  # Obsidian plugin manifest
├── package.json                   # Plugin build deps (esbuild, TypeScript)
├── tsconfig.json
├── esbuild.config.mjs
├── config.example.json            # Settings template (no secrets)
├── .env.example                   # Env var template (no secrets)
└── ROADMAP.md
```

## Architecture

```
CLI (vault_tool.py)
  ├── douban.py: search → disambiguate → fetch detail → cache
  ├── notes.py: render frontmatter + body → write .md
  └── Open note in Obsidian via URI protocol
```

| Module | Responsibility |
|--------|---------------|
| `vault_tool.py` | CLI, config loading, env injection, command dispatch |
| `douban.py` | Douban APIs, Firecrawl page scraping, metadata cache |
| `notes.py` | YAML frontmatter, markdown body, file writing |

**Secrets split:** `vault_path` comes from `OBSIDIAN_VAULT_PATH` env var. `cache_file` in `config.json` is a relative path resolved from the `backend/` directory.

## Troubleshooting

**Movie IMDb field empty:** Firecrawl scraping failed. Check `FIRECRAWL_API_KEY` in `.env`.

**Stale cache data:** Open `backend/cache.json`, delete the `book_<id>` or `movie_<id>` entry, re-run.

**`OBSIDIAN_VAULT_PATH` not set:** Add it to your `.env` file in the repo root.
