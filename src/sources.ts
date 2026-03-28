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
            : rawCountry
            ? [String((rawCountry as Record<string, unknown>).name ?? '')]
            : [];

        const result: MovieMetadata = {
            title: String(ld.name ?? ''),
            type,
            originalTitle: '',
            genre: Array.isArray(ld.genre) ? (ld.genre as string[]) : ld.genre ? [String(ld.genre)] : [],
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
