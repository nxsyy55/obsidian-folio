import { requestUrl, Vault } from 'obsidian';
import type { Candidate } from './modal';
import { BookMetadata, MovieMetadata } from './notes';
import { loadCache, saveCache } from './cache';
import { searchDouban, searchByIsbn, safeStr, firecrawlScrape } from './douban';

const DEFAULT_UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// ── Language detection ─────────────────────────────────────────────────────

export function detectLanguage(query: string): 'cjk' | 'latin' {
    return /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef\u3040-\u309f\u30a0-\u30bf]/.test(query) ? 'cjk' : 'latin';
}

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
                id: safeStr(item.id),
                title: safeStr(info.title),
                sub_title: authors.join(', '),
                type: 'book',
                year: safeStr(info.publishedDate).slice(0, 4),
                source: 'googlebooks' as const,
            };
        });
    } catch {
        return [];
    }
}

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
            title: safeStr(info.title),
            subTitle: safeStr(info.subtitle),
            originalTitle: '',
            series: '',
            author: (info.authors as string[]) ?? [],
            score: '',
            datePublished: safeStr(info.publishedDate).slice(0, 10),
            translator: [],
            publisher: safeStr(info.publisher),
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
            .filter(item => ['movie', 'tvSeries', 'tvMiniSeries'].includes(safeStr(item.qid)))
            .map(item => ({
                id: safeStr(item.id),
                title: safeStr(item.l),
                sub_title: safeStr(item.s),
                type: imdbQidToType(safeStr(item.qid)),
                year: safeStr(item.y),
                source: 'imdb' as const,
            }));
    } catch {
        return [];
    }
}

export async function fetchIMDBDetail(id: string, vault: Vault, firecrawlApiKey?: string): Promise<MovieMetadata | null> {
    const cache = await loadCache(vault);
    const cacheKey = `imdb_${id}`;
    if (cache[cacheKey]) return cache[cacheKey] as MovieMetadata;

    const url = `https://www.imdb.com/title/${id}/`;
    let html: string | null = null;

    // Primary: Firecrawl (bypasses IMDB bot detection)
    if (firecrawlApiKey) {
        try {
            const fc = await firecrawlScrape(url, firecrawlApiKey);
            html = fc.html ?? null;
        } catch (e) {
            console.warn(`folio: Firecrawl failed for IMDB ${id}:`, e);
        }
    }

    // Fallback: direct request
    if (!html) {
        try {
            const resp = await requestUrl({
                url,
                headers: { 'User-Agent': DEFAULT_UA, 'Accept-Language': 'en-US,en;q=0.9' },
                throw: false,
            });
            if (resp.status !== 200) return null;
            html = resp.text;
        } catch {
            return null;
        }
    }

    try {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const ldScript = doc.querySelector('script[type="application/ld+json"]');
        if (!ldScript?.textContent) return null;

        const ld = JSON.parse(ldScript.textContent) as Record<string, unknown>;

        const ldType = safeStr(ld['@type']);
        const type: 'movie' | 'teleplay' =
            ldType === 'TVSeries' || ldType === 'TVMiniSeries' ? 'teleplay' : 'movie';

        const rawDirector = ld.director;
        const directors: string[] = Array.isArray(rawDirector)
            ? (rawDirector as Record<string, unknown>[]).map(d => safeStr(d.name))
            : rawDirector
            ? [safeStr((rawDirector as Record<string, unknown>).name)]
            : [];

        const rawCountry = ld.countryOfOrigin;
        const countries: string[] = Array.isArray(rawCountry)
            ? (rawCountry as Record<string, unknown>[]).map(c => safeStr(c.name))
            : rawCountry
            ? [safeStr((rawCountry as Record<string, unknown>).name)]
            : [];

        const result: MovieMetadata = {
            title: safeStr(ld.name),
            type,
            originalTitle: '',
            genre: Array.isArray(ld.genre) ? (ld.genre as string[]) : ld.genre ? [safeStr(ld.genre)] : [],
            datePublished: safeStr(ld.datePublished),
            director: directors,
            score: safeStr((ld.aggregateRating as Record<string, unknown>)?.ratingValue),
            url: `https://www.imdb.com/title/${id}/`,
            country: countries,
            IMDb: id,
            time: ld.duration ? parseIso8601Duration(safeStr(ld.duration)) : '',
        };

        cache[cacheKey] = result;
        await saveCache(vault, cache);
        return result;
    } catch {
        return null;
    }
}

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
            const key = safeStr(doc.key);          // "/works/OL45804W"
            const id = key.replace('/works/', '');
            const authors = (doc.author_name as string[]) ?? [];
            return {
                id,
                title: safeStr(doc.title),
                sub_title: authors.join(', '),
                type: 'book',
                year: safeStr(doc.first_publish_year),
                source: 'openlibrary' as const,
            };
        });
    } catch {
        return [];
    }
}

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
        const authorEntries = Array.isArray(work.authors)
            ? (work.authors as { author?: { key?: string } }[])
            : [];
        const authorNames = await Promise.all(
            authorEntries.map(async entry => {
                try {
                    const key = entry?.author?.key;
                    if (!key) return '';
                    const ar = await requestUrl({
                        url: `https://openlibrary.org${key}.json`,
                        headers: { 'User-Agent': DEFAULT_UA },
                        throw: false,
                    });
                    return ar.status === 200 ? safeStr(ar.json?.name) : '';
                } catch {
                    return '';
                }
            })
        );

        const result: BookMetadata = {
            type: 'book',
            title: safeStr(work.title),
            subTitle: '',
            originalTitle: '',
            series: '',
            author: authorNames.filter(Boolean),
            score: '',
            datePublished: safeStr(work.first_publish_date).slice(0, 10),
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
        const key = safeStr(doc.key);
        const id = key.replace('/works/', '');
        if (!id) return null;
        const authors = (doc.author_name as string[]) ?? [];
        return {
            id,
            title: safeStr(doc.title),
            sub_title: authors.join(', '),
            type: 'book',
            year: safeStr(doc.first_publish_year),
            source: 'openlibrary' as const,
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
            id: safeStr(item.id),
            title: safeStr(info.title),
            sub_title: authors.join(', '),
            type: 'book',
            year: safeStr(info.publishedDate).slice(0, 4),
            source: 'googlebooks' as const,
        };
    } catch {
        return null;
    }
}

export async function searchByIsbnAll(isbn: string): Promise<Candidate | null> {
    const [douban, ol, gb] = await Promise.all([
        searchByIsbn(isbn),
        searchOpenLibraryByIsbn(isbn),
        searchGoogleBooksByIsbn(isbn),
    ]);
    return douban ?? ol ?? gb ?? null;
}

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

export async function searchWithSource(query: string, source: string): Promise<Candidate[]> {
    if (source === 'douban') return searchDouban(query);
    if (source === 'imdb') return searchIMDB(query);
    if (source === 'openlibrary') return searchOpenLibrary(query);
    if (source === 'googlebooks') return searchGoogleBooks(query);
    return searchAll(query);
}
