import { App, PluginSettingTab, Setting } from 'obsidian';
import type DoubanPlugin from './main';

export interface DoubanSettings {
    firecrawlApiKey: string;
    inboxDir: string;
    bookDir: string;
    watchDir: string;
    requestDelay: number;
}

export const DEFAULT_SETTINGS: DoubanSettings = {
    firecrawlApiKey: '',
    inboxDir: 'inbox',
    bookDir: 'ReadNotes',
    watchDir: 'WatchNotes',
    requestDelay: 2,
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
            .setName('Firecrawl API key')
            .setDesc('Get a free key at firecrawl.dev/app/api-keys. Used to fetch book and movie detail pages.')
            .addText(text =>
                text
                    .setPlaceholder('fc-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx')
                    .setValue(this.plugin.settings.firecrawlApiKey)
                    .onChange(async value => {
                        this.plugin.settings.firecrawlApiKey = value.trim();
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName('Inbox folder')
            .setDesc('Vault subfolder where new notes are created. Must exist in your vault.')
            .addText(text =>
                text
                    .setPlaceholder('inbox')
                    .setValue(this.plugin.settings.inboxDir)
                    .onChange(async value => {
                        this.plugin.settings.inboxDir = value.trim() || 'inbox';
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName('Request delay (seconds)')
            .setDesc('Seconds to wait between Douban requests. Increase if you hit rate limits.')
            .addSlider(slider =>
                slider
                    .setLimits(0, 10, 1)
                    .setValue(this.plugin.settings.requestDelay)
                    .setDynamicTooltip()
                    .onChange(async value => {
                        this.plugin.settings.requestDelay = value;
                        await this.plugin.saveSettings();
                    })
            );
    }
}
