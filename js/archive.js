(() => {
    'use strict';

    const RAW_HISTORY_URL = 'https://raw.githubusercontent.com/doomswitch541-prog/doomswitch541-prog.github.io/main/archive/books/books.json';
    const LOCAL_HISTORY_URL = '/archive/books/books.json';
    // Pharos publishes its curated Internet Archive books here (complements the daily pull).
    const PHAROS_RAW_URL = 'https://raw.githubusercontent.com/doomswitch541-prog/doomswitch541-prog.github.io/main/archive/books/pharos.json';
    const PHAROS_LOCAL_URL = '/archive/books/pharos.json';
    const CACHE_KEY = 'rg-archive-books-history-v1';
    const REQUEST_TIMEOUT_MS = 9000;
    const STALE_RETRY_MS = 15 * 60 * 1000;
    const LONG_CHECK_MS = 6 * 60 * 60 * 1000;

    let latestArchiveDate = '';
    let lastCheckedAt = 0;
    let refreshTimer = null;

    const els = {
        entry: document.getElementById('archive-entry'),
        status: document.getElementById('archive-status'),
        book: document.getElementById('archive-book'),
        error: document.getElementById('archive-error'),
        retry: document.getElementById('archive-retry'),
        kicker: document.getElementById('archive-kicker'),
        date: document.getElementById('archive-date'),
        title: document.getElementById('archive-book-title'),
        creator: document.getElementById('archive-creator'),
        description: document.getElementById('archive-description'),
        year: document.getElementById('archive-year'),
        added: document.getElementById('archive-added'),
        shelf: document.getElementById('archive-shelf'),
        open: document.getElementById('archive-open'),
        coverLink: document.getElementById('archive-cover-link'),
        cover: document.getElementById('archive-cover'),
        coverFallback: document.getElementById('archive-cover-fallback'),
        coverTitle: document.getElementById('archive-cover-title'),
        history: document.getElementById('archive-history'),
        historyEmpty: document.getElementById('archive-history-empty'),
        count: document.getElementById('archive-count'),
    };

    function localDateKey(date = new Date()) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    function displayDate(dateKey, options = { month: 'short', day: 'numeric', year: 'numeric' }) {
        const parsed = new Date(`${dateKey}T12:00:00`);
        return Number.isNaN(parsed.getTime()) ? dateKey : parsed.toLocaleDateString('en-US', options);
    }

    function hash(value) {
        let result = 2166136261;
        for (let index = 0; index < value.length; index += 1) {
            result ^= value.charCodeAt(index);
            result = Math.imul(result, 16777619);
        }
        return result >>> 0;
    }

    function validIdentifier(value) {
        return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{4,99}$/.test(value);
    }

    function normalizeHistory(payload) {
        if (!payload || !Array.isArray(payload.books)) return null;
        const books = payload.books
            .filter((book) => book && /^\d{4}-\d{2}-\d{2}$/.test(book.date) && validIdentifier(book.identifier) && book.title)
            .map((book) => ({
                date: book.date,
                identifier: book.identifier,
                title: String(book.title),
                creator: String(book.creator || 'Creator not listed'),
                published: String(book.published || 'Uncatalogued'),
                description: String(book.description || ''),
                shelf: String(book.shelf || 'Internet Archive'),
                archivedAt: String(book.archivedAt || ''),
            }))
            .sort((a, b) => b.date.localeCompare(a.date));
        return books.length ? { ...payload, books } : null;
    }

    async function fetchJson(url) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        try {
            const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
            if (!response.ok) throw new Error(`Archive history request failed: ${response.status}`);
            const history = normalizeHistory(await response.json());
            if (!history) throw new Error('Archive history was empty or malformed');
            return history;
        } finally {
            clearTimeout(timeout);
        }
    }

    function readCachedHistory() {
        try {
            return normalizeHistory(JSON.parse(localStorage.getItem(CACHE_KEY)));
        } catch {
            return null;
        }
    }

    function writeCachedHistory(history) {
        try {
            localStorage.setItem(CACHE_KEY, JSON.stringify(history));
        } catch {
            // A blocked cache never blocks the shared archive.
        }
    }

    async function readHistory() {
        const cacheBust = `v=${Date.now()}`;
        const sources = [`${RAW_HISTORY_URL}?${cacheBust}`, `${LOCAL_HISTORY_URL}?${cacheBust}`];
        for (const source of sources) {
            try {
                const history = await fetchJson(source);
                writeCachedHistory(history);
                return history;
            } catch {
                // Try the checked-in copy, then the last successful browser copy.
            }
        }
        const cached = readCachedHistory();
        if (cached) return cached;
        throw new Error('No archive history source was available');
    }

    // Pharos's curated shelf — optional. If it's missing or malformed, the daily shelf stands
    // alone; it never blocks the page.
    async function readPharos() {
        const cacheBust = `v=${Date.now()}`;
        for (const source of [`${PHAROS_RAW_URL}?${cacheBust}`, `${PHAROS_LOCAL_URL}?${cacheBust}`]) {
            try {
                const history = await fetchJson(source);
                return history.books;
            } catch {
                // Try the local copy, then give up quietly.
            }
        }
        return [];
    }

    function mergeBooks(base, extra) {
        const seen = new Set(base.map((book) => book.identifier));
        const merged = base.slice();
        for (const book of extra) {
            if (seen.has(book.identifier)) continue;
            seen.add(book.identifier);
            merged.push(book);
        }
        return merged.sort((a, b) => b.date.localeCompare(a.date));
    }

    function showBook(book) {
        const itemUrl = `https://archive.org/details/${encodeURIComponent(book.identifier)}`;
        const coverUrl = `https://archive.org/services/img/${encodeURIComponent(book.identifier)}`;
        const isToday = book.date === localDateKey();

        els.kicker.textContent = isToday ? 'Today’s pull' : 'Latest pull';
        els.date.textContent = displayDate(book.date).toUpperCase();
        els.title.textContent = book.title;
        els.coverTitle.textContent = book.title;
        els.creator.textContent = book.creator;
        els.year.textContent = book.published;
        els.added.textContent = displayDate(book.date);
        els.shelf.textContent = book.shelf;
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

        els.cover.classList.remove('is-visible');
        els.coverFallback.classList.remove('is-hidden');
        els.cover.hidden = true;
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
        els.cover.src = coverUrl;

        els.error.hidden = true;
        els.book.hidden = false;
        els.status.textContent = `${isToday ? 'Today’s' : 'The latest'} archived book is ${book.title}.`;
        els.status.classList.add('is-complete');
        els.entry.setAttribute('aria-busy', 'false');
        requestAnimationFrame(() => els.book.classList.add('is-ready'));
    }

    function historyRow(book) {
        const item = document.createElement('li');
        item.className = 'books-history-item';

        const link = document.createElement('a');
        link.className = 'books-history-link';
        link.href = `https://archive.org/details/${encodeURIComponent(book.identifier)}`;
        link.target = '_blank';
        link.rel = 'noopener';

        const date = document.createElement('time');
        date.className = 'books-history-date';
        date.dateTime = book.date;
        date.textContent = displayDate(book.date, { month: 'short', day: 'numeric', year: '2-digit' });

        const spine = document.createElement('span');
        spine.className = `books-history-spine spine-${hash(book.identifier) % 6}`;
        spine.setAttribute('aria-hidden', 'true');

        const copy = document.createElement('span');
        copy.className = 'books-history-copy';
        const title = document.createElement('strong');
        title.textContent = book.title;
        const creator = document.createElement('span');
        creator.textContent = book.creator;
        copy.append(title, creator);

        const arrow = document.createElement('span');
        arrow.className = 'books-history-arrow';
        arrow.setAttribute('aria-hidden', 'true');
        arrow.textContent = '↗';

        link.append(date, spine, copy, arrow);
        item.appendChild(link);
        return item;
    }

    function showHistory(books) {
        els.history.replaceChildren();
        const previous = books.slice(1);
        previous.forEach((book) => els.history.appendChild(historyRow(book)));
        els.historyEmpty.hidden = previous.length > 0;
        els.count.textContent = `${books.length} ${books.length === 1 ? 'book' : 'books'} held`;
    }

    function showError(error) {
        console.warn('[archive] history unavailable', error);
        els.book.hidden = true;
        els.book.classList.remove('is-ready');
        els.error.hidden = false;
        els.status.textContent = 'The shared book archive is unavailable.';
        els.status.classList.remove('is-complete');
        els.entry.setAttribute('aria-busy', 'false');
        els.count.textContent = 'Unavailable';
    }

    function scheduleNextCheck() {
        if (refreshTimer) clearTimeout(refreshTimer);
        const now = new Date();
        const today = localDateKey(now);
        let delay = STALE_RETRY_MS;

        if (latestArchiveDate >= today) {
            const nextCheck = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 32, 0);
            delay = nextCheck.getTime() - now.getTime();
        }

        refreshTimer = setTimeout(() => load(), Math.max(1000, delay));
    }

    async function load() {
        lastCheckedAt = Date.now();
        els.error.hidden = true;
        els.entry.setAttribute('aria-busy', 'true');
        els.status.textContent = 'Opening the shelf…';
        els.status.classList.remove('is-complete');

        try {
            const history = await readHistory();
            let books = history.books;
            const pharos = await readPharos();
            if (pharos.length) {
                books = mergeBooks(books, pharos);
                const powered = document.getElementById('books-powered');
                if (powered) powered.hidden = false;
            }
            latestArchiveDate = books[0].date;
            showBook(books[0]);
            showHistory(books);
        } catch (error) {
            showError(error);
        } finally {
            scheduleNextCheck();
        }
    }

    els.retry?.addEventListener('click', load);
    document.addEventListener('visibilitychange', () => {
        const staleDay = latestArchiveDate && latestArchiveDate < localDateKey();
        const staleCheck = Date.now() - lastCheckedAt > LONG_CHECK_MS;
        if (!document.hidden && (staleDay || staleCheck)) load();
    });
    load();
})();
