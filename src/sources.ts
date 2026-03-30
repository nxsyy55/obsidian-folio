import { requestUrl, Vault } from 'obsidian';
import type { Candidate } from './modal';
import { BookMetadata, MovieMetadata } from './notes';
import { loadCache, saveCache } from './cache';
import { searchDouban, searchByIsbn, safeStr } from './douban';

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

export async function fetchIMDBDetail(id: string, vault: Vault): Promise<MovieMetadata | null> {
    const cache = await loadCache(vault);
    const cacheKey = `imdb_${id}`;
    if (cache[cacheKey]) return cache[cacheKey] as MovieMetadata;

    // IMDB pages return HTTP 202 + empty body (AWS WAF JS challenge) — scraping is not possible.
    // Wikidata indexes IMDB IDs via wdt:P345 and provides structured film metadata.
    const sparql = `SELECT DISTINCT ?filmLabel ?dirLabel ?genLabel ?ctryLabel ?instanceLabel
  (STR(?date) AS ?dateStr) (STR(?dur) AS ?durStr)
WHERE {
  ?film wdt:P345 "${id}".
  ?film rdfs:label ?filmLabel. FILTER(LANG(?filmLabel) = "en")
  OPTIONAL { ?film wdt:P57 ?dir. ?dir rdfs:label ?dirLabel. FILTER(LANG(?dirLabel) = "en") }
  OPTIONAL { ?film wdt:P136 ?gen. ?gen rdfs:label ?genLabel. FILTER(LANG(?genLabel) = "en") }
  OPTIONAL { ?film wdt:P495 ?ctry. ?ctry rdfs:label ?ctryLabel. FILTER(LANG(?ctryLabel) = "en") }
  OPTIONAL { ?film wdt:P577 ?date. }
  OPTIONAL { ?film wdt:P2047 ?dur. }
  OPTIONAL { ?film wdt:P31 ?instance. ?instance rdfs:label ?instanceLabel. FILTER(LANG(?instanceLabel) = "en") }
}
LIMIT 100`;

    try {
        const resp = await requestUrl({
            url: `https://query.wikidata.org/sparql?query=${encodeURIComponent(sparql)}&format=json`,
            headers: { 'User-Agent': DEFAULT_UA, 'Accept': 'application/sparql-results+json' },
            throw: false,
        });
        if (resp.status !== 200) return null;

        type WDBinding = Record<string, { value: string } | undefined>;
        const bindings = (resp.json?.results?.bindings as WDBinding[]) ?? [];
        if (!bindings.length) return null;

        const uniq = (field: string): string[] =>
            [...new Set(bindings.map(b => b[field]?.value ?? '').filter(Boolean))];

        const instances = uniq('instanceLabel').map(s => s.toLowerCase());
        const isTV = instances.some(s =>
            s.includes('television series') || s.includes('miniseries') || s.includes('tv series')
        );
        const durMin = bindings[0].durStr?.value ?? '';

        const result: MovieMetadata = {
            title: bindings[0].filmLabel?.value ?? '',
            type: isTV ? 'teleplay' : 'movie',
            originalTitle: '',
            genre: uniq('genLabel'),
            datePublished: (bindings[0].dateStr?.value ?? '').slice(0, 10),
            director: uniq('dirLabel').slice(0, 5),
            score: '',
            url: `https://www.imdb.com/title/${id}/`,
            country: uniq('ctryLabel'),
            IMDb: id,
            time: durMin ? `${durMin} min` : '',
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
