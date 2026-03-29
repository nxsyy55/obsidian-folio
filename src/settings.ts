import { App, PluginSettingTab, Setting } from 'obsidian';
import type DoubanPlugin from './main';

export interface FolioTemplate {
    name: string;
    tags: string[];
    body: string;
}

export interface DoubanSettings {
    firecrawlApiKey: string;
    inboxDir: string;
    bookDir: string;
    watchDir: string;
    requestDelay: number;
    templates: FolioTemplate[];
}

export const DEFAULT_SETTINGS: DoubanSettings = {
    firecrawlApiKey: '',
    inboxDir: 'inbox',
    bookDir: 'ReadNotes',
    watchDir: 'WatchNotes',
    requestDelay: 2,
    templates: [],
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
                    .onChange(value => {
                        this.plugin.settings.firecrawlApiKey = value.trim();
                        void this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName('Inbox folder')
            .setDesc('Vault subfolder where new notes are created. Must exist in your vault.')
            .addText(text =>
                text
                    .setPlaceholder('inbox')
                    .setValue(this.plugin.settings.inboxDir)
                    .onChange(value => {
                        this.plugin.settings.inboxDir = value.trim() || 'inbox';
                        void this.plugin.saveSettings();
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
                    .onChange(value => {
                        this.plugin.settings.requestDelay = value;
                        void this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl).setName('Templates').setHeading();
        containerEl.createEl('p', {
            text: 'Templates control the tags and body structure appended to each new note. The YAML frontmatter is always populated from online data. Leave all templates empty to get bare frontmatter only.',
            cls: 'setting-item-description',
        });

        const renderTemplates = () => {
            containerEl.querySelectorAll('.folio-template-block').forEach(el => el.remove());
            const existingAddBtn = containerEl.querySelector('.folio-add-template-btn');
            if (existingAddBtn) existingAddBtn.remove();

            this.plugin.settings.templates.forEach((tpl, idx) => {
                const block = containerEl.createDiv({ cls: 'folio-template-block' });

                const headerRow = block.createDiv({ cls: 'folio-template-header' });

                const nameInput = headerRow.createEl('input', { type: 'text', placeholder: 'Template name' });
                nameInput.addClass('folio-template-name');
                nameInput.value = tpl.name;
                nameInput.addEventListener('change', () => {
                    this.plugin.settings.templates[idx].name = nameInput.value.trim();
                    void this.plugin.saveSettings();
                });

                const delBtn = headerRow.createEl('button', { text: 'Delete' });
                delBtn.addEventListener('click', () => {
                    this.plugin.settings.templates.splice(idx, 1);
                    void this.plugin.saveSettings();
                    renderTemplates();
                });

                block.createEl('label', { text: 'Tags (comma-separated):', cls: 'folio-setting-label' });

                const tagsInput = block.createEl('input', { type: 'text', placeholder: 'book, to-read' });
                tagsInput.addClass('folio-setting-input');
                tagsInput.value = (tpl.tags ?? []).join(', ');
                tagsInput.addEventListener('change', () => {
                    this.plugin.settings.templates[idx].tags = tagsInput.value
                        .split(',')
                        .map(t => t.trim())
                        .filter(Boolean);
                    void this.plugin.saveSettings();
                });

                block.createEl('label', {
                    text: 'Note body (markdown, appended below frontmatter):',
                    cls: 'folio-setting-label',
                });

                const bodyArea = block.createEl('textarea');
                bodyArea.addClass('folio-template-body');
                bodyArea.value = tpl.body ?? '';
                bodyArea.addEventListener('change', () => {
                    this.plugin.settings.templates[idx].body = bodyArea.value;
                    void this.plugin.saveSettings();
                });
            });

            const addBtn = containerEl.createEl('button', {
                text: '+ Add template',
                cls: 'folio-add-template-btn',
            });
            addBtn.addEventListener('click', () => {
                this.plugin.settings.templates.push({ name: 'New template', tags: [], body: '' });
                void this.plugin.saveSettings();
                renderTemplates();
            });
        };

        renderTemplates();
    }
}
