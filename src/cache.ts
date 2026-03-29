import { Vault, normalizePath } from 'obsidian';

const cachePath = (vault: Vault) =>
    normalizePath(`${vault.configDir}/plugins/folio/cache.json`);

export type Cache = Record<string, unknown>;

export async function loadCache(vault: Vault): Promise<Cache> {
    try {
        const raw = await vault.adapter.read(cachePath(vault));
        return JSON.parse(raw) as Cache;
    } catch {
        return {};
    }
}

export async function saveCache(vault: Vault, cache: Cache): Promise<void> {
    try {
        await vault.adapter.write(cachePath(vault), JSON.stringify(cache, null, 2));
    } catch (e) {
        console.warn('folio: failed to write cache:', e);
    }
}
