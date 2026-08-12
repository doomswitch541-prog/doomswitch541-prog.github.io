(() => {
    'use strict';

    const normalizePath = path => {
        if (path === '/365') return '/365/';
        const normalized = path.replace(/\/index\.html$/, '/');
        return normalized || '/365/';
    };

    const path = normalizePath(window.location.pathname);
    const marker = document.querySelector('[data-archive-day], [data-archive-key]');
    const day = marker?.dataset.archiveDay ? Number(marker.dataset.archiveDay) : null;
    const key = marker?.dataset.archiveKey || null;
    const route = day
        ? `365.day.${day}`
        : key
            ? `365.arc.${key}`
            : path === '/365/'
                ? '365.index'
                : `365.path.${path.slice('/365/'.length).replace(/\/$/, '').replace(/[^a-z0-9]+/gi, '.')}`;

    const context = Object.freeze({ collection: '365', route, path, day, key });

    document.documentElement.dataset.analyticsCollection = context.collection;
    document.documentElement.dataset.analyticsRoute = context.route;

    Object.defineProperty(window, 'RGAnalyticsContext', {
        configurable: false,
        enumerable: true,
        writable: false,
        value: context
    });

    window.dispatchEvent(new CustomEvent('rg:analytics-context', { detail: context }));
})();
