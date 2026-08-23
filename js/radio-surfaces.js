const SENSITIVE_QUERY_KEYS = new Set([
    'api_key', 'apikey', 'key', 'token', 'access_token', 'client_secret',
    'signature', 'sig'
]);

export function safeSurfaceUrl(rawUrl) {
    try {
        const url = new URL(rawUrl, location.href);
        url.username = '';
        url.password = '';
        [...url.searchParams.keys()].forEach(key => {
            if (SENSITIVE_QUERY_KEYS.has(key.toLowerCase())) {
                url.searchParams.set(key, '[redacted]');
            }
        });
        return url.toString();
    } catch {
        return String(rawUrl || '');
    }
}

function makeElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
}

export function createRadioSurfaceMonitor({ root, summary }) {
    const list = typeof root === 'string' ? document.getElementById(root) : root;
    const summaryNode = typeof summary === 'string' ? document.getElementById(summary) : summary;
    const entries = new Map();

    function renderSummary() {
        if (!summaryNode) return;
        const values = [...entries.values()];
        const ready = values.filter(entry => entry.state === 'ready').length;
        const checking = values.filter(entry => entry.state === 'checking').length;
        const failed = values.filter(entry => entry.state === 'error').length;
        if (checking) summaryNode.textContent = `${checking} CHECKING`;
        else if (ready || failed) summaryNode.textContent = `${ready} LIVE / ${failed} FAIL`;
        else summaryNode.textContent = `${values.length} KNOWN`;
    }

    function render() {
        if (!list) return;
        list.replaceChildren();
        const fragment = document.createDocumentFragment();

        entries.forEach(entry => {
            const row = makeElement('div', 'radio-surface-row');
            row.dataset.state = entry.state;

            const dot = makeElement('span', 'radio-surface-dot');
            dot.setAttribute('aria-hidden', 'true');

            const copy = makeElement('div', 'radio-surface-copy');
            const classification = makeElement(
                'span',
                'radio-surface-kind',
                `${entry.kind}  ·  ${entry.auth}`
            );
            const name = makeElement('strong', 'radio-surface-name', entry.name);
            const url = makeElement('code', 'radio-surface-url', safeSurfaceUrl(entry.url));
            const detail = makeElement('span', 'radio-surface-detail', entry.detail);
            copy.append(classification, name, url, detail);

            const status = makeElement('b', 'radio-surface-status', entry.label);
            row.append(dot, copy, status);
            fragment.appendChild(row);
        });

        if (!entries.size) {
            fragment.appendChild(makeElement(
                'p',
                'radio-surfaces-empty',
                'No network surfaces have been touched yet.'
            ));
        }
        list.appendChild(fragment);
        renderSummary();
    }

    function report(id, update) {
        const previous = entries.get(id) || {
            id,
            kind: 'NETWORK SURFACE',
            auth: 'NO KEY',
            name: id,
            url: '',
            state: 'idle',
            label: 'KNOWN',
            detail: 'Not contacted yet.'
        };
        entries.set(id, { ...previous, ...update, id });
        render();
    }

    function clear(prefix = '') {
        [...entries.keys()].forEach(id => {
            if (!prefix || id.startsWith(prefix)) entries.delete(id);
        });
        render();
    }

    render();
    return { report, clear };
}
