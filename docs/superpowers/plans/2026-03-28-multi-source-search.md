# Multi-Source Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Google Books, IMDB, and Open Library as search sources with automatic language routing, and create a blank-note fallback when all sources return zero results.

**Architecture:** A new `src/sources.ts` contains all new provider logic (search, detail fetch, language detection, routing). `modal.ts`, `notes.ts`, and `main.ts` are updated minimally. `douban.ts` is untouched.

**Tech Stack:** TypeScript, Obsidian `requestUrl` + `DOMParser`, esbuild. Build: `npm run build`. Deploy: `npm run deploy`.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/sources.ts` | **Create** | Language detection, Google Books / IMDB / Open Library search + detail, `searchAll`, `searchByIsbnAll` |
| `src/modal.ts` | **Modify** | Add `source` to `Candidate`, update `DisambiguationModal` labels, add `BlankNoteModal` |
| `src/notes.ts` | **Modify** | Add `renderBlankNote` |
| `src/main.ts` | **Modify** | Use `searchAll` / `searchByIsbnAll`, dispatch detail by source, blank note path, extract `writeNote` helper |
| `src/douban.ts` | **Untouched** | — |
| `src/cache.ts` | **Untouched** | — |
| `src/settings.ts` | **Untouched** | — |

---

### Task 1: Add `source` field to `Candidate` and update `DisambiguationModal`

**Files:**
- Modify: `src/modal.ts`
- Modify: `src/douban.ts` (add `source: 'douban'` to existing Candidate objects)

- [ ] **Step 1: Update `Candidate` interface in `src/modal.ts`**

Find the `Candidate` interface (line ~4) and add the `source` field:

```typescript
export interface Candidate {
    id: string;
    title: string;
    sub_title: string;
    type: string;
    year: string;
    source: 'douban' | 'imdb' | 'openlibrary' | 'googlebooks';
}
```

- [ ] **Step 2: Update `DisambiguationModal` row label in `src/modal.ts`**

Replace the `label` construction (around line 118) with:

```typescript
const sourceLabel: Record<string, string> = {
    douban: 'Douban',
    imdb: 'IMDB',
    openlibrary: 'Open Library',
    googlebooks: 'Google Books',
};
const label = [
    candidate.title,
    candidate.sub_title ? ` / ${candidate.sub_title}` : '',
    ` (${candidate.type}${candidate.year ? ', ' + candidate.year : ''}, ${sourceLabel[candidate.source] ?? candidate.source})`,
].join('');
```

- [ ] **Step 3: Fix TypeScript errors in `src/douban.ts`**

Adding `source` to `Candidate` makes TypeScript error on the two places that build Candidate objects in `douban.ts`. Add `source: 'douban'` to each.

In `searchDouban`, inside `results.push({...})`:
```typescript
results.push({
    id: String(item.id ?? ''),
    title: String(item.title ?? ''),
    sub_title: String(item.sub_title ?? item.author_name ?? ''),
    type: itemType,
    year: String(item.year ?? ''),
    source: 'douban',
});
```

In `searchByIsbn`, the return statement:
```typescript
return { id: idMatch[1], title, sub_title: '', type: 'book', year: '', source: 'douban' };
```

- [ ] **Step 4: Build to verify**

```bash
cd "J:\Notes Library\Scripts" && npm run build
```

Expected: 0 TypeScript errors, `main.js` produced.

- [ ] **Step 5: Commit**

```bash
git add src/modal.ts src/douban.ts
git commit -m "feat: add source field to Candidate type"
```

---

### Task 2: Add `renderBlankNote` to `src/notes.ts`

**Files:**
- Modify: `src/notes.ts`

- [ ] **Step 1: Add `renderBlankNote` function**

Append to the end of `src/notes.ts`:

```typescript
export function renderBlankNote(
    title: string,
    type: 'book' | 'movie',
    template?: FolioTemplate | null
): string {
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const lines: string[] = [];
    lines.push('---');
    lines.push(`title: ${yamlValue(title)}`);
    lines.push(`type: ${type}`);
    lines.push(`createTime: ${now}`);
    lines.push('---');
    lines.push('');
    if (template?.body) lines.push(template.body);
    return lines.join('\n') + '\n';
}
```

Note: no tags field, even if the template has tags — intentional per design.

- [ ] **Step 2: Build to verify**

```bash
npm run build
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/notes.ts
git commit -m "feat: add renderBlankNote for zero-result fallback"
```

---

### Task 3: Add `BlankNoteModal` to `src/modal.ts`

**Files:**
- Modify: `src/modal.ts`

- [ ] **Step 1: Add `BlankNoteModal` class**

Append to the end of `src/modal.ts`:

```typescript
export class BlankNoteModal extends Modal {
    private title: string;
    private onSelect: (type: 'book' | 'movie') => void;

