(() => {
    'use strict';

    const pages = [
        { day: 1, file: 'motel.html', accent: '#ff2a6d' },
        { day: 2, file: 'luxurytierhomeless.html', accent: '#8b5cf6' },
        { day: 3, file: 'resonance.html', accent: '#10b9ba' },
        { day: 4, file: 'raccoongang.html', accent: '#7dd3c0' },
        { day: 5, file: 'day5.html', accent: '#d7c7a4' },
        { day: 6, file: 'day6.html', accent: '#ffeaa7' },
        { day: 7, file: 'day7.html', accent: '#00f5ff' },
        { day: 8, file: 'solarflare-about.html', accent: '#10b981' },
        { day: 15, file: 'knowledgebase-about.html', accent: '#a78bfa' },
        { day: 16, file: 'rginfv1-started.html', accent: '#4a9eff' },
        { day: 17, file: 'motionviz-about.html', accent: '#54f0b2' },
        { day: 20, file: 'rginfv1-about.html', accent: '#e94560' },
        { day: 23, file: 'rginfv1-memory.html', accent: '#a78bfa' },
        { day: 30, file: 'long-context-research.html', accent: '#f6c453' },
        { day: 33, file: 'corpus-about.html', accent: '#69a9ff' },
        { day: 40, file: 'karpathy-agent-studies.html', accent: '#fb923c' },
        { day: 45, file: 'rgclaw-about.html', accent: '#fb923c' },
        { day: 46, file: 'raccoongang-started.html', accent: '#9ddb74' },
        { day: 55, file: 'americans.html', accent: '#ff2a6d' },
        { day: 77, file: 'the-four-about.html', accent: '#ff5b8d' },
        { day: 95, file: 'day9.html', accent: '#00ff41' },
        { day: 96, file: 'day10.html', accent: '#ff6b00' },
        { day: 104, file: 'hermes-agent-about.html', accent: '#e7b95f' },
        { day: 121, file: 'rgmodelserve-about.html', accent: '#78e7d1' },
        { day: 176, file: 'discord-pipeline-about.html', accent: '#8b9cff' },
        { day: 182, file: 'raccoongang-game-about.html', accent: '#7ee8d2' },
        { day: 213, href: '/deepseek-site/', accent: '#4D6BFE' }
    ];

    const nav = document.querySelector('[data-archive-day]');
    if (!nav) return;

    const day = Number(nav.dataset.archiveDay);
    const currentIndex = pages.findIndex(page => page.day === day);
    if (currentIndex < 0) return;

    const current = pages[currentIndex];
    const previous = pages[currentIndex - 1];
    const next = pages[currentIndex + 1];
    const link = (page, direction, glyph) => page
        ? `<a href="${page.href || `/365/${page.file}`}" rel="${direction}" aria-label="${direction === 'prev' ? 'Previous' : 'Next'} available page, Day ${page.day}">${glyph}</a>`
        : `<a class="archive-boundary" aria-hidden="true" tabindex="-1">${glyph}</a>`;

    nav.className = 'archive-pagination';
    nav.style.setProperty('--archive-accent', current.accent);
    nav.innerHTML = `
        ${link(previous, 'prev', '←')}
        <span class="archive-page-position">DAY ${current.day} / 365</span>
        ${link(next, 'next', '→')}
        <a href="/365/" aria-label="View all 365 days">⊞</a>
    `;

    document.addEventListener('keydown', event => {
        if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
        if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target?.isContentEditable) return;

        const destination = event.key === 'ArrowLeft' ? previous : event.key === 'ArrowRight' ? next : null;
        if (!destination) return;

        event.preventDefault();
        event.stopImmediatePropagation();
        window.location.href = destination.href || `/365/${destination.file}`;
    }, true);
})();
