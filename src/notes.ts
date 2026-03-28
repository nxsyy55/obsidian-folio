import type { FolioTemplate } from './settings';

export interface BookMetadata {
    title: string;
    subTitle: string;
    originalTitle: string;
    series: string;
    type: 'book';
    author: string[];
    score: string;
    datePublished: string;
    translator: string[];
    publisher: string;
    producer: string;
    isbn: string;
    url: string;
}

export interface MovieMetadata {
    title: string;
    type: 'movie' | 'teleplay';
    originalTitle: string;
    genre: string[];
    datePublished: string;
    director: string[];
    score: string;
    url: string;
    country: string[];
    IMDb: string;
    time: string;
}

export function yamlValue(value: string | number | null | undefined, forceQuote = false): string {
    if (value === null || value === undefined || value === '') return '';
    const s = String(value);
    if (forceQuote) return `"${s}"`;
    if (
        /^[{['"\&*!|>%@`]/.test(s) ||
        s.startsWith('- ') ||
        s.startsWith('? ') ||
        /[#\[\]{}]|: /.test(s)
    ) {
        return `"${s}"`;
    }
    return s;
}

export function yamlList(items: string[]): string {
    if (!items.length) return '';
    return '\n' + items.map(i => `  - ${i}`).join('\n');
}

export function renderBookNote(meta: BookMetadata, template?: FolioTemplate | null): string {
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const lines: string[] = [];

    lines.push('---');
    lines.push(`title: ${yamlValue(meta.title)}`);
    lines.push('type: book');
    if (meta.subTitle) lines.push(`subTitle: ${yamlValue(meta.subTitle)}`);
    if (meta.originalTitle) lines.push(`originalTitle: ${yamlValue(meta.originalTitle)}`);
    if (meta.series) lines.push(`series: ${yamlValue(meta.series)}`);
    lines.push(meta.author.length ? `author: ${yamlList(meta.author)}` : 'author: ');
    if (meta.translator.length) lines.push(`translator: ${yamlList(meta.translator)}`);
    if (meta.publisher) lines.push(`publisher: ${yamlValue(meta.publisher)}`);
    if (meta.producer) lines.push(`producer: ${yamlValue(meta.producer)}`);
    if (meta.isbn) lines.push(`isbn: ${yamlValue(meta.isbn)}`);
    if (meta.score) lines.push(`score: ${yamlValue(meta.score)}`);
    if (meta.datePublished) lines.push(`datePublished: ${yamlValue(meta.datePublished)}`);
    lines.push(`url: ${yamlValue(meta.url)}`);
    lines.push(`createTime: ${now}`);
    if (template?.tags?.length) lines.push(`tags: ${yamlList(template.tags)}`);
    lines.push('---');
    lines.push('');
    if (template?.body) lines.push(template.body);

    return lines.join('\n') + '\n';
}

export function renderMovieNote(meta: MovieMetadata, template?: FolioTemplate | null): string {
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const lines: string[] = [];

    lines.push('---');
    lines.push(`title: ${yamlValue(meta.title)}`);
    lines.push(`type: ${meta.type}`);
    if (meta.originalTitle && meta.originalTitle !== meta.title)
        lines.push(`originalTitle: ${yamlValue(meta.originalTitle)}`);
    if (meta.genre.length) lines.push(`genre:${yamlList(meta.genre)}`);
    if (meta.director.length) lines.push(`director:${yamlList(meta.director)}`);
    if (meta.country.length) lines.push(`country:${yamlList(meta.country)}`);
    if (meta.IMDb) lines.push(`IMDb: ${yamlValue(meta.IMDb)}`);
    if (meta.time) lines.push(`time: ${yamlValue(meta.time)}`);
    if (meta.score) lines.push(`score: ${yamlValue(meta.score)}`);
    if (meta.datePublished) lines.push(`datePublished: ${yamlValue(meta.datePublished)}`);
    lines.push(`url: ${yamlValue(meta.url)}`);
    lines.push(`createTime: ${now}`);
    if (template?.tags?.length) lines.push(`tags: ${yamlList(template.tags)}`);
    lines.push('---');
    lines.push('');
    if (template?.body) lines.push(template.body);

    return lines.join('\n') + '\n';
}

export function renderBlankNote(
    title: string,
    type: 'book' | 'movie',
    template?: FolioTemplate | null
): string {
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const lines: string[] = [];
    lines.push('---');
    lines.push(`title: ${yamlValue(title)}`);
    lines.push(`type: ${type}`);
    lines.push(`createTime: ${now}`);
    lines.push('---');
    lines.push('');
    if (template?.body) lines.push(template.body);
    return lines.join('\n') + '\n';
}
