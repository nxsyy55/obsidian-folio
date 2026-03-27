# douban-obsidian

An Obsidian plugin that creates notes from Douban metadata for books and movies.

## Prerequisites

- **Obsidian desktop** (the plugin is desktop-only)
- **Firecrawl API key** — free tier at https://www.firecrawl.dev/ (used to fetch book/movie detail pages)

No Python required.

## Setup

### 1. Install the plugin

**Option A — Build from source:**

```bash
npm install
npm run build
```

Copy `main.js`, `manifest.json`, `styles.css` to `.obsidian/plugins/douban-obsidian/` in your vault.

**Option B — BRAT (once released):**

Install [BRAT](https://obsidian.md/plugins?id=obsidian42-brat) → Add Beta Plugin → `https://github.com/nxsyy55/douban-notes-obs`

### 2. Configure the plugin

After enabling, go to **Settings → Douban Notes**:

| Setting | What to enter |
|---------|---------------|
| **Firecrawl API key** | From https://www.firecrawl.dev/app/api-keys |
| **Inbox folder** | Vault subfolder for new notes (default: `inbox`) |
| **Request delay** | Seconds between requests (default: 2) |

> Make sure the inbox folder exists in your vault before running.

## Usage

Open the Command Palette (`Ctrl+P`) and search for **Douban**:

| Command | What it does |
|---------|-------------|
| **Douban Notes: Add Book Note** | Search by title, pick result, create note |
| **Douban Notes: Add Movie Note** | Search by title with movie/teleplay toggle |
| **Douban Notes: Add Book or Movie Note** | Combined search — choose type in the modal |
| **Douban Notes: Add Book Note by ISBN** | Paste an ISBN for exact lookup |

Notes are created in your configured inbox folder. Review and move them to their final location.

## Project Structure

```
douban-obsidian/
├── .github/workflows/release.yml  # Auto-publish on git tag
├── src/                           # Obsidian plugin TypeScript
│   ├── main.ts                    # Plugin entry point
│   ├── settings.ts                # Settings tab
│   ├── modal.ts                   # Search + disambiguation modals
│   ├── douban.ts                  # Douban API + Firecrawl fetching
│   ├── notes.ts                   # Markdown note renderers
│   └── cache.ts                   # Vault-backed metadata cache
├── backend/                       # Standalone Python CLI (power users)
│   ├── vault_tool.py              # CLI entry point
│   ├── douban.py                  # Douban search + scraping
│   ├── notes.py                   # Markdown note generation
│   ├── pyproject.toml
│   └── uv.lock
├── manifest.json                  # Obsidian plugin manifest
├── package.json                   # Plugin build deps (esbuild, TypeScript)
├── tsconfig.json
└── esbuild.config.mjs
```

## Architecture

```
Plugin (main.ts)
  ├── modal.ts: search input → disambiguation list
  ├── douban.ts: Douban JSON APIs + Firecrawl detail fetch → cache
  └── notes.ts: render frontmatter + body → vault.create()
```

| Module | Responsibility |
|--------|---------------|
| `main.ts` | Command registration, orchestration |
| `settings.ts` | Firecrawl key, inbox dir, request delay |
| `modal.ts` | Search input and result disambiguation UI |
| `douban.ts` | Douban search/ISBN APIs, Firecrawl scraping |
| `notes.ts` | YAML frontmatter, markdown body rendering |
| `cache.ts` | JSON cache via vault adapter |

## Troubleshooting

**Movie IMDb field empty:** Firecrawl scraping failed. Check your Firecrawl API key in Settings → Douban Notes.

**Stale or wrong metadata:** Delete the relevant entry from `.obsidian/plugins/douban-obsidian/cache.json` and re-run the command. Keys are `book_<id>` and `movie_<id>`.

**Inbox folder missing:** Create the folder in your vault first, then retry.

**"No results found" for a valid title:** Try the original Chinese title, or use ISBN lookup for books. Douban's suggest API is sensitive to exact spelling.

**Note not opening after creation:** The note is created in your inbox folder — open it manually from the file explorer if the automatic open fails.

## Known Issues

**Windows: git worktree directory not deleted after `git worktree remove`**
On Windows, `git worktree remove` unregisters the worktree from git but cannot delete the directory if any process (e.g. the terminal) has its CWD inside it. Manually delete `.worktrees/<branch-name>/` after closing any terminal sessions pointing to it, or restart the machine.

## Standalone Python CLI

The `backend/` directory contains a standalone Python CLI for power users who prefer the terminal:

```bash
cd backend
pip install requests beautifulsoup4 thefuzz firecrawl-py python-dotenv
# or: uv sync

python vault_tool.py book "百年孤独"
python vault_tool.py book --isbn 9787544253994
python vault_tool.py movie "盗梦空间"
python vault_tool.py movie "3年A班" --type teleplay
```

See `backend/` for configuration details. The plugin does not depend on this CLI.
