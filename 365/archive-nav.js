(() => {
    'use strict';

    // Site menu — the way OUT of the archive. Rendered on every page that loads
    // this script (the /365 index and each milestone page). iOS-safe: a real
    // button + a real scrim, each with its own handler, no hover-open.
    (function renderMenu() {
        if (!document.body || document.querySelector('.archive-menu-btn')) return;

        const links = [
            ['/', 'Home'],
            ['/365/', 'All 365'],
            ['/visuals', 'Visuals'],
            ['/music', 'Music'],
            ['/tbp', 'TBP'],
            ['/directory', 'Directory']
        ];

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'archive-menu-btn';
        btn.setAttribute('aria-label', 'Site menu');
        btn.setAttribute('aria-expanded', 'false');
        btn.innerHTML = '<span></span><span></span><span></span>';

        const scrim = document.createElement('div');
        scrim.className = 'archive-menu-scrim';

        const menu = document.createElement('nav');
        menu.className = 'archive-menu';
        menu.setAttribute('aria-label', 'Site');
        menu.innerHTML = links.map(([href, label]) => `<a href="${href}">${label}</a>`).join('');

        // Find the page's top bar (if any). A bar tagged [data-archive-inbar]
        // opts into the unified glass-bar pattern: the hamburger lives *inside*
        // that frosted bar. Every other page keeps the floating top-left button
        // whose masthead insets to clear it.
        const isMilestone = document.querySelector('[data-archive-day]');
        const bar = isMilestone && document.querySelector(
            '[data-archive-inbar], .about-masthead, .research-masthead, .masthead, .topbar, .rail, .navbar, .top-nav, .container > .header'
        );
        const inbar = !!(bar && bar.hasAttribute('data-archive-inbar'));

        const setOpen = (open) => {
            document.body.classList.toggle('archive-menu-open', open);
            btn.setAttribute('aria-expanded', String(open));
            // The frosted bar's height varies (a wrapped brand makes it taller),
            // so drop the dropdown just beneath the bar's actual bottom edge.
            if (open && inbar) {
                menu.style.top = `${Math.round(bar.getBoundingClientRect().bottom + 6)}px`;
            }
        };

        btn.addEventListener('click', (event) => {
            event.stopPropagation();
            setOpen(!document.body.classList.contains('archive-menu-open'));
        });
        scrim.addEventListener('click', () => setOpen(false));
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') setOpen(false);
        });

        if (inbar) {
            // Hamburger becomes the bar's leading element (keeps its glass-square
            // look; the bar frosts behind it).
            btn.classList.add('archive-menu-btn--inbar');
            bar.prepend(btn);
            menu.classList.add('archive-menu--inbar');
            document.body.append(scrim, menu);
            document.body.classList.add('has-archive-menu', 'has-archive-menu-inbar');
            // Publish the bar's height so a page whose masthead used to sit in
            // flow can pad its content clear of the now-pinned bar.
            const publishBarHeight = () => {
                document.body.style.setProperty(
                    '--archive-bar-h', `${Math.round(bar.getBoundingClientRect().height)}px`
                );
            };
            publishBarHeight();
            requestAnimationFrame(publishBarHeight);
            window.addEventListener('resize', publishBarHeight);
        } else {
            // Floating top-left button; the masthead insets its leading edge so
            // the "RG / …" mark clears it on narrow screens.
            if (bar) bar.classList.add('archive-menu-inset');
            if (isMilestone) document.body.classList.add('has-archive-menu-page');
            document.body.append(scrim, menu, btn);
            document.body.classList.add('has-archive-menu');
        }
    })();

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
        { day: 47, file: 'nova-about.html', accent: '#34d399' },
        { day: 55, file: 'americans.html', accent: '#ff2a6d' },
        { day: 58, file: 'sonnet45-thinking-partner.html', accent: '#d98c6a' },
        { day: 70, file: 'slingshot-matter.html', accent: '#0b97f5' },
        { day: 77, file: 'the-four-about.html', accent: '#ff5b8d' },
        { day: 89, file: 'music-room-about.html', accent: '#cd804c' },
        { day: 93, file: 'rg-claude-about.html', accent: '#4ade80' },
        { day: 95, file: 'day9.html', accent: '#00ff41' },
        { day: 96, file: 'day10.html', accent: '#ff6b00' },
        { day: 104, file: 'hermes-agent-about.html', accent: '#e7b95f' },
        { day: 106, file: 'warm-layer-about.html', accent: '#f0a860' },
        { day: 121, file: 'rgmodelserve-about.html', accent: '#78e7d1' },
        { day: 176, file: 'discord-pipeline-about.html', accent: '#8b9cff' },
        { day: 182, file: 'raccoongang-game-about.html', accent: '#7ee8d2' },
        { day: 185, file: 'rgcode-about.html', accent: '#5cc8ff' },
        { day: 187, file: 'fables-first-removal.html', accent: '#aeb8ff' },
        { day: 202, file: 'rg4o-about.html', accent: '#e0a26b' },
        { day: 213, href: '/deepseek-site/', accent: '#4D6BFE' },
        { day: 219, file: 'after-hours-switchboard.html', accent: '#e3a64b' }
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
