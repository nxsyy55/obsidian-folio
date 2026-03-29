import { Vault, requestUrl } from 'obsidian';
import { BookMetadata, MovieMetadata } from './notes';
import { loadCache, saveCache } from './cache';
import { DoubanSettings } from './settings';
import type { Candidate } from './modal';

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

/**
 * Safely coerce an unknown API value to string.
 * Unlike String(x ?? ''), this never produces "[object Object]".
 */
export function safeStr(val: unknown): string {
    if (typeof val === 'string') return val;
    if (typeof val === 'number') return String(val);
    return '';
}

function getInfoText(infoEl: Element | null, label: string): string {
    if (!infoEl) return '';
    const spans = Array.from(infoEl.querySelectorAll('span.pl'));
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
    const spans = Array.from(infoEl.querySelectorAll('span.pl'));
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
                    source: 'douban',
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
        return { id: idMatch[1], title, sub_title: '', type: 'book', year: '', source: 'douban' };
    } catch {
        return null;
    }
}

// ── Book detail ────────────────────────────────────────────────────────────

function parseBookHtml(html: string, id: string, url: string): BookMetadata {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const infoEl = doc.querySelector('#info');
    return {
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
        url,
    };
}

function mapBookExtract(extract: Record<string, unknown>, id: string, url: string): BookMetadata {
    return {
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
            console.warn(`folio: Firecrawl failed for book ${id}:`, e);
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
            console.warn(`folio: direct fetch failed for book ${id}:`, e);
        }
    }

    if (!result) return null;
    cache[cacheKey] = result;
    await saveCache(vault, cache);
    return result;
}

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
        console.warn(`folio: failed to fetch movie abstract for ${id}:`, e);
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
            console.warn(`folio: Firecrawl failed for movie ${id}:`, e);
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
            console.warn(`folio: direct fetch supplement failed for movie ${id}:`, e);
        }
    }

    if (typeOverride) result.type = typeOverride as 'movie' | 'teleplay';
    cache[cacheKey] = result;
    await saveCache(vault, cache);
    return result;
}
