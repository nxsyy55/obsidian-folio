# Test Plan Design — douban-obsidian

**Date:** 2026-03-27
**Status:** Approved

---

## Context

All v0.1–v0.3 milestones are complete. The backend pipeline (`vault_tool.py` → `douban.py` → `notes.py`) has no automated tests. This spec defines the test suite to be implemented before the v1.0 distribution milestone.

---

## Decisions

| Question | Decision |
|----------|----------|
| API strategy | Real live HTTP calls (Douban + Firecrawl) |
| Vault isolation | `tmp_path` fixture per test — no real vault touched |
| Test scope | All three layers: renderer, scraper, CLI |
| Test organization | Flat, no markers — all tests always run |
| Tests location | `tests/` at repo root |

---

## Directory Structure

```
douban-obsidian/
├── tests/
│   ├── __init__.py
│   ├── conftest.py
│   ├── test_notes.py
│   ├── test_douban.py
│   └── test_vault_tool.py
├── pytest.ini              # NEW: root-level pytest config
├── backend/
│   ├── vault_tool.py
│   ├── douban.py
│   └── notes.py
```

---

## pytest.ini (new file at repo root)

```ini
[pytest]
testpaths = tests
pythonpath = backend
```

This makes `import douban`, `import notes`, `import vault_tool` work from test files.

---

## conftest.py

```python
# tests/conftest.py
from pathlib import Path
from dotenv import load_dotenv
import pytest

# Load real credentials from backend/.env so FIRECRAWL_API_KEY is in os.environ
load_dotenv(Path(__file__).parent.parent / "backend" / ".env")

@pytest.fixture
def vault(tmp_path):
    """Fresh temporary vault directory with inbox/ pre-created."""
    (tmp_path / "inbox").mkdir()
    return tmp_path

@pytest.fixture
def config(vault, tmp_path):
    """Minimal config dict pointing to the temp vault; request_delay=0."""
    return {
        "vault_path": str(vault),
        "vault_name": "TestVault",
        "inbox_dir": "inbox",
        "book_dir": "ReadNotes",
        "watch_dir": "WatchNotes",
        "cache_file": str(tmp_path / "cache.json"),
        "request_delay": 0,
    }
```

**Key points:**
- `load_dotenv` at module import → credentials available to all tests
- `request_delay: 0` removes the 2 s sleep between network calls
- Every test gets a completely isolated `tmp_path` — no note collisions

---

## Vault Setup Conditions

Tests that exercise file I/O (all of `test_vault_tool.py`, plus `write_note` tests in `test_notes.py`) receive a temp vault via the `vault` fixture:

```
tmp_path/          ← OBSIDIAN_VAULT_PATH equivalent
└── inbox/         ← pre-created; all notes land here
    └── 三体.md   ← created by the test
```

No real Obsidian installation is required. The `open_in_obsidian()` call is not exercised by these tests (it opens a URI which requires Obsidian to be running).

---

## Prerequisites to Run Tests

1. Valid `backend/.env` with:
   ```
   FIRECRAWL_API_KEY=fc-...
   OBSIDIAN_VAULT_PATH=...   (only used by migration tests, if any)
   ```
2. Internet access (Douban JSON APIs + Firecrawl)
3. Python dependencies installed: `cd backend && uv sync`
4. pytest installed: `uv add --dev pytest python-dotenv`

Run from repo root:
```bash
pytest
```

---

## Test Cases

### test_notes.py — Pure renderer, no network

| # | Test name | What it verifies |
|---|-----------|-----------------|
| 1 | `test_book_frontmatter_fields` | `render_book_note()` with full metadata → all expected YAML keys present |
| 2 | `test_book_author_yaml_list` | Multiple authors → YAML list (`- Author A`) |
| 3 | `test_book_no_series_omitted` | `series=None` → `series:` key absent from frontmatter |
| 4 | `test_book_title_with_colon` | Title containing `:` → value is quoted, YAML parses cleanly |
| 5 | `test_book_tags_include_year` | `datePublished="2008-01-01"` → `#read/2008` in tags section |
| 6 | `test_movie_frontmatter_fields` | `render_movie_note()` → title, director list, genre list, score present |
| 7 | `test_movie_teleplay_has_tv_tag` | `type="teleplay"` → `#tv` appears in tags body |
| 8 | `test_movie_no_imdb_omitted` | `IMDb=None` → `IMDb:` key absent from frontmatter |
| 9 | `test_write_note_creates_file` | `write_note()` writes to `vault/inbox/title.md` (uses `vault` fixture) |
| 10 | `test_write_note_creates_parent_dirs` | Parent directories are auto-created if missing |

### test_douban.py — Live Douban + Firecrawl

| # | Test name | What it verifies |
|---|-----------|-----------------|
| 1 | `test_normalize_date_various_formats` | `_normalize_date("2010-4-1")` → `"2010-04-01"`, Chinese date format → ISO |
| 2 | `test_normalize_author_brackets` | `"[英] 乔治·奥威尔"` → `"英/乔治·奥威尔"` |
| 3 | `test_split_title_original` | `"三体 The Three-Body Problem"` splits correctly at CJK boundary |
| 4 | `test_search_book_returns_list` | `search_douban("三体")` → list with dicts containing `id` and `title` |
| 5 | `test_search_movie_returns_list` | `search_douban("盗梦空间", "movie")` → non-empty results |
| 6 | `test_search_by_isbn` | Known ISBN `9787536692930` → dict with correct Douban `id` |
| 7 | `test_fetch_book_detail_fields` | Known id `1220562` (三体) → has `title`, `author`, `isbn`, `score` |
| 8 | `test_fetch_book_caches_result` | Fetch once → `cache.json` written; fetch again → cache hit (file mtime unchanged) |
| 9 | `test_fetch_movie_detail_fields` | Known id `1292052` (Inception) → has `title`, `genre`, `director` |
| 10 | `test_fetch_movie_date_normalized` | Returned `datePublished` matches `YYYY-MM-DD` regex |

### test_vault_tool.py — Full pipeline e2e

**Important:** `cmd_book(args, config)` and `cmd_movie(args, config)` take an `argparse.Namespace`.
`disambiguate()` calls `sys.exit(0)` in non-TTY mode (tests), so e2e tests must use `args.id`
(a known Douban ID) to skip the search step entirely.

```python
from types import SimpleNamespace

args = SimpleNamespace(isbn=None, id="1220562", title="三体", type=None)
cmd_book(args, config)
```

| # | Test name | What it verifies |
|---|-----------|-----------------|
| 1 | `test_cmd_book_by_id` | `args.id="1220562"` → `vault/inbox/三体.md` exists |
| 2 | `test_cmd_book_by_isbn` | `args.isbn="9787536692930"`, `args.id=None` → note file created |
| 3 | `test_cmd_book_note_is_valid_yaml` | Parse YAML frontmatter of created note → no parse error |
| 4 | `test_cmd_movie_by_id` | `args.id="1292052"` (Inception) → note file created |
| 5 | `test_cmd_movie_teleplay` | `args.id="4840388"` (请回答1988), `args.type="teleplay"` → `#tv` in note body |
| 6 | `test_sanitize_filename` | `sanitize_filename("三体: 地球往事")` → no `:` in result |

---

## Verification

After implementation, verify end-to-end:

```bash
# From repo root
pytest -v

# Expected: 26 tests, all pass
# Tests 1-10: fast (no network)
# Tests 11-26: live API calls (~30-60s total)
```

Spot-check: open `tests/` temp dirs are cleaned by pytest automatically. Confirm no note files appear in your real `J:\Notes Library\inbox\`.
