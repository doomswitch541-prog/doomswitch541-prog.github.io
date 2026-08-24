(() => {
    'use strict';

    const SEARCH_URL = 'https://archive.org/advancedsearch.php';
    const CACHE_PREFIX = 'rg-archive-daily-v1:';
    const REQUEST_TIMEOUT_MS = 10000;
    const RESULT_COUNT = 48;
    let activeDateKey = '';
    let rolloverTimer = null;

    const shelves = [
        {
            label: 'Smithsonian Libraries',
            shortLabel: 'Smithsonian',
            query: 'collection:smithsonian AND mediatype:texts AND language:eng AND date:[1500-01-01 TO 1928-12-31] AND (subject:art OR subject:design OR subject:architecture OR subject:"decorative arts")',
        },
        {
            label: 'Biodiversity Heritage Library',
            shortLabel: 'Biodiversity',
            query: 'collection:biodiversity AND mediatype:texts AND language:eng AND date:[1500-01-01 TO 1928-12-31] AND (subject:botany OR subject:birds OR subject:"natural history")',
        },
        {
            label: 'Americana · Folklore',
            shortLabel: 'Folklore',
            query: 'collection:americana AND mediatype:texts AND language:eng AND date:[1800-01-01 TO 1928-12-31] AND subject:folklore',
        },
    ];

    const els = {
        entry: document.getElementById('archive-entry'),
        status: document.getElementById('archive-status'),
        book: document.getElementById('archive-book'),
        error: document.getElementById('archive-error'),
        retry: document.getElementById('archive-retry'),
        title: document.getElementById('archive-book-title'),
        creator: document.getElementById('archive-creator'),
        description: document.getElementById('archive-description'),
        year: document.getElementById('archive-year'),
        shelf: document.getElementById('archive-shelf'),
        open: document.getElementById('archive-open'),
        coverLink: document.getElementById('archive-cover-link'),
        cover: document.getElementById('archive-cover'),
        coverFallback: document.getElementById('archive-cover-fallback'),
        coverDate: document.getElementById('archive-cover-date'),
        slipDate: document.getElementById('archive-slip-date'),
        slipPull: document.getElementById('archive-slip-pull'),
        slipShelf: document.getElementById('archive-slip-shelf'),
    };

    function localDateParts(date = new Date()) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const dayOfYear = Math.floor(
            (Date.UTC(year, date.getMonth(), date.getDate()) - Date.UTC(year, 0, 0)) / 86400000
        );
        return {
            key: `${year}-${month}-${day}`,
            display: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
            dayOfYear,
            pull: `${year}.${String(dayOfYear).padStart(3, '0')}`,
        };
    }

    function hash(value) {
        let result = 2166136261;
        for (let index = 0; index < value.length; index += 1) {
            result ^= value.charCodeAt(index);
            result = Math.imul(result, 16777619);
        }
        return result >>> 0;
    }

    function first(value) {
        if (Array.isArray(value)) return value.find(Boolean) || '';
        return value || '';
    }

    function textFromMarkup(value) {
        const source = String(first(value)).trim();
        if (!source) return '';
        const parsed = new DOMParser().parseFromString(source, 'text/html');
        return (parsed.body.textContent || '').replace(/\s+/g, ' ').trim();
    }

    function shorten(value, limit = 420) {
        if (value.length <= limit) return value;
        const cut = value.slice(0, limit + 1);
        const boundary = cut.lastIndexOf(' ');
        return `${cut.slice(0, boundary > limit * 0.7 ? boundary : limit).trim()}…`;
    }

    function validIdentifier(value) {
        return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{4,99}$/.test(value);
    }

    function publicationLabel(value) {
        const catalogDate = textFromMarkup(value);
        const year = catalogDate.match(/\b(?:1[0-9]{3}|20[0-9]{2})\b/);
        return year ? year[0] : shorten(catalogDate, 32);
    }

    function normalize(doc, shelf) {
        if (!doc || !validIdentifier(doc.identifier)) return null;
        const title = textFromMarkup(doc.title);
        if (!title) return null;
        return {
            identifier: doc.identifier,
            title,
            creator: textFromMarkup(doc.creator) || 'Creator not listed',
            date: publicationLabel(doc.date),
            description: shorten(textFromMarkup(doc.description)),
            shelf: shelf.label,
            shelfShort: shelf.shortLabel,
        };
    }

    function readCache(dateKey) {
        try {
            const value = JSON.parse(localStorage.getItem(CACHE_PREFIX + dateKey));
            return value && validIdentifier(value.identifier) && value.title ? value : null;
        } catch {
            return null;
        }
    }

    function writeCache(dateKey, book) {
        try {
            localStorage.setItem(CACHE_PREFIX + dateKey, JSON.stringify(book));
        } catch {
            // The book still renders when storage is blocked.
        }
    }

    function buildSearchUrl(shelf) {
        const params = new URLSearchParams();
        params.set('q', shelf.query);
        ['identifier', 'title', 'creator', 'date', 'description', 'downloads'].forEach((field) => {
            params.append('fl[]', field);
        });
        params.append('sort[]', 'downloads desc');
        params.set('rows', String(RESULT_COUNT));
        params.set('page', '1');
        params.set('output', 'json');
        return `${SEARCH_URL}?${params.toString()}`;
    }

    async function requestBook(dateInfo) {
        const shelf = shelves[hash(`${dateInfo.key}:shelf`) % shelves.length];
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

        try {
            const response = await fetch(buildSearchUrl(shelf), {
                cache: 'no-store',
                signal: controller.signal,
            });
            if (!response.ok) throw new Error(`Archive request failed: ${response.status}`);
            const payload = await response.json();
            const docs = Array.isArray(payload.response?.docs) ? payload.response.docs : [];
            const normalized = docs.map((doc) => normalize(doc, shelf)).filter(Boolean);
            if (!normalized.length) throw new Error('Archive returned no usable books');
            return normalized[hash(`${dateInfo.key}:book`) % normalized.length];
        } finally {
            clearTimeout(timeout);
        }
    }

    function paintDate(dateInfo) {
        els.slipDate.textContent = dateInfo.display;
        els.slipPull.textContent = dateInfo.pull;
        els.coverDate.textContent = dateInfo.display;
    }

    function showBook(book) {
        const itemUrl = `https://archive.org/details/${encodeURIComponent(book.identifier)}`;
        els.title.textContent = book.title;
        els.creator.textContent = book.creator;
        els.year.textContent = book.date || 'Uncatalogued';
        els.shelf.textContent = book.shelf;
        els.slipShelf.textContent = book.shelfShort;
        els.open.href = itemUrl;
        els.coverLink.href = itemUrl;
        els.coverLink.removeAttribute('aria-disabled');
        els.coverLink.setAttribute('aria-label', `Open ${book.title} at Internet Archive`);

        if (book.description) {
            els.description.textContent = book.description;
            els.description.hidden = false;
        } else {
            els.description.hidden = true;
        }

        els.cover.onload = () => {
            els.cover.hidden = false;
            requestAnimationFrame(() => {
                els.cover.classList.add('is-visible');
                els.coverFallback.classList.add('is-hidden');
            });
        };
        els.cover.onerror = () => {
            els.cover.hidden = true;
            els.coverFallback.classList.remove('is-hidden');
        };
        els.cover.alt = `Cover of ${book.title}`;
        els.cover.src = `https://archive.org/services/img/${encodeURIComponent(book.identifier)}`;

        els.error.hidden = true;
        els.book.hidden = false;
        els.status.textContent = `Today’s book is ${book.title}.`;
        els.status.classList.add('is-complete');
        els.entry.setAttribute('aria-busy', 'false');
        requestAnimationFrame(() => els.book.classList.add('is-ready'));
    }

    function showError(error) {
        console.warn('[archive] daily pull unavailable', error);
        els.book.hidden = true;
        els.book.classList.remove('is-ready');
        els.error.hidden = false;
        els.status.textContent = 'The Internet Archive shelf is unavailable.';
        els.status.classList.remove('is-complete');
        els.slipShelf.textContent = 'Unavailable';
        els.entry.setAttribute('aria-busy', 'false');
    }

    async function load({ force = false } = {}) {
        const dateInfo = localDateParts();
        activeDateKey = dateInfo.key;
        paintDate(dateInfo);
        els.error.hidden = true;
        els.entry.setAttribute('aria-busy', 'true');
        els.status.textContent = 'Checking the shelf…';
        els.status.classList.remove('is-complete');

        const cached = force ? null : readCache(dateInfo.key);
        if (cached) {
            showBook(cached);
            return;
        }

        try {
            const book = await requestBook(dateInfo);
            writeCache(dateInfo.key, book);
            showBook(book);
        } catch (error) {
            showError(error);
        }
    }

    function scheduleRollover() {
        if (rolloverTimer) clearTimeout(rolloverTimer);
        const now = new Date();
        const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
        rolloverTimer = setTimeout(async () => {
            await load();
            scheduleRollover();
        }, tomorrow.getTime() - now.getTime());
    }

    els.retry?.addEventListener('click', () => load({ force: true }));
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && localDateParts().key !== activeDateKey) {
            load().finally(scheduleRollover);
        }
    });
    load().finally(scheduleRollover);
})();
