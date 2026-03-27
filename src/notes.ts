export interface BookMetadata {
    doubanId: string;
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
    totalPage: string;
    price: string;
}

export interface MovieMetadata {
    doubanId: string;
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

export function renderBookNote(meta: BookMetadata): string {
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const year = new Date().getFullYear();
    const lines: string[] = [];

    lines.push('---');
    lines.push(`title: ${yamlValue(meta.title)}`);
    lines.push('type: book');
    lines.push(meta.author.length ? `author: ${yamlList(meta.author)}` : 'author: ');
    if (meta.series) lines.push(`series: ${yamlValue(meta.series)}`);
    lines.push(`score: ${yamlValue(meta.score)}`);
    lines.push(`datePublished: ${yamlValue(meta.datePublished)}`);
    lines.push(`publisher: ${yamlValue(meta.publisher)}`);
    if (meta.translator.length) lines.push(`translator: ${yamlList(meta.translator)}`);
    lines.push(`isbn: ${yamlValue(meta.isbn)}`);
    lines.push(`url: ${yamlValue(meta.url)}`);
    lines.push(`createTime: ${now}`);
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push('## 标签');
    lines.push('');
    lines.push(`#read/${year} #to-do`);
    lines.push('');
    lines.push('## 读后感');
    lines.push('');
    lines.push('');
    lines.push('');
    lines.push('## 摘录');
    lines.push('');

    return lines.join('\n') + '\n';
}

export function renderMovieNote(meta: MovieMetadata): string {
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const year = new Date().getFullYear();
    const lines: string[] = [];

    lines.push('---');
    lines.push(`title: ${yamlValue(meta.title)}`);
    lines.push(`type: ${meta.type}`);
    if (meta.originalTitle && meta.originalTitle !== meta.title)
        lines.push(`originalTitle: ${yamlValue(meta.originalTitle)}`);
    lines.push(meta.genre.length ? `genre:${yamlList(meta.genre)}` : 'genre:');
    lines.push(`datePublished: ${yamlValue(meta.datePublished)}`);
    lines.push(meta.director.length ? `director:${yamlList(meta.director)}` : 'director:');
    lines.push(`score: ${yamlValue(meta.score)}`);
    lines.push(`url: ${yamlValue(meta.url)}`);
    lines.push(meta.country.length ? `country:${yamlList(meta.country)}` : 'country:');
    if (meta.IMDb) lines.push(`IMDb: ${yamlValue(meta.IMDb)}`);
    lines.push(`time: ${yamlValue(meta.time)}`);
    lines.push(`createTime: ${now}`);
    lines.push('---');
    lines.push('');

    const tags = [`#watch/${year}`];
    meta.genre.forEach(g => tags.push(`#${g}`));
    if (meta.type === 'teleplay') tags.push('#tv');
    tags.push('#to-do');

    lines.push('## 标签');
    lines.push('');
    lines.push(tags.join(' '));
    lines.push('');
    lines.push('## 观后感');
    lines.push('');
    lines.push('');

    return lines.join('\n') + '\n';
}
