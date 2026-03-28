# TypeScript Rewrite — douban-obsidian Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the Python backend entirely into TypeScript so the Obsidian plugin is self-contained — no Python, no external scripts, no path configuration.

**Architecture:** Five new/modified TypeScript files in `src/`. All HTTP calls go through Obsidian's `requestUrl`. Firecrawl is called directly as an HTTP API (primary). Direct `requestUrl` + `DOMParser` HTML parsing is the fallback. File I/O uses the Obsidian vault adapter. The Python backend in `backend/` stays untouched as a standalone CLI.

**Tech Stack:** TypeScript, Obsidian API (`requestUrl`, `vault.adapter`, `vault.create`), Firecrawl REST API v1, `DOMParser` (available in Electron/Chromium), esbuild

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/settings.ts` | **Rewrite** | New settings shape (remove python paths, add firecrawlApiKey) — do this first so douban.ts compiles |
| `src/cache.ts` | **Create** | Read/write `cache.json` via vault adapter |
| `src/notes.ts` | **Create** | Pure renderers: book/movie metadata → markdown string |
| `src/douban.ts` | **Create** | All Douban HTTP: search, ISBN, book/movie detail fetch |
| `src/main.ts` | **Rewrite** | Wire commands to douban.ts/notes.ts; remove exec() |
| `src/modal.ts` | **Unchanged** | `Candidate` interface stays here; douban.ts imports it |

---

## Task 0: Create feature branch

**Files:** none

- [ ] **Step 1: Create and switch to feature branch**

```bash
cd "J:\Notes Library\Scripts"
git checkout -b feat/typescript-rewrite
```

Expected: `Switched to a new branch 'feat/typescript-rewrite'`

- [ ] **Step 2: Verify clean state**

```bash
git status
```

Expected: working tree clean (only `M .gitignore`, `M README.md` etc. from before — no staged changes)

---

## Task 1: `src/settings.ts` — new settings shape

**Files:**
- Modify: `src/settings.ts`

Do this **first** so `douban.ts` (Task 4) can import `DoubanSettings` with the correct fields.

Remove `pythonPath`, `backendDir`, `envPath`. Add `firecrawlApiKey`, `inboxDir`, `bookDir`, `watchDir`, `requestDelay`.

- [ ] **Step 1: Replace `src/settings.ts` entirely**

```typescript
import { App, PluginSettingTab, Setting } from 'obsidian';
import type DoubanPlugin from './main';

export interface DoubanSettings {
    firecrawlApiKey: string;
    inboxDir: string;
    bookDir: string;
    watchDir: string;
    requestDelay: number;
}

export const DEFAULT_SETTINGS: DoubanSettings = {
    firecrawlApiKey: '',
    inboxDir: 'inbox',
    bookDir: 'ReadNotes',
    watchDir: 'WatchNotes',
    requestDelay: 2,
};

export class DoubanSettingTab extends PluginSettingTab {
    plugin: DoubanPlugin;

