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
