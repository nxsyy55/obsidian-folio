import { App, Modal } from 'obsidian';

export class DoubanModal extends Modal {
    private onSubmit: (type: 'book' | 'movie', title: string) => void;
    private inputEl: HTMLInputElement;

    constructor(app: App, onSubmit: (type: 'book' | 'movie', title: string) => void) {
        super(app);
        this.onSubmit = onSubmit;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();

        this.titleEl.setText('Douban: Add Note');

        this.inputEl = contentEl.createEl('input', {
            type: 'text',
            placeholder: 'Enter title...',
        });
        this.inputEl.style.width = '100%';
        this.inputEl.style.marginBottom = '1em';

        this.inputEl.addEventListener('keydown', (event: KeyboardEvent) => {
            if (event.key === 'Enter') {
                const title = this.inputEl.value.trim();
                if (title) {
                    this.close();
                    this.onSubmit('book', title);
                }
            }
        });

        const buttonRow = contentEl.createDiv({ cls: 'modal-button-container' });
        buttonRow.style.display = 'flex';
        buttonRow.style.gap = '0.5em';
        buttonRow.style.justifyContent = 'flex-end';

        const bookBtn = buttonRow.createEl('button', { text: 'Book' });
        bookBtn.addEventListener('click', () => {
            const title = this.inputEl.value.trim();
            if (title) {
                this.close();
                this.onSubmit('book', title);
            }
        });

        const movieBtn = buttonRow.createEl('button', { text: 'Movie' });
        movieBtn.addEventListener('click', () => {
            const title = this.inputEl.value.trim();
            if (title) {
                this.close();
                this.onSubmit('movie', title);
            }
        });

        this.inputEl.focus();
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
