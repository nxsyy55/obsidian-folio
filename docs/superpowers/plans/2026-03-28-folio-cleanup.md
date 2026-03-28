# Folio Cleanup & Marketplace Prep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove Python legacy, reorganize root, bump to v0.98.0, rewrite docs to reflect Folio as a multi-source plugin ready for Obsidian marketplace submission.

**Architecture:** Pure file operations and documentation rewrites — no TypeScript code changes. All tasks are independent and can be committed separately. The build must pass after Task 2 to confirm the esbuild move didn't break anything.

**Tech Stack:** Git, npm, markdown.

---

### Task 1: Delete Python legacy files

**Files:**
- Delete: `backend/`
- Delete: `tests/`
- Delete: `pytest.ini`
- Delete: `config.example.json`
- Delete: `.env.example`
- Delete: `__pycache__/` (root level)

**IMPORTANT: Do NOT modify `CLAUDE.md`, `README.md`, `ROADMAP.md`, `src/`, `manifest.json`, `package.json`, or any other files in this task.**

- [ ] **Step 1: Delete Python directories and files**

```bash
cd "J:\Notes Library\Scripts"
rm -rf backend tests __pycache__
rm -f pytest.ini config.example.json .env.example
```

- [ ] **Step 2: Verify deletions**

```bash
ls -1
```

Expected: `backend`, `tests`, `pytest.ini`, `config.example.json`, `.env.example`, `__pycache__` are gone. `src/`, `docs/`, `package.json`, `manifest.json`, `styles.css`, `tsconfig.json`, `esbuild.config.mjs` remain.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: remove Python legacy (backend, tests, pytest.ini, config.example.json, .env.example)"
```

---

### Task 2: Move esbuild config + update npm scripts + verify build

**Files:**
- Create: `build/` directory
- Move: `esbuild.config.mjs` → `build/esbuild.config.mjs`
- Modify: `package.json` (update script paths)

**IMPORTANT: Do NOT modify any other files.**

- [ ] **Step 1: Create build directory and move esbuild config**

```bash
cd "J:\Notes Library\Scripts"
mkdir -p build
mv esbuild.config.mjs build/esbuild.config.mjs
```

- [ ] **Step 2: Update package.json scripts**

Replace the `scripts` block in `package.json`:

```json
"scripts": {
    "dev": "node build/esbuild.config.mjs",
    "build": "tsc -noEmit -skipLibCheck && node build/esbuild.config.mjs production",
    "deploy": "npm run build && node -e \"const fs=require('fs'); const dest='../.obsidian/plugins/douban-obsidian/'; ['main.js','manifest.json','styles.css'].forEach(f=>{ if(fs.existsSync(f)) fs.copyFileSync(f, dest+f); });\""
},
```

- [ ] **Step 3: Run build to verify nothing broke**

```bash
npm run build
```

Expected: TypeScript check passes, esbuild completes, `main.js` appears at repo root. No errors.

- [ ] **Step 4: Commit**

```bash
git add build/esbuild.config.mjs package.json
git commit -m "chore: move esbuild config to build/ and update npm scripts"
```

---

### Task 3: Version bump and manifest/package metadata

**Files:**
- Modify: `manifest.json`
- Modify: `package.json`

**IMPORTANT: Do NOT modify any other files.**

- [ ] **Step 1: Update manifest.json**

Replace the full contents of `manifest.json`:

```json
{
  "id": "douban-obsidian",
  "name": "Folio",
  "version": "0.98.0",
  "minAppVersion": "1.0.0",
  "description": "Create Obsidian notes for books and movies. Searches Douban, IMDB, Open Library, and Google Books automatically.",
  "author": "Blue Double",
  "authorUrl": "https://github.com/nxsyy55/douban-notes-obs",
  "isDesktopOnly": true
}
```

- [ ] **Step 2: Update package.json name, version, description**

In `package.json`, update these three fields (leave everything else unchanged):

```json
"name": "folio",
"version": "0.98.0",
"description": "Create Obsidian notes for books and movies — Douban, IMDB, Open Library, Google Books",
```

- [ ] **Step 3: Commit**

```bash
git add manifest.json package.json
git commit -m "chore: bump version to 0.98.0, rename package to folio"
```

---

### Task 4: Rewrite README.md

**Files:**
- Rewrite: `README.md`

**IMPORTANT: Do NOT modify any other files.**

- [ ] **Step 1: Replace README.md with the following content**

Write this as the complete new `README.md`:

```markdown
# Folio

