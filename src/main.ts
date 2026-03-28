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
