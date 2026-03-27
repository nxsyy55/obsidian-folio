import { App, PluginSettingTab, Setting } from 'obsidian';
import type DoubanPlugin from './main';

export interface DoubanSettings {
    pythonPath: string;
    backendDir: string;
    envPath: string;
}

export const DEFAULT_SETTINGS: DoubanSettings = {
    pythonPath: 'python',
    backendDir: '',
    envPath: '',
};

export class DoubanSettingTab extends PluginSettingTab {
    plugin: DoubanPlugin;

    constructor(app: App, plugin: DoubanPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        new Setting(containerEl)
            .setName('Python path')
            .setDesc('Path to the Python executable (e.g. "python" or "/usr/bin/python3").')
            .addText(text =>
                text
                    .setPlaceholder('python')
                    .setValue(this.plugin.settings.pythonPath)
                    .onChange(async value => {
                        this.plugin.settings.pythonPath = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName('Backend directory')
            .setDesc('Absolute path to the backend/ directory containing vault_tool.py.')
            .addText(text =>
                text
                    .setPlaceholder('/path/to/Notes Library/Scripts/backend')
                    .setValue(this.plugin.settings.backendDir)
                    .onChange(async value => {
                        this.plugin.settings.backendDir = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName('.env file path')
            .setDesc('Absolute path to the .env file used by the Python backend.')
            .addText(text =>
                text
                    .setPlaceholder('/path/to/Notes Library/Scripts/backend/.env')
                    .setValue(this.plugin.settings.envPath)
                    .onChange(async value => {
                        this.plugin.settings.envPath = value;
                        await this.plugin.saveSettings();
                    })
            );
    }
}