    constructor(app: App, title: string, onSelect: (type: 'book' | 'movie') => void) {
        super(app);
        this.title = title;
        this.onSelect = onSelect;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        this.titleEl.setText('Folio: No Results Found');

        const msg = contentEl.createEl('p', {
            text: `No results for "${this.title}". Create a blank note as:`,
        });
        msg.style.marginBottom = '1em';

        const buttonRow = contentEl.createDiv();
        buttonRow.style.display = 'flex';
        buttonRow.style.gap = '8px';

        const bookBtn = buttonRow.createEl('button', { text: 'Book' });
        bookBtn.addClass('mod-cta');
        bookBtn.addEventListener('click', () => { this.close(); this.onSelect('book'); });

        const movieBtn = buttonRow.createEl('button', { text: 'Movie' });
        movieBtn.addEventListener('click', () => { this.close(); this.onSelect('movie'); });

        const cancelBtn = buttonRow.createEl('button', { text: 'Cancel' });
        cancelBtn.addEventListener('click', () => this.close());
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
```

- [ ] **Step 2: Build to verify**

```bash
npm run build
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/modal.ts
git commit -m "feat: add BlankNoteModal for zero-result fallback"
```

---

### Task 4: Create `src/sources.ts` with `detectLanguage` + Google Books

**Files:**
- Create: `src/sources.ts`

- [ ] **Step 1: Create the file with all imports and `detectLanguage`**

Create `src/sources.ts` with:

```typescript
import { requestUrl, Vault } from 'obsidian';
import type { Candidate } from './modal';
import { BookMetadata, MovieMetadata } from './notes';
import { loadCache, saveCache } from './cache';
import { searchDouban, searchByIsbn } from './douban';

const DEFAULT_UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// ── Language detection ─────────────────────────────────────────────────────

export function detectLanguage(query: string): 'cjk' | 'latin' {
    return /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(query) ? 'cjk' : 'latin';
}
```

- [ ] **Step 2: Add Google Books search**

Append to `src/sources.ts`:

```typescript
// ── Google Books ───────────────────────────────────────────────────────────

export async function searchGoogleBooks(query: string): Promise<Candidate[]> {
    try {
        const resp = await requestUrl({
            url: `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=10`,
            headers: { 'User-Agent': DEFAULT_UA },
            throw: false,
        });
        if (resp.status !== 200) return [];
        const items = (resp.json?.items as Record<string, unknown>[]) ?? [];
        return items.map(item => {
            const info = (item.volumeInfo as Record<string, unknown>) ?? {};
            const authors = (info.authors as string[]) ?? [];
            return {
                id: String(item.id ?? ''),
                title: String(info.title ?? ''),
                sub_title: authors.join(', '),
                type: 'book',
                year: String(info.publishedDate ?? '').slice(0, 4),
                source: 'googlebooks' as const,
            };
        });
    } catch {
        return [];
    }
}
```

- [ ] **Step 3: Add Google Books detail fetch**

Append to `src/sources.ts`:

```typescript
export async function fetchGoogleBooksDetail(id: string, vault: Vault): Promise<BookMetadata | null> {
    const cache = await loadCache(vault);
    const cacheKey = `gb_${id}`;
    if (cache[cacheKey]) return cache[cacheKey] as BookMetadata;

    try {
        const resp = await requestUrl({
            url: `https://www.googleapis.com/books/v1/volumes/${id}`,
            headers: { 'User-Agent': DEFAULT_UA },
            throw: false,
        });
        if (resp.status !== 200) return null;
        const info = (resp.json?.volumeInfo as Record<string, unknown>) ?? {};
        const identifiers = (info.industryIdentifiers as { type: string; identifier: string }[]) ?? [];
        const isbn = identifiers.find(i => i.type === 'ISBN_13')?.identifier
                  ?? identifiers.find(i => i.type === 'ISBN_10')?.identifier
                  ?? '';

        const result: BookMetadata = {
            type: 'book',
            title: String(info.title ?? ''),
            subTitle: String(info.subtitle ?? ''),
            originalTitle: '',
            series: '',
            author: (info.authors as string[]) ?? [],
            score: '',
            datePublished: String(info.publishedDate ?? '').slice(0, 10),
            translator: [],
            publisher: String(info.publisher ?? ''),
            producer: '',
            isbn,
            url: `https://books.google.com/books?id=${id}`,
        };

        cache[cacheKey] = result;
        await saveCache(vault, cache);
        return result;
    } catch {
        return null;
    }
}
```

- [ ] **Step 4: Build to verify**

```bash
npm run build
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/sources.ts
git commit -m "feat: add detectLanguage and Google Books provider"
```

---

### Task 5: Add IMDB search + detail to `src/sources.ts`

**Files:**
- Modify: `src/sources.ts`

IMDB search uses the unofficial suggestion endpoint. Detail is parsed from JSON-LD embedded in every IMDB title page — this is more reliable than scraping the page structure.

- [ ] **Step 1: Add IMDB helpers and search**

Append to `src/sources.ts`:

```typescript
// ── IMDB ───────────────────────────────────────────────────────────────────

function imdbQidToType(qid: string): string {
    return qid === 'tvSeries' || qid === 'tvMiniSeries' ? 'teleplay' : 'movie';
}

function parseIso8601Duration(duration: string): string {
    // "PT2H46M" → "2h 46min", "PT90M" → "90min"
    const h = duration.match(/(\d+)H/)?.[1];
    const m = duration.match(/(\d+)M/)?.[1];
    if (h && m) return `${h}h ${m}min`;
    if (h) return `${h}h`;
    if (m) return `${m}min`;
    return duration;
}

export async function searchIMDB(query: string): Promise<Candidate[]> {
    try {
        const firstChar = encodeURIComponent(query.trim()[0]?.toLowerCase() ?? 'x');
        const resp = await requestUrl({
            url: `https://v3.sg.media-imdb.com/suggestion/${firstChar}/${encodeURIComponent(query)}.json`,
            headers: { 'User-Agent': DEFAULT_UA },
            throw: false,
        });
        if (resp.status !== 200) return [];
        const items = (resp.json?.d as Record<string, unknown>[]) ?? [];
        return items
            .filter(item => ['movie', 'tvSeries', 'tvMiniSeries'].includes(String(item.qid ?? '')))
            .map(item => ({
                id: String(item.id ?? ''),
                title: String(item.l ?? ''),
                sub_title: String(item.s ?? ''),
                type: imdbQidToType(String(item.qid ?? '')),
                year: String(item.y ?? ''),
                source: 'imdb' as const,
            }));
    } catch {
        return [];
    }
}
```

- [ ] **Step 2: Add IMDB detail fetch**

Append to `src/sources.ts`:

```typescript
export async function fetchIMDBDetail(id: string, vault: Vault): Promise<MovieMetadata | null> {
    const cache = await loadCache(vault);
    const cacheKey = `imdb_${id}`;
    if (cache[cacheKey]) return cache[cacheKey] as MovieMetadata;

    try {
        const resp = await requestUrl({
            url: `https://www.imdb.com/title/${id}/`,
            headers: { 'User-Agent': DEFAULT_UA, 'Accept-Language': 'en-US,en;q=0.9' },
            throw: false,
        });
        if (resp.status !== 200) return null;

        const doc = new DOMParser().parseFromString(resp.text, 'text/html');
        const ldScript = doc.querySelector('script[type="application/ld+json"]');
        if (!ldScript?.textContent) return null;

        const ld = JSON.parse(ldScript.textContent) as Record<string, unknown>;

        const ldType = String(ld['@type'] ?? '');
        const type: 'movie' | 'teleplay' =
            ldType === 'TVSeries' || ldType === 'TVMiniSeries' ? 'teleplay' : 'movie';

        const rawDirector = ld.director;
        const directors: string[] = Array.isArray(rawDirector)
            ? (rawDirector as Record<string, unknown>[]).map(d => String(d.name ?? ''))
            : rawDirector
            ? [String((rawDirector as Record<string, unknown>).name ?? '')]
            : [];

        const rawCountry = ld.countryOfOrigin;
        const countries: string[] = Array.isArray(rawCountry)
            ? (rawCountry as Record<string, unknown>[]).map(c => String(c.name ?? ''))
            : [];

        const result: MovieMetadata = {
            title: String(ld.name ?? ''),
            type,
            originalTitle: '',
            genre: (ld.genre as string[]) ?? [],
            datePublished: String(ld.datePublished ?? ''),
            director: directors,
            score: String((ld.aggregateRating as Record<string, unknown>)?.ratingValue ?? ''),
            url: `https://www.imdb.com/title/${id}/`,
            country: countries,
            IMDb: id,
            time: ld.duration ? parseIso8601Duration(String(ld.duration)) : '',
        };

        cache[cacheKey] = result;
        await saveCache(vault, cache);
        return result;
    } catch {
        return null;
    }
}
```

- [ ] **Step 3: Build to verify**

```bash
npm run build
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/sources.ts
git commit -m "feat: add IMDB provider"
```

---

### Task 6: Add Open Library search + detail to `src/sources.ts`

**Files:**
- Modify: `src/sources.ts`

Open Library works API gives title and author keys. Author names require a second fetch per author (usually 1–3), fired in parallel.

- [ ] **Step 1: Add Open Library search**

Append to `src/sources.ts`:

```typescript
// ── Open Library ───────────────────────────────────────────────────────────

export async function searchOpenLibrary(query: string): Promise<Candidate[]> {
    try {
        const resp = await requestUrl({
            url: `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&fields=key,title,author_name,first_publish_year&limit=10`,
            headers: { 'User-Agent': DEFAULT_UA },
            throw: false,
        });
        if (resp.status !== 200) return [];
        const docs = (resp.json?.docs as Record<string, unknown>[]) ?? [];
        return docs.map(doc => {
            const key = String(doc.key ?? '');          // "/works/OL45804W"
            const id = key.replace('/works/', '');
            const authors = (doc.author_name as string[]) ?? [];
            return {
                id,
                title: String(doc.title ?? ''),
                sub_title: authors.join(', '),
                type: 'book',
                year: String(doc.first_publish_year ?? ''),
                source: 'openlibrary' as const,
            };
        });
    } catch {
        return [];
    }
}
```

- [ ] **Step 2: Add Open Library detail fetch**

Append to `src/sources.ts`:

```typescript
export async function fetchOpenLibraryDetail(id: string, vault: Vault): Promise<BookMetadata | null> {
    const cache = await loadCache(vault);
    const cacheKey = `ol_${id}`;
    if (cache[cacheKey]) return cache[cacheKey] as BookMetadata;

    try {
        const resp = await requestUrl({
            url: `https://openlibrary.org/works/${id}.json`,
            headers: { 'User-Agent': DEFAULT_UA },
            throw: false,
        });
        if (resp.status !== 200) return null;
        const work = resp.json as Record<string, unknown>;

        // Fetch author names in parallel (each entry is { author: { key: "/authors/OL26320A" } })
        const authorEntries = (work.authors as { author: { key: string } }[]) ?? [];
        const authorNames = await Promise.all(
            authorEntries.map(async entry => {
                try {
                    const ar = await requestUrl({
                        url: `https://openlibrary.org${entry.author.key}.json`,
                        headers: { 'User-Agent': DEFAULT_UA },
                        throw: false,
                    });
                    return ar.status === 200 ? String(ar.json?.name ?? '') : '';
                } catch {
                    return '';
                }
            })
        );

        const result: BookMetadata = {
            type: 'book',
            title: String(work.title ?? ''),
            subTitle: '',
            originalTitle: '',
            series: '',
            author: authorNames.filter(Boolean),
            score: '',
            datePublished: String(work.first_publish_date ?? '').slice(0, 10),
            translator: [],
            publisher: '',
            producer: '',
            isbn: '',
            url: `https://openlibrary.org/works/${id}`,
        };

        cache[cacheKey] = result;
        await saveCache(vault, cache);
        return result;
    } catch {
        return null;
    }
}
```

- [ ] **Step 3: Build to verify**

```bash
npm run build
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/sources.ts
git commit -m "feat: add Open Library provider"
```

---

### Task 7: Add `searchAll` and `searchByIsbnAll` to `src/sources.ts`

**Files:**
- Modify: `src/sources.ts`

- [ ] **Step 1: Add ISBN helpers (private)**

Append to `src/sources.ts`:

```typescript
// ── ISBN search ────────────────────────────────────────────────────────────

async function searchOpenLibraryByIsbn(isbn: string): Promise<Candidate | null> {
    try {
        const resp = await requestUrl({
            url: `https://openlibrary.org/search.json?isbn=${encodeURIComponent(isbn)}&fields=key,title,author_name,first_publish_year&limit=1`,
            headers: { 'User-Agent': DEFAULT_UA },
            throw: false,
        });
        if (resp.status !== 200) return null;
        const doc = (resp.json?.docs as Record<string, unknown>[])?.[0];
        if (!doc) return null;
        const key = String(doc.key ?? '');
        const id = key.replace('/works/', '');
        if (!id) return null;
        const authors = (doc.author_name as string[]) ?? [];
        return {
            id,
            title: String(doc.title ?? ''),
            sub_title: authors.join(', '),
            type: 'book',
            year: String(doc.first_publish_year ?? ''),
            source: 'openlibrary',
        };
    } catch {
        return null;
    }
}

async function searchGoogleBooksByIsbn(isbn: string): Promise<Candidate | null> {
    try {
        const resp = await requestUrl({
            url: `https://www.googleapis.com/books/v1/volumes?q=isbn:${encodeURIComponent(isbn)}&maxResults=1`,
            headers: { 'User-Agent': DEFAULT_UA },
            throw: false,
        });
        if (resp.status !== 200) return null;
        const item = (resp.json?.items as Record<string, unknown>[])?.[0];
        if (!item) return null;
        const info = (item.volumeInfo as Record<string, unknown>) ?? {};
        const authors = (info.authors as string[]) ?? [];
        return {
            id: String(item.id ?? ''),
            title: String(info.title ?? ''),
            sub_title: authors.join(', '),
            type: 'book',
            year: String(info.publishedDate ?? '').slice(0, 4),
            source: 'googlebooks',
        };
    } catch {
        return null;
    }
}
```

- [ ] **Step 2: Add `searchByIsbnAll` (exported)**

Append to `src/sources.ts`:

```typescript
export async function searchByIsbnAll(isbn: string): Promise<Candidate | null> {
    const [douban, ol, gb] = await Promise.all([
        searchByIsbn(isbn),
        searchOpenLibraryByIsbn(isbn),
        searchGoogleBooksByIsbn(isbn),
    ]);
    return douban ?? ol ?? gb ?? null;
}
```

- [ ] **Step 3: Add `searchAll` (exported)**

Append to `src/sources.ts`:

```typescript
// ── Routing ────────────────────────────────────────────────────────────────

export async function searchAll(query: string): Promise<Candidate[]> {
    const lang = detectLanguage(query);
    const searches: Promise<Candidate[]>[] =
        lang === 'cjk'
            ? [searchDouban(query), searchGoogleBooks(query)]
            : [searchIMDB(query), searchOpenLibrary(query)];
    const results = await Promise.all(searches);
    return results.flat();
}
```

- [ ] **Step 4: Build to verify**

```bash
npm run build
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/sources.ts
git commit -m "feat: add searchAll and searchByIsbnAll routing"
```

---

### Task 8: Wire `src/main.ts`

**Files:**
- Modify: `src/main.ts`

Replace the entire file contents with the following. Key changes from the original:
- Imports `searchAll`, `searchByIsbnAll`, three new detail fetchers from `sources.ts`
- Imports `BlankNoteModal`, `renderBlankNote`
- Extracts `writeNote` helper to eliminate duplication
- Extracts `fetchAndCreate` helper that dispatches detail fetch by source
- `runBackend` is simplified to search + route + fallback

```typescript
import { Plugin, Notice, normalizePath } from 'obsidian';
import { DoubanSettings, DEFAULT_SETTINGS, DoubanSettingTab, FolioTemplate } from './settings';
import { DoubanModal, DisambiguationModal, BlankNoteModal } from './modal';
import {
    searchAll,
    searchByIsbnAll,
    fetchGoogleBooksDetail,
    fetchIMDBDetail,
    fetchOpenLibraryDetail,
} from './sources';
import { fetchBookDetail, fetchMovieDetail } from './douban';
import { renderBookNote, renderMovieNote, renderBlankNote } from './notes';

interface RunOptions {
    isbn?: string;
    id?: string;
    source?: string;
    category?: 'book' | 'movie';
    mediaType?: string;
    template?: FolioTemplate | null;
}

const SOURCE_LABEL: Record<string, string> = {
    douban: 'Douban',
    imdb: 'IMDB',
    openlibrary: 'Open Library',
    googlebooks: 'Google Books',
};

function sanitizeFilename(name: string): string {
    return name
        .replace(/[<>:"/\\|?*]/g, '-')
        .replace(/[\uff1a\uff0f\u300a\u300b\u3010\u3011\u300c\u300d\u300e\u300f\u3001\u3002\uff01\uff1f\uff08\uff09\u2014\u2026\u00b7]/g, '-')
        .replace(/-{2,}/g, '-')
        .replace(/^[-\s]+|[-\s]+$/g, '')
        .trim();
}

export default class DoubanPlugin extends Plugin {
    settings: DoubanSettings;

    async onload(): Promise<void> {
        await this.loadSettings();
        this.addSettingTab(new DoubanSettingTab(this.app, this));

        this.addCommand({
            id: 'add-note',
            name: 'Add Note',
            callback: () => {
                new DoubanModal(this.app, this.settings.templates, (query, isbn, tplIndex) => {
                    const template = tplIndex >= 0 ? this.settings.templates[tplIndex] : null;
                    if (isbn) {
                        this.runBackend('', { isbn, template });
                    } else {
                        this.runBackend(query, { template });
                    }
                }).open();
            },
        });
    }

    private async runBackend(title: string, options: RunOptions = {}): Promise<void> {
        const notice = new Notice('Searching...', 0);

        try {
            // ── ISBN path ──────────────────────────────────────────────────
            if (options.isbn) {
                const found = await searchByIsbnAll(options.isbn);
                notice.hide();
                if (!found) {
                    new Notice('ISBN not found on any source.', 6000);
                    return;
                }
                await this.fetchAndCreate(found.title || options.isbn, found.id, found.source, {
                    category: 'book',
                    template: options.template,
                });
                return;
            }

            // ── Direct ID path (from disambiguation) ───────────────────────
            if (options.id) {
                notice.hide();
                await this.fetchAndCreate(title, options.id, options.source ?? 'douban', options);
                return;
            }

            // ── Title search path ──────────────────────────────────────────
            const results = await searchAll(title);
            notice.hide();

            if (results.length === 0) {
                new BlankNoteModal(this.app, title, async type => {
                    const content = renderBlankNote(title, type, options.template ?? null);
                    await this.writeNote(title, content);
                }).open();
                return;
            }

            if (results.length === 1) {
                await this.fetchAndCreate(results[0].title || title, results[0].id, results[0].source, {
                    ...options,
                    category: results[0].type === 'book' ? 'book' : 'movie',
                    mediaType: results[0].type === 'teleplay' ? 'teleplay' : undefined,
                });
                return;
            }

            new DisambiguationModal(this.app, results, selected => {
                this.fetchAndCreate(selected.title || title, selected.id, selected.source, {
                    ...options,
                    category: selected.type === 'book' ? 'book' : 'movie',
                    mediaType: selected.type === 'teleplay' ? 'teleplay' : undefined,
                });
            }).open();

        } catch (e) {
            notice.hide();
            new Notice(`Error: ${e instanceof Error ? e.message : String(e)}`, 8000);
        }
    }

    private async fetchAndCreate(
        title: string,
        id: string,
        source: string,
        options: RunOptions
    ): Promise<void> {
        const label = SOURCE_LABEL[source] ?? source;
        const notice = new Notice(`Fetching from ${label}...`, 0);

        try {
            let content: string;
            let noteTitle: string;

            if (source === 'imdb') {
                const meta = await fetchIMDBDetail(id, this.app.vault);
                if (!meta) { notice.hide(); new Notice('Failed to fetch from IMDB.', 8000); return; }
                content = renderMovieNote(meta, options.template);
                noteTitle = meta.title || title;

            } else if (source === 'openlibrary') {
                const meta = await fetchOpenLibraryDetail(id, this.app.vault);
                if (!meta) { notice.hide(); new Notice('Failed to fetch from Open Library.', 8000); return; }
                content = renderBookNote(meta, options.template);
                noteTitle = meta.title || title;

            } else if (source === 'googlebooks') {
                const meta = await fetchGoogleBooksDetail(id, this.app.vault);
                if (!meta) { notice.hide(); new Notice('Failed to fetch from Google Books.', 8000); return; }
                content = renderBookNote(meta, options.template);
                noteTitle = meta.title || title;

            } else {
                // douban
                const category = options.category ?? 'movie';
                if (category === 'book') {
                    const meta = await fetchBookDetail(id, this.settings, this.app.vault);
                    if (!meta) { notice.hide(); new Notice('Failed to fetch book details. Check your Firecrawl key or network.', 8000); return; }
                    content = renderBookNote(meta, options.template);
                    noteTitle = meta.title || title;
                } else {
                    const meta = await fetchMovieDetail(id, options.mediaType, this.settings, this.app.vault);
                    if (!meta) { notice.hide(); new Notice('Failed to fetch movie details. Check your network.', 8000); return; }
                    content = renderMovieNote(meta, options.template);
                    noteTitle = meta.title || title;
                }
            }

            notice.hide();
            await this.writeNote(noteTitle, content);

        } catch (e) {
            notice.hide();
            new Notice(`Error: ${e instanceof Error ? e.message : String(e)}`, 8000);
        }
    }

    private async writeNote(title: string, content: string): Promise<void> {
        const filename = sanitizeFilename(title) + '.md';
        const filePath = normalizePath(`${this.settings.inboxDir}/${filename}`);
        try {
            await this.app.vault.create(filePath, content);
        } catch {
            new Notice(`Note already exists: ${filename}`, 6000);
            return;
        }
        new Notice(`Note created: ${filename}`, 4000);
        this.app.workspace.openLinkText(filename, '', true).catch(() => {});
    }

    async loadSettings(): Promise<void> {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings(): Promise<void> {
        await this.saveData(this.settings);
    }
}
```

- [ ] **Step 2: Build to verify**

```bash
npm run build
```

Expected: 0 TypeScript errors, `main.js` produced.

- [ ] **Step 3: Commit**

```bash
git add src/main.ts
git commit -m "feat: wire multi-source search, blank note fallback, and source dispatch in main"
```

---

### Task 9: Deploy and smoke test

**Files:** None — deploy + manual verification only.

- [ ] **Step 1: Deploy to Obsidian vault**

```bash
npm run deploy
```

Expected: `main.js`, `manifest.json`, `styles.css` copied to `.obsidian/plugins/douban-obsidian/`.

- [ ] **Step 2: Reload the plugin in Obsidian**

Settings → Community Plugins → disable "Folio" → re-enable. Or use the Obsidian hotkey to reload plugins if you have one configured.

- [ ] **Step 3: Smoke test — Chinese book (Douban + Google Books)**

Open command palette → "Folio: Add Note" → type `三体` → search.
Expected: disambiguation list shows results with `(book, Douban)` and/or `(book, Google Books)` labels.

- [ ] **Step 4: Smoke test — English book (Open Library)**

Search `Dune Frank Herbert`.
Expected: results show `(book, Open Library)` labels. Select one, note created with title, author, datePublished populated.

- [ ] **Step 5: Smoke test — English movie (IMDB)**

Search `Dune 2021`.
Expected: results show `(movie, IMDB)` labels. Select one, note created with title, genre, director, IMDb field populated.

- [ ] **Step 6: Smoke test — ISBN, Chinese book**

Enter ISBN `9787536692930` (三体 Chinese edition).
Expected: Douban finds it, note created.

- [ ] **Step 7: Smoke test — ISBN, English book**

Enter ISBN `9780441013593` (Dune).
Expected: Open Library or Google Books finds it, note created with author and title populated.

- [ ] **Step 8: Smoke test — blank note fallback**

Search a nonsense string like `xyzqwerty123notarealbook`.
Expected: `BlankNoteModal` appears. Click **Book**. Note created with only `title`, `type: book`, `createTime` in YAML — no tags field — and template body appended.

- [ ] **Step 9: Commit any fixes found during smoke test**

```bash
git add -A
git commit -m "fix: <describe issue>"
```

---

## Self-Review Checklist (completed)

| Spec requirement | Task |
|---|---|
| CJK → Douban + Google Books | Task 7 `searchAll` |
| Latin → IMDB + Open Library | Task 7 `searchAll` |
| ISBN → all three book sources in parallel | Task 7 `searchByIsbnAll` |
| `source` field on `Candidate` | Task 1 |
| `DisambiguationModal` shows source label | Task 1 |
| `BlankNoteModal` on 0 results | Task 3, Task 8 |
| `renderBlankNote`: title, type, createTime, template body, no tags | Task 2 |
| `fetchGoogleBooksDetail` with `gb_` cache key | Task 4 |
| `fetchIMDBDetail` via JSON-LD, `imdb_` cache key | Task 5 |
| `fetchOpenLibraryDetail` with author name fetch, `ol_` cache key | Task 6 |
| Notice text shows active source | Task 8 `fetchAndCreate` |
| `douban.ts` untouched | — |
| `requestDelay` applies to Douban only | New sources have no delay |
