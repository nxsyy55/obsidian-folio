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

        containerEl.createEl('h3', { text: 'Templates' });
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
                block.style.border = '1px solid var(--background-modifier-border)';
                block.style.borderRadius = '6px';
                block.style.padding = '12px';
                block.style.marginBottom = '12px';

                const headerRow = block.createDiv();
                headerRow.style.display = 'flex';
                headerRow.style.alignItems = 'center';
                headerRow.style.gap = '8px';
                headerRow.style.marginBottom = '8px';

                const nameInput = headerRow.createEl('input', { type: 'text', placeholder: 'Template name' });
                nameInput.style.flex = '1';
                nameInput.style.fontWeight = 'bold';
                nameInput.value = tpl.name;
                nameInput.addEventListener('change', async () => {
                    this.plugin.settings.templates[idx].name = nameInput.value.trim();
                    await this.plugin.saveSettings();
                });

                const delBtn = headerRow.createEl('button', { text: 'Delete' });
                delBtn.addEventListener('click', async () => {
                    this.plugin.settings.templates.splice(idx, 1);
                    await this.plugin.saveSettings();
                    renderTemplates();
                });

                const tagsLabel = block.createEl('label', { text: 'Tags (comma-separated):' });
                tagsLabel.style.display = 'block';
                tagsLabel.style.fontSize = '0.85em';
                tagsLabel.style.marginBottom = '4px';

                const tagsInput = block.createEl('input', { type: 'text', placeholder: 'book, to-read' });
                tagsInput.style.width = '100%';
                tagsInput.style.marginBottom = '8px';
                tagsInput.value = (tpl.tags ?? []).join(', ');
                tagsInput.addEventListener('change', async () => {
                    this.plugin.settings.templates[idx].tags = tagsInput.value
                        .split(',')
                        .map(t => t.trim())
                        .filter(Boolean);
                    await this.plugin.saveSettings();
                });

                const bodyLabel = block.createEl('label', { text: 'Note body (markdown, appended below frontmatter):' });
                bodyLabel.style.display = 'block';
                bodyLabel.style.fontSize = '0.85em';
                bodyLabel.style.marginBottom = '4px';

                const bodyArea = block.createEl('textarea');
                bodyArea.style.width = '100%';
                bodyArea.style.minHeight = '100px';
                bodyArea.style.fontFamily = 'var(--font-monospace)';
                bodyArea.style.fontSize = '0.9em';
                bodyArea.value = tpl.body ?? '';
                bodyArea.addEventListener('change', async () => {
                    this.plugin.settings.templates[idx].body = bodyArea.value;
                    await this.plugin.saveSettings();
                });
            });

            const addBtn = containerEl.createEl('button', { text: '+ Add Template', cls: 'folio-add-template-btn' });
            addBtn.style.marginTop = '8px';
            addBtn.addEventListener('click', async () => {
                this.plugin.settings.templates.push({ name: 'New Template', tags: [], body: '' });
                await this.plugin.saveSettings();
                renderTemplates();
            });
        };

        renderTemplates();
    }
}
