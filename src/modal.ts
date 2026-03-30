import { App, Modal } from 'obsidian';
import type { FolioTemplate } from './settings';

export interface Candidate {
    id: string;
    title: string;
    sub_title: string;
    type: string;
    year: string;
    source: 'douban' | 'imdb' | 'openlibrary' | 'googlebooks';
}

export class DoubanModal extends Modal {
    private templates: FolioTemplate[];
    private onSubmit: (query: string, isbn: string, templateIndex: number, source: string) => void;

    constructor(
        app: App,
        templates: FolioTemplate[],
        onSubmit: (query: string, isbn: string, templateIndex: number, source: string) => void
    ) {
        super(app);
        this.templates = templates;
        this.onSubmit = onSubmit;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        this.titleEl.setText('Add note');

        const makeLabel = (text: string) => {
            contentEl.createEl('label', { text, cls: 'folio-field-label' });
        };

        makeLabel('Search');
        const searchEl = contentEl.createEl('input', {
            type: 'text',
            placeholder: 'Title, author, or keyword...',
            cls: 'folio-field',
        });

        makeLabel('ISBN (books only)');
        const isbnEl = contentEl.createEl('input', {
            type: 'text',
            placeholder: 'e.g. 9787302423287',
            cls: 'folio-field',
        });

        makeLabel('Source');
        const sourceSelect = contentEl.createEl('select', { cls: 'folio-field' });
        [
            { value: 'auto', text: 'Auto (by language)' },
            { value: 'douban', text: 'Douban' },
            { value: 'imdb', text: 'IMDB' },
            { value: 'openlibrary', text: 'Open Library' },
            { value: 'googlebooks', text: 'Google Books' },
        ].forEach(opt => sourceSelect.createEl('option', { value: opt.value, text: opt.text }));

        makeLabel('Template');
        const tplSelect = contentEl.createEl('select', { cls: 'folio-field' });
        tplSelect.createEl('option', { text: '— none —', value: '' });
        this.templates.forEach((tpl, i) => {
            tplSelect.createEl('option', { text: tpl.name, value: String(i) });
        });

        const doSubmit = () => {
            const query = searchEl.value.trim();
            const isbn = isbnEl.value.trim();
            if (!query && !isbn) return;
            const tplIndex = tplSelect.value !== '' ? parseInt(tplSelect.value, 10) : -1;
            this.close();
            this.onSubmit(query, isbn, tplIndex, sourceSelect.value);
        };

        searchEl.addEventListener('keydown', (e: KeyboardEvent) => { if (e.key === 'Enter') doSubmit(); });
        isbnEl.addEventListener('keydown', (e: KeyboardEvent) => { if (e.key === 'Enter') doSubmit(); });

        const buttonRow = contentEl.createDiv({ cls: 'modal-button-container folio-modal-actions' });
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
        this.titleEl.setText('Select result');

        const sourceLabel: Record<string, string> = {
            douban: 'Douban',
            imdb: 'IMDB',
            openlibrary: 'Open Library',
            googlebooks: 'Google Books',
        };

        this.candidates.forEach((candidate) => {
            const row = contentEl.createDiv({ cls: 'folio-candidate' });

            const label = [
                candidate.title,
                candidate.sub_title ? ` / ${candidate.sub_title}` : '',
                ` (${candidate.type}${candidate.year ? ', ' + candidate.year : ''}, ${sourceLabel[candidate.source] ?? candidate.source})`,
            ].join('');
            row.setText(label);

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

export class BlankNoteModal extends Modal {
    private title: string;
    private onSelect: (type: 'book' | 'movie') => void;

    constructor(app: App, title: string, onSelect: (type: 'book' | 'movie') => void) {
        super(app);
        this.title = title;
        this.onSelect = onSelect;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        this.titleEl.setText('No results found');

        contentEl.createEl('p', {
            text: `No results for "${this.title}". Create a blank note as:`,
            cls: 'folio-blank-message',
        });

        const buttonRow = contentEl.createDiv({ cls: 'folio-blank-actions' });

        const bookBtn = buttonRow.createEl('button', { text: 'Book' });
        bookBtn.addClass('mod-cta');
        bookBtn.addEventListener('click', () => { this.close(); this.onSelect('book'); });

        const movieBtn = buttonRow.createEl('button', { text: 'Movie' });
        movieBtn.addEventListener('click', () => { this.close(); this.onSelect('movie'); });

        const cancelBtn = buttonRow.createEl('button', { text: 'Cancel' });
        cancelBtn.addEventListener('click', () => this.close());
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
