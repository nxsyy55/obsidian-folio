import { App, Modal } from 'obsidian';
import type { FolioTemplate } from './settings';

export interface Candidate {
    id: string;
    title: string;
    sub_title: string;
    type: string;
    year: string;
}

export class DoubanModal extends Modal {
    private templates: FolioTemplate[];
    private onSubmit: (query: string, isbn: string, templateIndex: number) => void;

    constructor(
        app: App,
        templates: FolioTemplate[],
        onSubmit: (query: string, isbn: string, templateIndex: number) => void
    ) {
        super(app);
        this.templates = templates;
        this.onSubmit = onSubmit;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        this.titleEl.setText('Folio: Add Note');

        const fieldStyle = (el: HTMLElement) => {
            el.style.width = '100%';
            el.style.marginBottom = '0.75em';
            el.style.boxSizing = 'border-box';
        };

        const makeLabel = (text: string) => {
            const lbl = contentEl.createEl('label', { text });
            lbl.style.display = 'block';
            lbl.style.fontSize = '0.85em';
            lbl.style.marginBottom = '3px';
            lbl.style.color = 'var(--text-muted)';
        };

        makeLabel('Search');
        const searchEl = contentEl.createEl('input', {
            type: 'text',
            placeholder: 'Title, author, or keyword...',
        });
        fieldStyle(searchEl);

        makeLabel('ISBN (books only)');
        const isbnEl = contentEl.createEl('input', {
            type: 'text',
            placeholder: 'e.g. 9787302423287',
        });
        fieldStyle(isbnEl);

        makeLabel('Template');
        const tplSelect = contentEl.createEl('select');
        fieldStyle(tplSelect);
        tplSelect.createEl('option', { text: '— None —', value: '' });
        this.templates.forEach((tpl, i) => {
            tplSelect.createEl('option', { text: tpl.name, value: String(i) });
        });

        const doSubmit = () => {
            const query = searchEl.value.trim();
            const isbn = isbnEl.value.trim();
            if (!query && !isbn) return;
            const tplIndex = tplSelect.value !== '' ? parseInt(tplSelect.value, 10) : -1;
            this.close();
            this.onSubmit(query, isbn, tplIndex);
        };

        searchEl.addEventListener('keydown', (e: KeyboardEvent) => { if (e.key === 'Enter') doSubmit(); });
        isbnEl.addEventListener('keydown', (e: KeyboardEvent) => { if (e.key === 'Enter') doSubmit(); });

        const buttonRow = contentEl.createDiv({ cls: 'modal-button-container' });
        buttonRow.style.display = 'flex';
        buttonRow.style.justifyContent = 'flex-end';
        buttonRow.style.marginTop = '0.5em';

        const addBtn = buttonRow.createEl('button', { text: 'Add' });
        addBtn.addClass('mod-cta');
        addBtn.addEventListener('click', doSubmit);

        searchEl.focus();
    }

    onClose(): void {
        this.contentEl.empty();
    }
}

export class DisambiguationModal extends Modal {
    private candidates: Candidate[];
    private onSelect: (candidate: Candidate) => void;

    constructor(app: App, candidates: Candidate[], onSelect: (candidate: Candidate) => void) {
        super(app);
        this.candidates = candidates;
        this.onSelect = onSelect;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        this.titleEl.setText('Folio: Select Result');

        this.candidates.forEach((candidate) => {
            const row = contentEl.createDiv();
            row.style.padding = '0.5em 0.75em';
            row.style.cursor = 'pointer';
            row.style.borderBottom = '1px solid var(--background-modifier-border)';
            row.style.borderRadius = '4px';

            const label = [
                candidate.title,
                candidate.sub_title ? ` / ${candidate.sub_title}` : '',
                ` (${candidate.type}${candidate.year ? ', ' + candidate.year : ''})`,
            ].join('');
            row.setText(label);

            row.addEventListener('mouseenter', () => { row.style.background = 'var(--background-modifier-hover)'; });
            row.addEventListener('mouseleave', () => { row.style.background = ''; });
            row.addEventListener('click', () => {
                this.close();
                this.onSelect(candidate);
            });
        });
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
