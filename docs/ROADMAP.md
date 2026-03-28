# Folio — Roadmap

## Folder Structure

```
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
```

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

---
