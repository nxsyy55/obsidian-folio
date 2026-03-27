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
