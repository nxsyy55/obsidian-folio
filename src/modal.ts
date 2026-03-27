import { App, Modal } from 'obsidian';

export type ModalMode = 'book' | 'movie' | 'isbn' | 'both';
export type SubmitType = 'book' | 'movie' | 'teleplay' | 'isbn';

export interface Candidate {
    id: string;
    title: string;
    sub_title: string;
    type: string;
    year: string;
}

export class DoubanModal extends Modal {
    private mode: ModalMode;
    private onSubmit: (type: SubmitType, value: string) => void;
    private inputEl: HTMLInputElement;

    constructor(app: App, mode: ModalMode, onSubmit: (type: SubmitType, value: string) => void) {
        super(app);
        this.mode = mode;
        this.onSubmit = onSubmit;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();

        const isISBN = this.mode === 'isbn';
        this.titleEl.setText(isISBN ? 'Douban: Search by ISBN' : 'Douban: Add Note');

        this.inputEl = contentEl.createEl('input', {
            type: 'text',
            placeholder: isISBN ? 'Enter ISBN...' : 'Enter title...',
        });
        this.inputEl.style.width = '100%';
        this.inputEl.style.marginBottom = '1em';

        const defaultType: SubmitType = isISBN ? 'isbn' : this.mode === 'movie' ? 'movie' : 'book';

        this.inputEl.addEventListener('keydown', (event: KeyboardEvent) => {
            if (event.key === 'Enter') {
                const value = this.inputEl.value.trim();
                if (value) {
                    this.close();
                    this.onSubmit(defaultType, value);
                }
            }
        });

        const buttonRow = contentEl.createDiv({ cls: 'modal-button-container' });
        buttonRow.style.display = 'flex';
        buttonRow.style.gap = '0.5em';
        buttonRow.style.justifyContent = 'flex-end';

        const addButton = (label: string, type: SubmitType) => {
            const btn = buttonRow.createEl('button', { text: label });
            btn.addEventListener('click', () => {
                const value = this.inputEl.value.trim();
                if (value) {
                    this.close();
                    this.onSubmit(type, value);
                }
            });
        };

        if (isISBN) {
            addButton('Search', 'isbn');
        } else if (this.mode === 'book') {
            addButton('Book', 'book');
        } else if (this.mode === 'movie') {
            addButton('Movie', 'movie');
            addButton('Teleplay', 'teleplay');
        } else {
            // 'both'
            addButton('Book', 'book');
            addButton('Movie', 'movie');
            addButton('Teleplay', 'teleplay');
        }

        this.inputEl.focus();
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
        this.titleEl.setText('Douban: Select Result');

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

            row.addEventListener('mouseenter', () => {
                row.style.background = 'var(--background-modifier-hover)';
            });
            row.addEventListener('mouseleave', () => {
                row.style.background = '';
            });
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
