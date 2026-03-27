import { Plugin, Notice } from 'obsidian';
import { exec } from 'child_process';
import { DoubanSettings, DEFAULT_SETTINGS, DoubanSettingTab } from './settings';
import { DoubanModal } from './modal';

export default class DoubanPlugin extends Plugin {
    settings: DoubanSettings;

    async onload(): Promise<void> {
        await this.loadSettings();

        this.addSettingTab(new DoubanSettingTab(this.app, this));

        this.addCommand({
            id: 'add-book',
            name: 'Add Book Note',
            callback: () => {
                new DoubanModal(this.app, (type, title) => {
                    this.runBackend('book', title);
                }).open();
            },
        });

        this.addCommand({
            id: 'add-movie',
            name: 'Add Movie Note',
            callback: () => {
                new DoubanModal(this.app, (type, title) => {
                    this.runBackend('movie', title);
                }).open();
            },
        });

        this.addCommand({
            id: 'add-note',
            name: 'Add Book or Movie Note',
            callback: () => {
                new DoubanModal(this.app, (type, title) => {
                    this.runBackend(type, title);
                }).open();
            },
        });
    }

    private runBackend(type: 'book' | 'movie', title: string): void {
        new Notice('Fetching from Douban...');

        const { pythonPath, backendDir, envPath } = this.settings;
        const vaultToolPath = `${backendDir}/vault_tool.py`;
        const cmd = `"${pythonPath}" "${vaultToolPath}" ${type} "${title}"`;

        const env = { ...process.env };
        if (envPath) {
            env['ENV_FILE'] = envPath;
        }

        exec(cmd, { cwd: backendDir, env }, (error, stdout, stderr) => {
            if (error) {
                new Notice(`Error: ${stderr || error.message}`);
                return;
            }

            const match = stdout.match(/Created: (.+)/);
            if (match) {
                const createdPath = match[1].trim();
                const filename = createdPath.split(/[/\\]/).pop() ?? createdPath;
                new Notice(`Note created: ${filename}`);

                // Best-effort: try to open the file in Obsidian
                this.app.workspace.openLinkText(filename, '', true).catch(() => {
                    // Opening the file is optional; ignore errors
                });
            } else {
                new Notice('Note created!');
            }
        });
    }

    async loadSettings(): Promise<void> {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings(): Promise<void> {
        await this.saveData(this.settings);
    }
}
