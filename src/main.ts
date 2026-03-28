import { Plugin, Notice, normalizePath } from 'obsidian';
import { DoubanSettings, DEFAULT_SETTINGS, DoubanSettingTab, FolioTemplate } from './settings';
import { DoubanModal, DisambiguationModal } from './modal';
import { searchDouban, searchByIsbn, fetchBookDetail, fetchMovieDetail } from './douban';
import { renderBookNote, renderMovieNote } from './notes';

interface RunOptions {
    isbn?: string;
    id?: string;
    category?: 'book' | 'movie';
    mediaType?: string;
    template?: FolioTemplate | null;
}

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
        const notice = new Notice('Fetching from Douban...', 0);

        try {
            let candidateId: string;
            let candidateCategory: 'book' | 'movie' = options.category ?? 'movie';
            let candidateMediaType: string | undefined = options.mediaType;

            if (options.id) {
                candidateId = options.id;
                if (options.category) candidateCategory = options.category;
            } else if (options.isbn) {
                const found = await searchByIsbn(options.isbn);
                if (!found) {
                    notice.hide();
                    new Notice('ISBN not found on Douban.', 6000);
                    return;
                }
                candidateId = found.id;
                candidateCategory = 'book';
                if (!title) title = found.title;
            } else {
                const results = await searchDouban(title);
                if (!results.length) {
                    notice.hide();
                    new Notice(`No results found for "${title}"`, 6000);
                    return;
                }
                if (results.length === 1) {
                    candidateId = results[0].id;
                    candidateCategory = results[0].type === 'book' ? 'book' : 'movie';
                    candidateMediaType = results[0].type === 'teleplay' ? 'teleplay' : undefined;
                } else {
                    notice.hide();
                    new DisambiguationModal(this.app, results, selected => {
                        this.runBackend(title, {
                            id: selected.id,
                            category: selected.type === 'book' ? 'book' : 'movie',
                            mediaType: selected.type === 'teleplay' ? 'teleplay' : undefined,
                            template: options.template,
                        });
                    }).open();
                    return;
                }
            }

            let content: string;
            let noteTitle: string;

            if (candidateCategory === 'book') {
                const meta = await fetchBookDetail(candidateId, this.settings, this.app.vault);
                if (!meta) {
                    notice.hide();
                    new Notice('Failed to fetch book details. Check your Firecrawl key or network.', 8000);
                    return;
                }
                content = renderBookNote(meta, options.template);
                noteTitle = meta.title || title;
            } else {
                const meta = await fetchMovieDetail(candidateId, candidateMediaType, this.settings, this.app.vault);
                if (!meta) {
                    notice.hide();
                    new Notice('Failed to fetch movie details. Check your network.', 8000);
                    return;
                }
                content = renderMovieNote(meta, options.template);
                noteTitle = meta.title || title;
            }

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
