import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const TIMEZONE = 'America/Chicago';
const PROJECT_EPOCH = '2026-08-24';
const ROWS = 200;
const USER_AGENT = 'RG-HQ-Daily-Books/1.0 (+https://doomswitch541-prog.github.io/archive/books)';
const DEFAULT_FILE = fileURLToPath(new URL('../archive/books/books.json', import.meta.url));
const ARCHIVE_FILE = process.env.ARCHIVE_FILE ? resolve(process.env.ARCHIVE_FILE) : DEFAULT_FILE;

const SHELVES = [
    {
        name: 'Biodiversity Heritage Library',
        query: 'mediatype:texts AND collection:biodiversity AND (subject:botany OR subject:birds OR subject:"natural history")',
    },
    {
        name: 'Smithsonian Libraries',
        query: 'mediatype:texts AND collection:smithsonian AND (subject:art OR subject:design)',
    },
    {
        name: 'Americana Folklore',
        query: 'mediatype:texts AND collection:americana AND subject:folklore',
    },
];

function centralDateKey(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
    return `${values.year}-${values.month}-${values.day}`;
}

function validDateKey(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(`${value}T12:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function dayNumber(dateKey) {
    const from = Date.parse(`${PROJECT_EPOCH}T12:00:00Z`);
    const to = Date.parse(`${dateKey}T12:00:00Z`);
    return Math.floor((to - from) / 86400000);
}

function hash(value) {
    let result = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
        result ^= value.charCodeAt(index);
        result = Math.imul(result, 16777619);
    }
    return result >>> 0;
}

function firstValue(value) {
    if (Array.isArray(value)) return firstValue(value[0]);
    if (typeof value === 'number') return String(value);
    return typeof value === 'string' ? value : '';
}

function cleanText(value, limit = 1200) {
    return firstValue(value)
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&apos;/gi, "'")
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, limit);
}

function validIdentifier(value) {
    return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{4,99}$/.test(value);
}

function retryDelay(response, attempt) {
    const retryAfter = response.headers.get('retry-after');
    if (retryAfter) {
        const seconds = Number(retryAfter);
        if (Number.isFinite(seconds)) return Math.min(seconds * 1000, 30000);
        const until = Date.parse(retryAfter) - Date.now();
        if (Number.isFinite(until)) return Math.min(Math.max(until, 0), 30000);
    }
    return 1000 * (2 ** attempt);
}

const wait = (milliseconds) => new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));

async function fetchJson(url, attempts = 4) {
    let lastError;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        try {
            const response = await fetch(url, {
                headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
                signal: controller.signal,
            });
            if (response.ok) return await response.json();
            const retryable = response.status === 429 || response.status >= 500;
            if (!retryable) throw new Error(`Internet Archive returned HTTP ${response.status}`);
            lastError = new Error(`Internet Archive returned HTTP ${response.status}`);
            if (attempt < attempts - 1) await wait(retryDelay(response, attempt));
        } catch (error) {
            lastError = error;
            if (attempt < attempts - 1) await wait(1000 * (2 ** attempt));
        } finally {
            clearTimeout(timeout);
        }
    }
    throw lastError || new Error('Internet Archive request failed');
}

async function readArchive() {
    try {
        const parsed = JSON.parse(await readFile(ARCHIVE_FILE, 'utf8'));
        if (!parsed || !Array.isArray(parsed.books)) throw new Error('books must be an array');
        return parsed;
    } catch (error) {
        if (error.code === 'ENOENT') {
            return { version: 1, timezone: TIMEZONE, updatedAt: '', books: [] };
        }
        throw new Error(`Could not read ${ARCHIVE_FILE}: ${error.message}`);
    }
}

function searchUrl(query, page) {
    const params = new URLSearchParams({
        q: query,
        rows: String(ROWS),
        page: String(page),
        output: 'json',
    });
    ['identifier', 'title', 'creator', 'date', 'year'].forEach((field) => params.append('fl[]', field));
    params.append('sort[]', 'downloads desc');
    return `https://archive.org/advancedsearch.php?${params}`;
}

async function candidatesFor(shelf, page, usedIdentifiers) {
    const payload = await fetchJson(searchUrl(shelf.query, page));
    const documents = Array.isArray(payload?.response?.docs) ? payload.response.docs : [];
    return documents.filter((document) => (
        validIdentifier(document.identifier)
        && cleanText(document.title, 300)
        && !usedIdentifiers.has(document.identifier)
    ));
}

async function selectCandidate(dateKey, shelf, page, usedIdentifiers) {
    let candidates = await candidatesFor(shelf, page, usedIdentifiers);
    if (!candidates.length && page !== 1) candidates = await candidatesFor(shelf, 1, usedIdentifiers);
    if (!candidates.length) throw new Error(`No unused books were returned for ${shelf.name}`);
    return candidates[hash(`${dateKey}:${shelf.name}`) % candidates.length];
}

async function buildRecord(dateKey, shelf, candidate) {
    const metadataUrl = `https://archive.org/metadata/${encodeURIComponent(candidate.identifier)}`;
    const payload = await fetchJson(metadataUrl);
    const metadata = payload?.metadata || {};
    const title = cleanText(metadata.title || candidate.title, 300);
    if (!title) throw new Error(`Selected item ${candidate.identifier} has no title`);

    return {
        date: dateKey,
        identifier: candidate.identifier,
        title,
        creator: cleanText(metadata.creator || candidate.creator, 300) || 'Creator not listed',
        published: cleanText(metadata.date || metadata.year || candidate.date || candidate.year, 80) || 'Uncatalogued',
        description: cleanText(metadata.description, 1200),
        shelf: shelf.name,
        archivedAt: new Date().toISOString(),
    };
}

async function main() {
    const dateKey = process.env.ARCHIVE_DATE || centralDateKey();
    if (!validDateKey(dateKey)) throw new Error('ARCHIVE_DATE must be a real date in YYYY-MM-DD form');

    const archive = await readArchive();
    if (archive.books.some((book) => book.date === dateKey)) {
        console.log(`${dateKey} is already archived; no change.`);
        return;
    }

    const offset = dayNumber(dateKey);
    const shelfIndex = ((offset % SHELVES.length) + SHELVES.length) % SHELVES.length;
    const shelf = SHELVES[shelfIndex];
    const page = Math.max(1, Math.floor(Math.max(offset, 0) / (SHELVES.length * ROWS)) + 1);
    const usedIdentifiers = new Set(archive.books.map((book) => book.identifier));
    const candidate = await selectCandidate(dateKey, shelf, page, usedIdentifiers);
    const record = await buildRecord(dateKey, shelf, candidate);

    archive.version = 1;
    archive.timezone = TIMEZONE;
    archive.updatedAt = record.archivedAt;
    archive.books.push(record);
    archive.books.sort((a, b) => a.date.localeCompare(b.date));

    await mkdir(dirname(ARCHIVE_FILE), { recursive: true });
    await writeFile(ARCHIVE_FILE, `${JSON.stringify(archive, null, 2)}\n`, 'utf8');
    console.log(`Archived ${record.title} (${record.identifier}) for ${dateKey}.`);
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});