An Obsidian plugin that creates notes for books and movies from multiple sources.

## Prerequisites

- **Obsidian desktop** (desktop-only plugin)
- **Firecrawl API key** — optional, free tier at https://www.firecrawl.dev/. Only needed for Douban book and movie detail fetches. English sources (IMDB, Open Library, Google Books) work without it.

## Setup

### 1. Install the plugin

**Build from source:**

​```bash
npm install
npm run build
​```

Create the plugin folder in your vault if it doesn't exist:

​```
<vault>/.obsidian/plugins/douban-obsidian/
​```

Copy these three files into it:

​```
main.js
manifest.json
styles.css
​```

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

​```
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
​```

## Architecture

​```
User submits query
  ├── ISBN → searchByIsbnAll (Douban + Open Library + Google Books, parallel)
  └── Title
        ├── CJK   → Douban + Google Books (parallel)
        └── Latin → IMDB + Open Library (parallel)
              ├── 1 result  → fetch detail → create note
              ├── 2+ results → DisambiguationModal → fetch detail → create note
              └── 0 results → BlankNoteModal → create minimal note
​```

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
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: rewrite README for Folio multi-source plugin"
```

---

### Task 5: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

**IMPORTANT: Do NOT modify any other files. This is a targeted update — keep the Documentation Rule section exactly as-is.**

- [ ] **Step 1: Replace CLAUDE.md with the following content**

```markdown
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Setup

**Plugin (TypeScript):**

​```bash
npm install
npm run build
​```

Copy `main.js`, `manifest.json`, `styles.css` to `.obsidian/plugins/douban-obsidian/` in your vault. Configure Firecrawl API key (optional) and inbox folder in Settings → Folio.

## Running

The plugin is self-contained — install it in Obsidian and use the Command Palette to run **Folio: Add Note**.

Firecrawl API key is optional: only needed for Douban book and movie detail fetches. English sources (IMDB, Open Library, Google Books) work without it.

## Architecture

Six TypeScript modules in `src/`:

- `src/main.ts` — Plugin entry point: registers commands, wires search → disambiguation → fetch → write
- `src/settings.ts` — Settings tab: `firecrawlApiKey`, `inboxDir`, `requestDelay`, `templates`
- `src/modal.ts` — Search input modal, disambiguation list modal, blank-note type modal
- `src/douban.ts` — Douban HTTP: `searchDouban`, `searchByIsbn`, `fetchBookDetail`, `fetchMovieDetail`
- `src/sources.ts` — Multi-source: `detectLanguage`, `searchAll`, `searchByIsbnAll`, IMDB/Open Library/Google Books search + detail fetchers
- `src/notes.ts` — Pure renderers: `renderBookNote`, `renderMovieNote`, `renderBlankNote` → markdown string
- `src/cache.ts` — Cache read/write via vault adapter (`book_<id>` / `movie_<id>` / `gb_<id>` / `imdb_<id>` / `ol_<id>` keys)

**Data flow:**
​```
Command → DoubanModal (query + ISBN + template)
  ├── ISBN  → searchByIsbnAll (Douban + OL + GB parallel) → fetchAndCreate
  └── Title → searchAll (language-routed, parallel)
                ├── CJK   → searchDouban + searchGoogleBooks
                └── Latin → searchIMDB + searchOpenLibrary
                      ├── 1 result  → fetchAndCreate → renderNote → vault.create
                      ├── 2+ results → DisambiguationModal → fetchAndCreate
                      └── 0 results → BlankNoteModal → renderBlankNote → vault.create
​```

**Firecrawl integration:** `POST https://api.firecrawl.dev/v1/scrape` with `Authorization: Bearer <key>`. Used only by `fetchBookDetail` and `fetchMovieDetail` in `douban.ts`. Falls back to HTML parse on failure.

**Cache:** JSON file at `.obsidian/plugins/douban-obsidian/cache.json` via `vault.adapter`. Delete an entry to force re-fetch.

## Key Constraints

- Notes land in `inboxDir` first; user moves them to final location
- Firecrawl is optional — only Douban detail fetches use it; all other sources use `requestUrl` directly
- `requestDelay` applies only to Douban fetches; IMDB/Open Library/Google Books fire immediately
- `manifest.json`, `styles.css`, `main.js` must stay at repo root (Obsidian marketplace requirement)

## Documentation Rule

