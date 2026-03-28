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
