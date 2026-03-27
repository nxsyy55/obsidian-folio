import { Plugin, Notice } from 'obsidian';
import { exec } from 'child_process';
import { DoubanSettings, DEFAULT_SETTINGS, DoubanSettingTab } from './settings';
import { DoubanModal, DisambiguationModal, Candidate } from './modal';

interface RunOptions {
    isbn?: string;
    id?: string;
    mediaType?: string;
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

    private runBackend(type: 'book' | 'movie', title: string, options: RunOptions = {}): void {
        const { pythonPath, backendDir, envPath } = this.settings;
        const vaultToolPath = `${backendDir}/vault_tool.py`;

        let cmd = `"${pythonPath}" "${vaultToolPath}" ${type}`;

        if (options.isbn) {
            cmd += ` --isbn "${options.isbn}"`;
        } else {
            if (title) cmd += ` "${title.replace(/"/g, '\\"')}"`;
            if (options.id) cmd += ` --id ${options.id}`;
        }

        if (options.mediaType) {
            cmd += ` --type ${options.mediaType}`;
        }

        const env = { ...process.env };
        if (envPath) env['ENV_FILE'] = envPath;

        const notice = new Notice('Fetching from Douban...', 0);

        exec(cmd, { cwd: backendDir, env }, (error, stdout, stderr) => {
            notice.hide();

            const lastLine = (s: string) =>
                s.trim().split('\n').filter(Boolean).pop() ?? '';

            if (error) {
                let msg = lastLine(stderr) || lastLine(stdout) || error.message;
                if (
                    error.message.includes('ENOENT') ||
                    msg.includes('not recognized') ||
                    msg.includes('No such file')
                ) {
                    msg = `Python not found at "${pythonPath}". Check plugin settings.`;
                }
                new Notice(`Error: ${msg}`, 8000);
                return;
            }

            // Disambiguation: multiple results returned as JSON
            const candidatesMatch = stdout.match(/CANDIDATES_JSON: (.+)/);
            if (candidatesMatch) {
                try {
                    const candidates: Candidate[] = JSON.parse(candidatesMatch[1].trim());
                    new DisambiguationModal(this.app, candidates, (candidate) => {
                        const resolvedMediaType =
                            candidate.type === 'teleplay' ? 'teleplay' : options.mediaType;
                        this.runBackend(type, title, { id: candidate.id, mediaType: resolvedMediaType });
                    }).open();
                } catch {
                    new Notice('Error parsing search results.', 6000);
                }
                return;
            }

            // Success
            const createdMatch = stdout.match(/Created: (.+)/);
            if (createdMatch) {
                const createdPath = createdMatch[1].trim();
                const filename = createdPath.split(/[/\\]/).pop() ?? createdPath;
                new Notice(`Note created: ${filename}`, 4000);
                this.app.workspace.openLinkText(filename, '', true).catch(() => {});
                return;
            }

            // No results / not found
            if (stdout.includes('No results found') || stdout.includes('not found')) {
                new Notice(lastLine(stdout), 6000);
                return;
            }

            new Notice('Done.', 3000);
        });
    }

    async loadSettings(): Promise<void> {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings(): Promise<void> {
        await this.saveData(this.settings);
    }
}