Any code change affecting architecture, CLI interface, dependencies, or scraping strategy must update both `CLAUDE.md` and `README.md` in the same commit.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for multi-source architecture, remove Python references"
```

---

### Task 6: Move and update ROADMAP.md

**Files:**
- Move: `ROADMAP.md` → `docs/ROADMAP.md`
- Rewrite: `docs/ROADMAP.md`

**IMPORTANT: Do NOT modify any other files.**

- [ ] **Step 1: Remove the old ROADMAP.md from root**

```bash
cd "J:\Notes Library\Scripts"
git rm ROADMAP.md
```

- [ ] **Step 2: Write the new docs/ROADMAP.md**

Create `docs/ROADMAP.md` with this content:

```markdown
# Folio — Roadmap

## Folder Structure

​```
folio/
├── .github/
│   └── workflows/
│       └── release.yml        # Build + attach main.js, manifest.json, styles.css on v* tag
├── src/                       # Obsidian plugin TypeScript
│   ├── main.ts
│   ├── settings.ts
│   ├── modal.ts
│   ├── douban.ts
│   ├── sources.ts
│   ├── notes.ts
│   └── cache.ts
├── build/
│   └── esbuild.config.mjs
├── docs/
│   ├── ROADMAP.md
│   └── superpowers/
├── manifest.json              # Obsidian plugin manifest (must be at root)
├── styles.css                 # Plugin styles (must be at root)
├── package.json
├── tsconfig.json
├── README.md
└── CLAUDE.md
​```

Gitignored: `main.js`, `node_modules/`, `.venv/`, `__pycache__/`

---

## Milestones

### v0.1 — Repo Setup ✅
Clean, publishable GitHub repo with proper project hygiene. Python CLI in `backend/`, Obsidian plugin scaffold in `src/`.

### v0.2 — Obsidian Plugin Skeleton ✅
Loadable Obsidian plugin invoking the Python backend via child process.

### v0.3 — GUI Polish ✅
Full interactive search experience: disambiguation modal, progress indicators, ISBN search, TV type toggle.

### v0.4 — TypeScript Rewrite ✅
Plugin fully self-contained in TypeScript. Python backend removed as dependency. Firecrawl integration for Douban detail pages. Single unified "Add Note" command with template support.

### v0.4.x — Multi-Source Search ✅
Added IMDB, Open Library, and Google Books as sources alongside Douban. Automatic language routing (CJK → Douban + Google Books; Latin → IMDB + Open Library). Parallel ISBN lookup across all book sources. Blank note fallback when all sources return zero results.

### v0.98 — Cleanup & Marketplace Prep ✅
Removed Python legacy (`backend/`, `tests/`, config files). Renamed to Folio throughout. Reorganized project root. Updated all documentation. Pre-release candidate pending field validation.

### v1.0 — Distribution 🔲
**Status:** Pending 3-day field validation.

- [ ] GitHub release: tag `v1.0.0` → CI builds and attaches `main.js`, `manifest.json`, `styles.css`
- [ ] BRAT-compatible repo structure verified
- [ ] README install instructions (BRAT + manual)
- [ ] (Optional) Obsidian Community Plugin PR
```

- [ ] **Step 3: Commit**

```bash
git add docs/ROADMAP.md
git commit -m "docs: move ROADMAP to docs/, add v0.4x and v0.98 milestones, remove Python sections"
```

---

### Task 7: Deploy and final verify

**Files:** None modified — verification only.

- [ ] **Step 1: Run full build**

```bash
cd "J:\Notes Library\Scripts"
npm run build
```

Expected: TypeScript check passes, `main.js` generated at root. No errors.

- [ ] **Step 2: Deploy to vault**

```bash
npm run deploy
```

Expected: `main.js`, `manifest.json`, `styles.css` copied to `.obsidian/plugins/douban-obsidian/`. No errors.

- [ ] **Step 3: Verify root is clean**

```bash
ls -1
```

Expected root contains only: `CLAUDE.md`, `LICENSE`, `README.md`, `build/`, `docs/`, `main.js`, `manifest.json`, `node_modules/`, `package-lock.json`, `package.json`, `src/`, `styles.css`, `tsconfig.json` (plus hidden: `.claude/`, `.git/`, `.github/`, `.gitignore`).

No `backend/`, `tests/`, `pytest.ini`, `config.example.json`, `.env.example`, `ROADMAP.md`, `esbuild.config.mjs` at root.

- [ ] **Step 4: Check git log**

```bash
git log --oneline -8
```

Expected: 6 new commits visible (Tasks 1–6).
