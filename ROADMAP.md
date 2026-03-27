# douban-obsidian — Roadmap

## Architecture Decisions

### Config & Secrets Split

Sensitive / machine-specific values live in `.env` (never committed).
Non-sensitive settings stay in `config.json` (committed as `config.example.json`).

| Value | Where | Key |
|---|---|---|
| Obsidian vault absolute path | `.env` | `OBSIDIAN_VAULT_PATH` |
| Firecrawl API key | `.env` | `FIRECRAWL_API_KEY` |
| Douban cookies (legacy) | `.env` | `DOUBAN_BID`, `DOUBAN_DBCL2` |
| Book/movie/inbox subdirs | `config.json` | `book_dir`, `watch_dir`, `inbox_dir` |
| Vault display name | `config.json` | `vault_name` |
| Request delay | `config.json` | `request_delay` |
| Cache file | `config.json` | `cache_file` → relative path, resolved from `backend/` via `__file__` |

`cache_file` example in `config.example.json`:
```json
"cache_file": "cache.json"
```
Resolved in code as:
```python
base = Path(__file__).parent
cache_path = base / config["cache_file"]
```

`.env.example`:
```
FIRECRAWL_API_KEY=your_firecrawl_key_here
OBSIDIAN_VAULT_PATH=/path/to/your/obsidian/vault
DOUBAN_BID=
DOUBAN_DBCL2=
```

---

## Folder Structure (target)

```
douban-obsidian/
├── .github/
│   └── workflows/
│       └── release.yml        # Build + attach assets on v* tag
├── src/                       # Obsidian plugin TypeScript (v0.2+)
│   └── .gitkeep
├── backend/                   # Python scraping backend
│   ├── vault_tool.py
│   ├── douban.py
│   ├── notes.py
│   ├── pyproject.toml
│   ├── uv.lock
│   └── .python-version
├── manifest.json              # Obsidian plugin manifest
├── styles.css                 # Plugin styles (placeholder)
├── package.json               # Obsidian plugin build deps
├── tsconfig.json
├── esbuild.config.mjs
├── config.example.json        # Safe template (no secrets)
├── .env.example               # Env var template (no secrets)
├── .gitignore
├── ROADMAP.md
├── README.md
└── CLAUDE.md
```

Gitignored (never committed): `.env`, `config.json`, `cache.json`, `main.js`, `node_modules/`, `.venv/`, `__pycache__/`

---

## Milestones

### v0.1 — Repo Setup
**Goal:** Clean, publishable GitHub repo with proper project hygiene.

- [x] Move Python files → `backend/`
- [x] Delete `main.py` stub
- [x] Update `backend/vault_tool.py` to resolve `vault_path` from `OBSIDIAN_VAULT_PATH` env var and `cache_file` relative to `__file__`
- [x] Create `config.example.json` (no secrets, relative cache path)
- [x] Create `.env.example` (all env var keys with empty/placeholder values)
- [x] Replace `package.json` with proper Obsidian plugin scaffold (esbuild, TypeScript, obsidian API types)
- [x] Add `tsconfig.json`, `esbuild.config.mjs`, `manifest.json`, `styles.css`
- [x] Add `src/.gitkeep`
- [x] Update `.gitignore`
- [x] Add `.github/workflows/release.yml`
- [x] Update `README.md` and `CLAUDE.md` with new paths

**Verify:** `cd backend && python vault_tool.py book "三体"` works; `npm install && npm run build` produces `main.js`.

---

### v0.2 — Obsidian Plugin Skeleton
**Branch:** `feat/obsidian-gui`
**Goal:** A loadable Obsidian plugin that invokes the Python backend.

- [ ] `src/main.ts` — plugin entry point, registers commands
- [ ] `src/settings.ts` — settings tab: Python executable path, path to `config.json`, path to `.env`
- [ ] `src/modal.ts` — simple text input modal for book/movie title
- [ ] Spawn `python backend/vault_tool.py book "<title>"` as child process
- [ ] Capture stdout/stderr; surface errors as Obsidian notices
- [ ] On success: show notice + open created note via Obsidian API

---

### v0.3 — GUI Polish
**Branch:** `feat/obsidian-gui` (continued)
**Goal:** Full interactive search experience inside Obsidian.

- [ ] Disambiguation modal — when Python outputs multiple results, show picker in Obsidian
- [ ] Progress indicator during fetch (spinner notice)
- [ ] Graceful error states: Python not found, missing API key, network failure
- [ ] ISBN search command
- [ ] TV/teleplay type toggle in movie command

---

### v1.0 — Distribution
**Goal:** Installable via BRAT; optionally submitted to Obsidian Community Plugins.

- [ ] GitHub release automation: tag `v1.0.0` → CI builds and attaches `main.js`, `manifest.json`, `styles.css`
- [ ] BRAT-compatible repo structure verified
- [ ] README install instructions (BRAT + manual)
- [ ] (Optional) Obsidian Community Plugin PR