    constructor(app: App, plugin: DoubanPlugin) {
        super(app);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        new Setting(containerEl)
            .setName('Firecrawl API key')
            .setDesc('Get a free key at firecrawl.dev/app/api-keys. Used to fetch book and movie detail pages.')
            .addText(text =>
                text
                    .setPlaceholder('fc-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx')
                    .setValue(this.plugin.settings.firecrawlApiKey)
                    .onChange(async value => {
                        this.plugin.settings.firecrawlApiKey = value.trim();
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName('Inbox folder')
            .setDesc('Vault subfolder where new notes are created. Must exist in your vault.')
            .addText(text =>
                text
                    .setPlaceholder('inbox')
                    .setValue(this.plugin.settings.inboxDir)
                    .onChange(async value => {
                        this.plugin.settings.inboxDir = value.trim() || 'inbox';
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName('Request delay (seconds)')
            .setDesc('Seconds to wait between Douban requests. Increase if you hit rate limits.')
            .addSlider(slider =>
                slider
                    .setLimits(0, 10, 1)
                    .setValue(this.plugin.settings.requestDelay)
                    .setDynamicTooltip()
                    .onChange(async value => {
                        this.plugin.settings.requestDelay = value;
                        await this.plugin.saveSettings();
                    })
            );
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/settings.ts
git commit -m "feat: replace Python-path settings with firecrawlApiKey + inboxDir"
```

---

## Task 2: `src/cache.ts` — vault-backed JSON cache


**Files:**
- Create: `src/cache.ts`

The cache lives at `.obsidian/plugins/douban-obsidian/cache.json`. Keys are `book_<id>` / `movie_<id>`.

- [ ] **Step 1: Create `src/cache.ts`**

```typescript
import { Vault, normalizePath } from 'obsidian';

const CACHE_PATH = normalizePath('.obsidian/plugins/douban-obsidian/cache.json');

export type Cache = Record<string, unknown>;

export async function loadCache(vault: Vault): Promise<Cache> {
    try {
        const raw = await vault.adapter.read(CACHE_PATH);
        return JSON.parse(raw) as Cache;
    } catch {
        return {};
    }
}

export async function saveCache(vault: Vault, cache: Cache): Promise<void> {
    try {
        await vault.adapter.write(CACHE_PATH, JSON.stringify(cache, null, 2));
    } catch (e) {
        console.warn('douban-obsidian: failed to write cache:', e);
    }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "J:\Notes Library\Scripts"
npx tsc --noEmit --skipLibCheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/cache.ts
git commit -m "feat: add vault-backed cache module"
```

---

## Task 3: `src/notes.ts` — pure note renderers

**Files:**
- Create: `src/notes.ts`

Direct port of `backend/notes.py`. No I/O — takes metadata, returns a markdown string.

- [ ] **Step 1: Create `src/notes.ts`**

```typescript
export interface BookMetadata {
    doubanId: string;
    title: string;
    subTitle: string;
    originalTitle: string;
    series: string;
    type: 'book';
    author: string[];
    score: string;
    datePublished: string;
    translator: string[];
    publisher: string;
    producer: string;
    isbn: string;
    url: string;
    totalPage: string;
    price: string;
}

export interface MovieMetadata {
    doubanId: string;
    title: string;
    type: 'movie' | 'teleplay';
    originalTitle: string;
    genre: string[];
    datePublished: string;
    director: string[];
    score: string;
    url: string;
    country: string[];
    IMDb: string;
    time: string;
}

export function yamlValue(value: string | number | null | undefined, forceQuote = false): string {
    if (value === null || value === undefined || value === '') return '';
    const s = String(value);
    if (forceQuote) return `"${s}"`;
    if (
        /^[{['"\&*!|>%@`]/.test(s) ||
        s.startsWith('- ') ||
        s.startsWith('? ') ||
        /[#\[\]{}]|: /.test(s)
    ) {
        return `"${s}"`;
    }
    return s;
}

export function yamlList(items: string[]): string {
    if (!items.length) return '';
    return '\n' + items.map(i => `  - ${i}`).join('\n');
}

export function renderBookNote(meta: BookMetadata): string {
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const year = new Date().getFullYear();
    const lines: string[] = [];

    lines.push('---');
    lines.push(`title: ${yamlValue(meta.title)}`);
    lines.push('type: book');
    lines.push(meta.author.length ? `author: ${yamlList(meta.author)}` : 'author: ');
    if (meta.series) lines.push(`series: ${yamlValue(meta.series)}`);
    lines.push(`score: ${yamlValue(meta.score)}`);
    lines.push(`datePublished: ${yamlValue(meta.datePublished)}`);
    lines.push(`publisher: ${yamlValue(meta.publisher)}`);
    if (meta.translator.length) lines.push(`translator: ${yamlList(meta.translator)}`);
    lines.push(`isbn: ${yamlValue(meta.isbn)}`);
    lines.push(`url: ${yamlValue(meta.url)}`);
    lines.push(`createTime: ${now}`);
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push('## 标签');
    lines.push('');
    lines.push(`#read/${year} #to-do`);
    lines.push('');
    lines.push('## 读后感');
    lines.push('');
    lines.push('');
    lines.push('');
    lines.push('## 摘录');
    lines.push('');

    return lines.join('\n') + '\n';
}

export function renderMovieNote(meta: MovieMetadata): string {
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const year = new Date().getFullYear();
    const lines: string[] = [];

    lines.push('---');
    lines.push(`title: ${yamlValue(meta.title)}`);
    lines.push(`type: ${meta.type}`);
    if (meta.originalTitle && meta.originalTitle !== meta.title)
        lines.push(`originalTitle: ${yamlValue(meta.originalTitle)}`);
    lines.push(meta.genre.length ? `genre:${yamlList(meta.genre)}` : 'genre:');
    lines.push(`datePublished: ${yamlValue(meta.datePublished)}`);
    lines.push(meta.director.length ? `director:${yamlList(meta.director)}` : 'director:');
    lines.push(`score: ${yamlValue(meta.score)}`);
    lines.push(`url: ${yamlValue(meta.url)}`);
    lines.push(meta.country.length ? `country:${yamlList(meta.country)}` : 'country:');
    if (meta.IMDb) lines.push(`IMDb: ${yamlValue(meta.IMDb)}`);
    lines.push(`time: ${yamlValue(meta.time)}`);
    lines.push(`createTime: ${now}`);
    lines.push('---');
    lines.push('');

    const tags = [`#watch/${year}`];
    meta.genre.forEach(g => tags.push(`#${g}`));
    if (meta.type === 'teleplay') tags.push('#tv');
    tags.push('#to-do');

    lines.push('## 标签');
    lines.push('');
    lines.push(tags.join(' '));
    lines.push('');
    lines.push('## 观后感');
    lines.push('');
    lines.push('');

    return lines.join('\n') + '\n';
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit --skipLibCheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/notes.ts
git commit -m "feat: add TypeScript note renderers (port of notes.py)"
```

---

## Task 4: `src/douban.ts` — Douban API + Firecrawl + fallback

**Files:**
- Create: `src/douban.ts`

This is the largest module. Port of `backend/douban.py`. Structure:
1. Helper utilities (normalizeAuthor, normalizeDate, splitTitleOriginal, DOM helpers, sleep)
2. Firecrawl HTTP wrapper
3. `searchDouban` — suggest API
4. `searchByIsbn` — redirect + DOM parse
5. `fetchBookDetail` — cache → Firecrawl → direct fallback
6. `fetchMovieDetail` — cache → abstract API → Firecrawl supplement → direct fallback

- [ ] **Step 1: Create `src/douban.ts` — utilities and schemas**

```typescript
import { Vault, requestUrl } from 'obsidian';
import { BookMetadata, MovieMetadata } from './notes';
import { loadCache, saveCache } from './cache';
import { DoubanSettings } from './settings';

export type { BookMetadata, MovieMetadata };

// `Candidate` is defined in modal.ts and re-exported from here so callers
// can import everything Douban-related from a single module.
export type { Candidate } from './modal';

// ── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const FIRECRAWL_SCRAPE = 'https://api.firecrawl.dev/v1/scrape';

const BOOK_SCHEMA = {
    type: 'object',
    properties: {
        title: { type: 'string', description: 'The title of the book' },
        subTitle: { type: 'string', description: 'The sub-title of the book' },
        originalTitle: { type: 'string', description: 'The original title of the book' },
        series: { type: 'string', description: 'The series the book belongs to' },
        author: { type: 'array', items: { type: 'string' }, description: 'List of authors' },
        score: { type: 'string', description: 'Douban rating score' },
        datePublished: { type: 'string', description: 'Publication date' },
        translator: { type: 'array', items: { type: 'string' }, description: 'List of translators' },
        publisher: { type: 'string', description: 'The publisher' },
        producer: { type: 'string', description: 'The producer/publishing house' },
        isbn: { type: 'string', description: 'The ISBN-10 or ISBN-13' },
        totalPage: { type: 'string', description: 'Total number of pages' },
        price: { type: 'string', description: 'The price of the book' },
    },
    required: ['title'],
};

const MOVIE_SCHEMA = {
    type: 'object',
    properties: {
        title: { type: 'string', description: 'The Chinese title of the movie' },
        originalTitle: { type: 'string', description: 'The original title of the movie' },
        genre: { type: 'array', items: { type: 'string' }, description: 'Genres' },
        datePublished: { type: 'string', description: 'Release date' },
        director: { type: 'array', items: { type: 'string' }, description: 'Directors' },
        score: { type: 'string', description: 'Douban rating score' },
        country: { type: 'array', items: { type: 'string' }, description: 'Countries/Regions of origin' },
        IMDb: { type: 'string', description: 'IMDb ID' },
        time: { type: 'string', description: 'Duration/Runtime' },
    },
    required: ['title'],
};

// ── Utilities ──────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export function normalizeAuthor(name: string): string {
    const m = name.trim().match(/^\[(.+?)\]\s*(.+)/);
    if (m) return `${m[1]}/${m[2]}`;
    return name.trim();
}

export function normalizeDate(dateStr: string): string {
    if (!dateStr) return '';
    const s = dateStr.trim();
    let m = s.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/);
    if (m) {
        return `${m[1]}-${m[2].padStart(2, '0')}-${(m[3] || '1').padStart(2, '0')}`;
    }
    m = s.match(/^(\d{4})年(\d{1,2})月(?:(\d{1,2})日)?/);
    if (m) {
        return `${m[1]}-${m[2].padStart(2, '0')}-${(m[3] || '1').padStart(2, '0')}`;
    }
    return s;
}

export function splitTitleOriginal(fullTitle: string): [string, string] {
    const cleaned = fullTitle.replace(/\s*\u200e?\s*\(\d{4}\)\s*$/, '').trim();
    const m = cleaned.match(
        /^([\u4e00-\u9fff\u3000-\u303f\uff00-\uffef\u00b7\uff1a\u201c\u201d\u2018\u2019\uff01\uff1f\u3001\u2014\u2026]+)\s+(.+)$/
    );
    if (m) return [m[1].trim(), m[2].trim()];
    return [cleaned, ''];
}

function getInfoText(infoEl: Element | null, label: string): string {
    if (!infoEl) return '';
    const spans = infoEl.querySelectorAll('span.pl');
    for (const span of spans) {
        if (span.textContent?.trim() === label) {
            let node = span.nextSibling;
            while (node) {
                if (node.nodeType === Node.TEXT_NODE) {
                    const text = node.textContent?.trim();
                    if (text) return text;
                } else {
                    const el = node as Element;
                    if (el.tagName === 'A') return el.textContent?.trim() || '';
                    if (el.tagName === 'BR') break;
                }
                node = node.nextSibling;
            }
        }
    }
    return '';
}

function getInfoLinks(infoEl: Element | null, label: string): string[] {
    if (!infoEl) return [];
    const spans = infoEl.querySelectorAll('span.pl');
    for (const span of spans) {
        if (span.textContent?.trim() === label) {
            const results: string[] = [];
            let node = span.nextSibling;
            while (node) {
                const el = node as Element;
                if (el.tagName === 'A') {
                    const text = el.textContent?.trim();
                    if (text) results.push(text);
                } else if (el.tagName === 'BR') {
                    break;
                } else if (el.classList?.contains('pl')) {
                    break;
                }
                node = node.nextSibling;
            }
            return results;
        }
    }
    return [];
}
```

- [ ] **Step 2: Add Firecrawl wrapper + search functions to `src/douban.ts`**

Append to the file after the utilities:

```typescript
// ── Firecrawl ──────────────────────────────────────────────────────────────

interface FirecrawlData {
    html?: string;
    extract?: Record<string, unknown>;
}

async function firecrawlScrape(
    url: string,
    apiKey: string,
    schema?: object
): Promise<FirecrawlData> {
    const body: Record<string, unknown> = { url };
    if (schema) {
        body.formats = ['extract'];
        body.extract = { schema, prompt: 'Extract the details according to the schema' };
    } else {
        body.formats = ['html'];
    }
    const resp = await requestUrl({
        url: FIRECRAWL_SCRAPE,
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        throw: false,
    });
    if (resp.status !== 200) throw new Error(`Firecrawl HTTP ${resp.status}`);
    return (resp.json?.data as FirecrawlData) ?? {};
}

// ── Search ─────────────────────────────────────────────────────────────────

export async function searchDouban(query: string, mediaType?: string): Promise<Candidate[]> {
    const endpoints: Array<[string, string]> =
        mediaType === 'book'
            ? [['https://book.douban.com/j/subject_suggest', 'book']]
            : mediaType === 'movie' || mediaType === 'teleplay'
            ? [['https://movie.douban.com/j/subject_suggest', 'movie']]
            : [
                  ['https://book.douban.com/j/subject_suggest', 'book'],
                  ['https://movie.douban.com/j/subject_suggest', 'movie'],
              ];

    const results: Candidate[] = [];
    for (const [url, source] of endpoints) {
        try {
            const resp = await requestUrl({
                url: `${url}?q=${encodeURIComponent(query)}`,
                headers: { 'User-Agent': DEFAULT_UA },
            });
            for (const item of resp.json as Record<string, unknown>[]) {
                const rawType = String(item.type ?? '');
                const itemType =
                    rawType === 'b'
                        ? 'book'
                        : ['movie', 'teleplay', 'tv'].includes(rawType)
                        ? rawType
                        : source;
                if (mediaType && itemType !== mediaType) continue;
                results.push({
                    id: String(item.id ?? ''),
                    title: String(item.title ?? ''),
                    sub_title: String(item.sub_title ?? item.author_name ?? ''),
                    type: itemType,
                    year: String(item.year ?? ''),
                });
            }
        } catch {
            // try next endpoint
        }
    }
    return results;
}

export async function searchByIsbn(isbn: string): Promise<Candidate | null> {
    try {
        const resp = await requestUrl({
            url: `https://book.douban.com/isbn/${isbn}/`,
            headers: { 'User-Agent': DEFAULT_UA },
            throw: false,
        });
        if (resp.status >= 400) return null;
        const doc = new DOMParser().parseFromString(resp.text, 'text/html');

        // Try canonical link or og:url to extract subject ID
        const canonical =
            doc.querySelector('link[rel="canonical"]')?.getAttribute('href') ??
            doc.querySelector('meta[property="og:url"]')?.getAttribute('content') ??
            '';
        const idMatch = canonical.match(/\/subject\/(\d+)\//);
        if (!idMatch) return null;

        const title = doc.querySelector('h1 span')?.textContent?.trim() ?? '';
        return { id: idMatch[1], title, sub_title: '', type: 'book', year: '' };
    } catch {
        return null;
    }
}
```

- [ ] **Step 3: Add `fetchBookDetail` to `src/douban.ts`**

Append to the file:

```typescript
// ── Book detail ────────────────────────────────────────────────────────────

function parseBookHtml(html: string, id: string, url: string): BookMetadata {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const infoEl = doc.querySelector('#info');
    return {
        doubanId: id,
        type: 'book',
        title: doc.querySelector('h1 span')?.textContent?.trim() ?? '',
        subTitle: getInfoText(infoEl, '副标题:'),
        originalTitle: getInfoText(infoEl, '原作名:'),
        series: getInfoText(infoEl, '丛书:'),
        author: getInfoLinks(infoEl, '作者').map(normalizeAuthor),
        score: doc.querySelector('strong.rating_num')?.textContent?.trim() ?? '',
        datePublished: normalizeDate(getInfoText(infoEl, '出版年:')),
        translator: getInfoLinks(infoEl, '译者'),
        publisher: getInfoText(infoEl, '出版社:'),
        producer: getInfoText(infoEl, '出品方:'),
        isbn: getInfoText(infoEl, 'ISBN:'),
        totalPage: getInfoText(infoEl, '页数:'),
        price: getInfoText(infoEl, '定价:'),
        url,
    };
}

function mapBookExtract(extract: Record<string, unknown>, id: string, url: string): BookMetadata {
    return {
        doubanId: id,
        type: 'book',
        title: String(extract.title ?? ''),
        subTitle: String(extract.subTitle ?? ''),
        originalTitle: String(extract.originalTitle ?? ''),
        series: String(extract.series ?? ''),
        author: ((extract.author as string[]) ?? []).map(normalizeAuthor),
        score: String(extract.score ?? ''),
        datePublished: normalizeDate(String(extract.datePublished ?? '')),
        translator: (extract.translator as string[]) ?? [],
        publisher: String(extract.publisher ?? ''),
        producer: String(extract.producer ?? ''),
        isbn: String(extract.isbn ?? ''),
        totalPage: String(extract.totalPage ?? ''),
        price: String(extract.price ?? ''),
        url,
    };
}

export async function fetchBookDetail(
    id: string,
    settings: DoubanSettings,
    vault: Vault
): Promise<BookMetadata | null> {
    const cache = await loadCache(vault);
    const cacheKey = `book_${id}`;
    if (cache[cacheKey]) return cache[cacheKey] as BookMetadata;

    await sleep(settings.requestDelay * 1000);
    const url = `https://book.douban.com/subject/${id}/`;
    let result: BookMetadata | null = null;

    // Primary: Firecrawl structured extraction
    if (settings.firecrawlApiKey) {
        try {
            const fc = await firecrawlScrape(url, settings.firecrawlApiKey, BOOK_SCHEMA);
            if (fc.extract?.title) {
                result = mapBookExtract(fc.extract, id, url);
            } else if (fc.html) {
                result = parseBookHtml(fc.html, id, url);
            }
        } catch (e) {
            console.warn(`douban-obsidian: Firecrawl failed for book ${id}:`, e);
        }
    }

    // Fallback: direct requestUrl + DOMParser
    if (!result) {
        try {
            const resp = await requestUrl({
                url,
                headers: { 'User-Agent': DEFAULT_UA },
                throw: false,
            });
            if (resp.status === 200) result = parseBookHtml(resp.text, id, url);
        } catch (e) {
            console.warn(`douban-obsidian: direct fetch failed for book ${id}:`, e);
        }
    }

    if (!result) return null;
    cache[cacheKey] = result;
    await saveCache(vault, cache);
    return result;
}
```

- [ ] **Step 4: Add `fetchMovieDetail` to `src/douban.ts`**

Append to the file:

```typescript
// ── Movie detail ───────────────────────────────────────────────────────────

export async function fetchMovieDetail(
    id: string,
    typeOverride: string | undefined,
    settings: DoubanSettings,
    vault: Vault
): Promise<MovieMetadata | null> {
    const cache = await loadCache(vault);
    const cacheKey = `movie_${id}`;
    if (cache[cacheKey]) {
        const cached = cache[cacheKey] as MovieMetadata;
        if (typeOverride) cached.type = typeOverride as 'movie' | 'teleplay';
        return cached;
    }

    await sleep(settings.requestDelay * 1000);
    const url = `https://movie.douban.com/subject/${id}/`;
    const headers = { 'User-Agent': DEFAULT_UA, 'Referer': 'https://movie.douban.com/' };

    // Primary basic data: subject_abstract JSON API (no auth needed)
    let result: MovieMetadata | null = null;
    try {
        const resp = await requestUrl({
            url: `https://movie.douban.com/j/subject_abstract?subject_id=${id}`,
            headers,
        });
        const data = resp.json?.subject as Record<string, unknown>;
        if (data) {
            const [title, originalTitle] = splitTitleOriginal(String(data.title ?? ''));
            const isTV = data.is_tv || data.episodes_count;
            result = {
                doubanId: id,
                title,
                type: isTV ? 'teleplay' : 'movie',
                originalTitle,
                genre: (data.types as string[]) ?? [],
                datePublished: String(data.release_year ?? ''),
                director: (data.directors as string[]) ?? [],
                score: String((data.rating as Record<string, unknown>)?.value ?? ''),
                url,
                country: String(data.region ?? '')
                    .split('/')
                    .map(s => s.trim())
                    .filter(Boolean),
                IMDb: '',
                time: String(data.duration ?? ''),
            };
        }
    } catch (e) {
        console.warn(`douban-obsidian: failed to fetch movie abstract for ${id}:`, e);
        return null;
    }

    if (!result) return null;

    // Supplement: Firecrawl for IMDb, full date, better countries
    await sleep(settings.requestDelay * 1000);
    if (settings.firecrawlApiKey) {
        try {
            const fc = await firecrawlScrape(url, settings.firecrawlApiKey, MOVIE_SCHEMA);
            if (fc.extract?.title) {
                const ex = fc.extract;
                if (ex.originalTitle) result.originalTitle = String(ex.originalTitle);
                if (ex.genre) result.genre = ex.genre as string[];
                if (ex.datePublished) result.datePublished = String(ex.datePublished);
                if (ex.director) result.director = ex.director as string[];
                if (ex.score) result.score = String(ex.score);
                if (ex.country) result.country = ex.country as string[];
                if (ex.IMDb) result.IMDb = String(ex.IMDb);
                if (ex.time) result.time = String(ex.time);
            }
        } catch (e) {
            console.warn(`douban-obsidian: Firecrawl failed for movie ${id}:`, e);
        }
    }

    // Fallback supplement: direct HTML for IMDb and release date
    if (!result.IMDb) {
        try {
            const resp = await requestUrl({ url, headers, throw: false });
            if (resp.status === 200) {
                const doc = new DOMParser().parseFromString(resp.text, 'text/html');
                const infoEl = doc.querySelector('#info');
                if (infoEl) {
                    const imdb = getInfoText(infoEl, 'IMDb:');
                    if (imdb) result.IMDb = imdb;

                    const dateTags = doc.querySelectorAll('span[property="v:initialReleaseDate"]');
                    if (dateTags.length) {
                        const dateMatch = dateTags[0].textContent?.match(/(\d{4}-\d{2}-\d{2})/);
                        if (dateMatch) result.datePublished = dateMatch[1];
                    }

                    const countryText = getInfoText(infoEl, '制片国家/地区:');
                    if (countryText)
                        result.country = countryText.split('/').map(s => s.trim()).filter(Boolean);
                }
            }
        } catch (e) {
            console.warn(`douban-obsidian: direct fetch supplement failed for movie ${id}:`, e);
        }
    }

    if (typeOverride) result.type = typeOverride as 'movie' | 'teleplay';
    cache[cacheKey] = result;
    await saveCache(vault, cache);
    return result;
}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit --skipLibCheck
```

Expected: no errors. If `requestUrl` `throw` property causes an error, it may not be in the type definition — remove `throw: false` from those calls and rely on try/catch instead.

- [ ] **Step 6: Commit**

```bash
git add src/douban.ts
git commit -m "feat: add TypeScript Douban API module (port of douban.py)"
```

---

## Task 5: `src/main.ts` — wire everything together

**Files:**
- Modify: `src/main.ts`

Remove `exec()`, `child_process`, stdout parsing. Replace `runBackend()` with an async function that calls `douban.ts` and `notes.ts` directly.

- [ ] **Step 1: Replace `src/main.ts` entirely**

```typescript
import { Plugin, Notice, normalizePath } from 'obsidian';
import { DoubanSettings, DEFAULT_SETTINGS, DoubanSettingTab } from './settings';
import { DoubanModal, DisambiguationModal } from './modal';
import { searchDouban, searchByIsbn, fetchBookDetail, fetchMovieDetail } from './douban';
import { renderBookNote, renderMovieNote } from './notes';

interface RunOptions {
    isbn?: string;
    id?: string;
    mediaType?: string;
}

function sanitizeFilename(name: string): string {
    return name.replace(/[<>:"/\\|?*]/g, '').trim();
}

export default class DoubanPlugin extends Plugin {
    settings: DoubanSettings;

    async onload(): Promise<void> {
        await this.loadSettings();
        this.addSettingTab(new DoubanSettingTab(this.app, this));

        this.addCommand({
            id: 'add-book',
            name: 'Add Book Note',
            callback: () => {
                new DoubanModal(this.app, 'book', (_type, title) => {
                    this.runBackend('book', title);
                }).open();
            },
        });

        this.addCommand({
            id: 'add-movie',
            name: 'Add Movie Note',
            callback: () => {
                new DoubanModal(this.app, 'movie', (type, title) => {
                    this.runBackend('movie', title, type === 'teleplay' ? { mediaType: 'teleplay' } : {});
                }).open();
            },
        });

        this.addCommand({
            id: 'add-note',
            name: 'Add Book or Movie Note',
            callback: () => {
                new DoubanModal(this.app, 'both', (type, title) => {
                    if (type === 'book') {
                        this.runBackend('book', title);
                    } else {
                        this.runBackend('movie', title, type === 'teleplay' ? { mediaType: 'teleplay' } : {});
                    }
                }).open();
            },
        });

        this.addCommand({
            id: 'add-by-isbn',
            name: 'Add Book Note by ISBN',
            callback: () => {
                new DoubanModal(this.app, 'isbn', (_type, isbn) => {
                    this.runBackend('book', '', { isbn });
                }).open();
            },
        });
    }

    private async runBackend(type: 'book' | 'movie', title: string, options: RunOptions = {}): Promise<void> {
        const notice = new Notice('Fetching from Douban...', 0);

        try {
            // ── Resolve candidate ──────────────────────────────────────────
            let candidateId: string;
            let candidateType: string | undefined = options.mediaType;

            if (options.id) {
                candidateId = options.id;
            } else if (options.isbn) {
                const found = await searchByIsbn(options.isbn);
                if (!found) {
                    notice.hide();
                    new Notice('ISBN not found on Douban.', 6000);
                    return;
                }
                candidateId = found.id;
                if (!title) title = found.title;
            } else {
                const mediaType = type === 'book' ? 'book' : (options.mediaType || undefined);
                const results = await searchDouban(title, mediaType);
                if (!results.length) {
                    notice.hide();
                    new Notice(`No results found for "${title}"`, 6000);
                    return;
                }
                if (results.length === 1) {
                    candidateId = results[0].id;
                    candidateType = results[0].type === 'teleplay' ? 'teleplay' : options.mediaType;
                } else {
                    // Multiple results: show disambiguation modal
                    notice.hide();
                    new DisambiguationModal(this.app, results, selected => {
                        const resolvedType =
                            selected.type === 'teleplay' ? 'teleplay' : options.mediaType;
                        this.runBackend(type, title, { id: selected.id, mediaType: resolvedType });
                    }).open();
                    return;
                }
            }

            // ── Fetch detail + render ──────────────────────────────────────
            let content: string;
            let noteTitle: string;

            if (type === 'book') {
                const meta = await fetchBookDetail(candidateId, this.settings, this.app.vault);
                if (!meta) {
                    notice.hide();
                    new Notice('Failed to fetch book details. Check your Firecrawl key or network.', 8000);
                    return;
                }
                content = renderBookNote(meta);
                noteTitle = meta.title || title;
            } else {
                const meta = await fetchMovieDetail(candidateId, candidateType, this.settings, this.app.vault);
                if (!meta) {
                    notice.hide();
                    new Notice('Failed to fetch movie details. Check your network.', 8000);
                    return;
                }
                content = renderMovieNote(meta);
                noteTitle = meta.title || title;
            }

            // ── Write note ────────────────────────────────────────────────
            const filename = sanitizeFilename(noteTitle) + '.md';
            const filePath = normalizePath(`${this.settings.inboxDir}/${filename}`);

            try {
                await this.app.vault.create(filePath, content);
            } catch {
                notice.hide();
                new Notice(`Note already exists: ${filename}`, 6000);
                return;
            }

            notice.hide();
            new Notice(`Note created: ${filename}`, 4000);
            this.app.workspace.openLinkText(filename, '', true).catch(() => {});

        } catch (e) {
            notice.hide();
            new Notice(`Error: ${e instanceof Error ? e.message : String(e)}`, 8000);
        }
    }

    async loadSettings(): Promise<void> {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings(): Promise<void> {
        await this.saveData(this.settings);
    }
}
```

- [ ] **Step 2: Verify TypeScript compiles cleanly**

```bash
npx tsc --noEmit --skipLibCheck
```

Expected: **no errors**.

- [ ] **Step 3: Build the plugin**

```bash
npm run build
```

Expected: `main.js` written to repo root, no build errors.

- [ ] **Step 4: Commit**

```bash
git add src/main.ts
git commit -m "feat: replace exec()-based backend with native TypeScript implementation"
```

---

## Task 6: Install into Obsidian and manual end-to-end test

**Files:** none (copy built files to vault)

- [ ] **Step 1: Copy built files to Obsidian plugins folder**

```bash
cp main.js "J:\Notes Library\.obsidian\plugins\douban-obsidian\main.js"
cp manifest.json "J:\Notes Library\.obsidian\plugins\douban-obsidian\manifest.json"
```

- [ ] **Step 2: Reload plugin in Obsidian**

In Obsidian: Settings → Community plugins → find "Douban Notes" → toggle off → toggle on (or use the reload button if BRAT is installed).

- [ ] **Step 3: Configure the plugin**

Settings → Douban Notes:
- Firecrawl API key: enter your key from `.env`
- Inbox folder: `inbox`
- Request delay: `2`

- [ ] **Step 4: Test — book by title**

Open command palette (`Ctrl+P`) → "Add Book Note" → type `百年孤独` → press Enter.

Expected: disambiguation modal appears (or note created directly if only one result). Note appears in `inbox/百年孤独.md` with correct YAML frontmatter.

- [ ] **Step 5: Test — book by ISBN**

Command palette → "Add Book Note by ISBN" → type `9787544253994`.

Expected: note created in `inbox/` with correct title, author, publisher.

- [ ] **Step 6: Test — movie**

Command palette → "Add Movie Note" → type `盗梦空间` → click "Movie".

Expected: note created with genre, director, IMDb, score fields populated.

- [ ] **Step 7: Test — teleplay**

Command palette → "Add Movie Note" → type `3年A班` → click "Teleplay".

Expected: note created with `type: teleplay` and `#tv` tag.

- [ ] **Step 8: Test — disambiguation**

Command palette → "Add Book or Movie Note" → type a common term like `三体`.

Expected: disambiguation modal appears with multiple options; selecting one creates the note.

- [ ] **Step 9: Test — no Firecrawl key (fallback path)**

Temporarily clear the Firecrawl API key in settings. Add a book note.

Expected: note still created using the direct `requestUrl` fallback (fields may be less complete if Douban blocks, but no crash).

- [ ] **Step 10: Commit test results note (optional)**

If all tests pass, document in a commit message.

```bash
git commit --allow-empty -m "test: manual e2e verification complete — all commands working"
```

---

## Task 7: Update README.md and CLAUDE.md

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md`

Per the documentation rule in CLAUDE.md: any change affecting architecture, CLI interface, dependencies, or scraping strategy must update both files.

- [ ] **Step 1: Update README.md Setup section**

Replace the "Prerequisites" and "Setup" sections with:

```markdown
## Prerequisites

- **Obsidian desktop** (the plugin is desktop-only)
- **Firecrawl API key** — free tier at https://www.firecrawl.dev/ (used to fetch book/movie detail pages)

No Python required.

---

## Setup

### 1. Install the plugin

**Option A — Build from source:**

```bash
npm install
npm run build
```

Copy `main.js`, `manifest.json`, `styles.css` to `.obsidian/plugins/douban-obsidian/` in your vault.

**Option B — BRAT (once released):**

Install BRAT → Add Beta Plugin → `https://github.com/nxsyy55/douban-notes-obs`

### 2. Configure the plugin

Settings → Douban Notes:

| Setting | What to enter |
|---------|---------------|
| **Firecrawl API key** | From https://www.firecrawl.dev/app/api-keys |
| **Inbox folder** | Vault subfolder for new notes (default: `inbox`) |
| **Request delay** | Seconds between requests (default: 2) |

> Make sure the inbox folder exists in your vault before running.
```

- [ ] **Step 2: Update CLAUDE.md Architecture section**

Update the Architecture section to reflect the new TypeScript modules:

```markdown
## Architecture

Four TypeScript modules in `src/`:

- `src/main.ts` — Plugin entry point: commands, wires search → disambiguation → fetch → write
- `src/settings.ts` — Settings tab: `firecrawlApiKey`, `inboxDir`, `requestDelay`
- `src/modal.ts` — Search input modal + disambiguation list modal (unchanged)
- `src/douban.ts` — All Douban HTTP: `searchDouban`, `searchByIsbn`, `fetchBookDetail`, `fetchMovieDetail`
- `src/notes.ts` — Pure renderers: `renderBookNote`, `renderMovieNote` → markdown string
- `src/cache.ts` — Cache read/write via vault adapter (`book_<id>` / `movie_<id>` keys)

**Data flow:** Command → search Douban JSON API (`requestUrl`) → disambiguate → fetch detail (Firecrawl primary, `requestUrl`+`DOMParser` fallback) → render note → `vault.create(inboxDir/title.md)`

**Firecrawl integration:** `POST https://api.firecrawl.dev/v1/scrape` with `Authorization: Bearer <key>`. For books: structured extraction with `BOOK_SCHEMA`. For movies: supplement after `subject_abstract` API call. Fallback on any Firecrawl failure.

**Cache:** JSON file at `.obsidian/plugins/douban-obsidian/cache.json` via `vault.adapter`. Delete an entry to force re-fetch.

**Python backend** (`backend/`) is kept as a standalone CLI for power users. The plugin no longer depends on it.
```

- [ ] **Step 3: Commit**

```bash
git add README.md CLAUDE.md
git commit -m "docs: update README and CLAUDE.md for TypeScript rewrite"
```

---

## Task 8: Merge to master

- [ ] **Step 1: Verify branch is clean**

```bash
git status
git log --oneline master..HEAD
```

Expected: 6–8 commits ahead of master, working tree clean.

- [ ] **Step 2: Merge**

```bash
git checkout master
git merge feat/typescript-rewrite --no-ff -m "feat(v0.4): full TypeScript rewrite — no Python dependency"
```

- [ ] **Step 3: Delete feature branch**

```bash
git branch -d feat/typescript-rewrite
```
