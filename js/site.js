// === RG HQ — clock, backgrounds, theme, idle ===
// Lifted from the raccoongang clock project and stripped for static hosting:
// no /api/* calls. Background manifest is inline; weather goes straight to
// Open-Meteo from the browser. Health panel and news ticker were backend-only
// and are gone. Design system untouched (css/styles.css).

// === Static background manifest (was GET /api/backgrounds) ===
// Files live in /assets/backgrounds/. Original clock set — the two Discord
// photos are in that folder but deliberately NOT in this rotation.
const BG = '/assets/backgrounds/';
const BACKGROUND_MANIFEST = {
    day:       [BG + 'bg-day-1.png', BG + 'bg-day-2.jpg', BG + 'bg-day-3.png'],
    afternoon: [BG + 'bg-afternoon-1.jpg', BG + 'bg-afternoon-2.jpg'],
    evening:   [BG + 'bg-evening-1.jpg', BG + 'bg-evening-2.jpg', BG + 'bg-evening-3.png'],
    night:     [BG + 'bg-night-1.png', BG + 'bg-night-2.png', BG + 'bg-night-3.png', BG + 'bg-night-4.png'],
};

// === Shared Navigation ===
const SiteNavigation = {
    links: [
        ['/', 'Home'],
        ['/clock', 'Clock'],
        ['/screensaver', 'Screensaver'],
        ['/visuals', 'Visuals'],
        ['/365', '365'],
        ['/fun', 'Fun'],
        ['/weather', 'Weather'],
        ['/directory', 'Directory'],
    ],

    init() {
        const path = location.pathname.replace(/\.html$/, '').replace(/\/$/, '') || '/';

        // Theme menu lives in the pill's right side (unchanged).
        const navRight = document.querySelector('.nav-right');
        if (navRight && document.getElementById('theme-switch') && !document.getElementById('theme-menu')) {
            const themeMenu = document.createElement('div');
            themeMenu.id = 'theme-menu';
            themeMenu.className = 'theme-menu';
            themeMenu.innerHTML = renderThemeButtons();
            navRight.appendChild(themeMenu);
        }

        // The pill stays as it is (RG + theme). Navigation now lives in a
        // corner button that opens a slide-out drawer.
        if (document.querySelector('.navbar') && !document.querySelector('.nav-menu-btn')) {
            this.buildDrawer(path);
        }
    },

    buildDrawer(path) {
        const btn = document.createElement('button');
        btn.className = 'nav-menu-btn';
        btn.setAttribute('aria-label', 'Open menu');
        btn.setAttribute('aria-expanded', 'false');
        btn.innerHTML = '<span class="bars"><span></span><span></span><span></span></span>';

        const scrim = document.createElement('div');
        scrim.className = 'nav-scrim';

        const drawer = document.createElement('aside');
        drawer.className = 'nav-drawer';
        drawer.setAttribute('aria-hidden', 'true');
        drawer.innerHTML =
            '<div class="nav-drawer-head">' +
                '<span class="nav-drawer-brand">RG&nbsp;HQ</span>' +
                '<button class="nav-drawer-close" aria-label="Close menu">&times;</button>' +
            '</div>' +
            '<nav class="nav-drawer-links">' +
                this.links.map(([href, label], i) =>
                    `<a href="${href}" style="--i:${i}"${path === href ? ' aria-current="page"' : ''}>` +
                    `<span class="nav-drawer-label">${label}</span><span class="nav-drawer-arrow">&rsaquo;</span></a>`
                ).join('') +
            '</nav>';

        document.body.append(scrim, drawer, btn);

        // iOS-safe open/close: real <button> + a real scrim element each own their
        // own click handler. No document-level click race, no CSS :hover opening —
        // both of which were why the tap-to-open failed on iPhone.
        const open = () => {
            document.body.classList.add('nav-open');
            btn.setAttribute('aria-expanded', 'true');
            drawer.setAttribute('aria-hidden', 'false');
        };
        const close = () => {
            document.body.classList.remove('nav-open');
            btn.setAttribute('aria-expanded', 'false');
            drawer.setAttribute('aria-hidden', 'true');
        };
        btn.addEventListener('click', () =>
            document.body.classList.contains('nav-open') ? close() : open());
        scrim.addEventListener('click', close);
        drawer.querySelector('.nav-drawer-close').addEventListener('click', close);
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    },
};

function renderThemeButtons() {
    return [
        ['auto', 'Auto'], ['day', 'Day'], ['afternoon', 'Afternoon'],
        ['evening', 'Evening'], ['night', 'Night'],
    ].map(([theme, label]) => `<button data-theme="${theme}"${theme === 'auto' ? ' class="active"' : ''}>${label}</button>`).join('');
}

// === Theme Management ===
const ThemeManager = {
    currentTheme: 'auto',
    activeTheme: null,
    manifest: BACKGROUND_MANIFEST,
    rotationIndex: {},
    rotationTimer: null,
    ROTATE_MS: 10 * 60 * 1000,
    STATES: ['day', 'afternoon', 'evening', 'night'],

    init() {
        for (const s of this.STATES) this.rotationIndex[s] = 0;
        const saved = localStorage.getItem('rg-theme-mode') || 'auto';
        this.setTheme(saved);
        this.setupEventListeners();
        this.updateTimeBasedTheme();
        setInterval(() => this.updateTimeBasedTheme(), 60000);
    },

    rotateBackground(theme) {
        const layer = document.getElementById(`bg-${theme}`);
        const list = this.manifest[theme];
        if (!layer || !list || !list.length) return;

        const url = list[this.rotationIndex[theme] % list.length];
        this.rotationIndex[theme]++;

        const img = new Image();
        img.onload = () => {
            const wasActive = layer.classList.contains('active');
            if (wasActive) layer.classList.remove('active');
            layer.offsetHeight; // force reflow so the fade replays
            layer.style.backgroundImage = `url("${url}")`;
            if (wasActive || this.activeTheme === theme) {
                requestAnimationFrame(() => layer.classList.add('active'));
            }
            this.preloadNext(theme);
        };
        img.onerror = () => console.warn(`[bg] failed to load ${url}`);
        img.src = url;
    },

    preloadNext(theme) {
        const list = this.manifest[theme];
        if (!list || list.length < 2) return;
        new Image().src = list[this.rotationIndex[theme] % list.length];
    },

    applyConcreteTheme(theme) {
        const html = document.documentElement;
        this.activeTheme = theme;

        for (const s of this.STATES) {
            const layer = document.getElementById(`bg-${s}`);
            if (!layer) continue;
            layer.classList.toggle('active', s === theme);
        }
        html.setAttribute('data-theme', theme);

        const activeLayer = document.getElementById(`bg-${theme}`);
        if (activeLayer && !activeLayer.style.backgroundImage && this.manifest[theme]?.length) {
            const url = this.manifest[theme][0];
            this.rotationIndex[theme] = 1;
            activeLayer.style.backgroundImage = `url("${url}")`;
            this.preloadNext(theme);
        }

        if (this.rotationTimer) clearInterval(this.rotationTimer);
        if ((this.manifest[theme]?.length || 0) > 1) {
            this.rotationTimer = setInterval(() => this.rotateBackground(theme), this.ROTATE_MS);
        }
    },

    setTheme(mode) {
        this.currentTheme = mode;
        localStorage.setItem('rg-theme-mode', mode);

        const themeSwitch = document.getElementById('theme-switch');
        if (themeSwitch) {
            themeSwitch.textContent = mode === 'auto' ? 'Auto' : mode.charAt(0).toUpperCase() + mode.slice(1);
        }
        document.querySelectorAll('.theme-menu button').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.theme === mode);
        });

        if (mode === 'auto') this.updateTimeBasedTheme();
        else if (this.STATES.includes(mode)) this.applyConcreteTheme(mode);
    },

    //   06:00–11:59 → day · 12:00–16:59 → afternoon
    //   17:00–19:59 → evening · 20:00–05:59 → night
    pickThemeForHour(hour) {
        if (hour >= 6 && hour < 12) return 'day';
        if (hour >= 12 && hour < 17) return 'afternoon';
        if (hour >= 17 && hour < 20) return 'evening';
        return 'night';
    },

    updateTimeBasedTheme() {
        if (this.currentTheme !== 'auto') return;
        const next = this.pickThemeForHour(new Date().getHours());
        if (next !== this.activeTheme) this.applyConcreteTheme(next);
    },

    setupEventListeners() {
        const themeSwitch = document.getElementById('theme-switch');
        const themeMenu = document.getElementById('theme-menu');

        if (themeSwitch && themeMenu) {
            themeSwitch.addEventListener('click', (e) => {
                e.stopPropagation();
                themeMenu.classList.toggle('active');
            });
            themeMenu.querySelectorAll('button').forEach(btn => {
                btn.addEventListener('click', () => {
                    this.setTheme(btn.dataset.theme);
                    themeMenu.classList.remove('active');
                });
            });
            document.addEventListener('click', () => themeMenu.classList.remove('active'));
        }

        // "Swap" button — rotates to the next background in the active theme.
        if (themeSwitch && !document.getElementById('bg-swap-btn')) {
            const btn = document.createElement('button');
            btn.id = 'bg-swap-btn';
            btn.className = 'btn';
            btn.title = 'Swap background';
            btn.textContent = '⤾';
            btn.addEventListener('click', (e) => { e.stopPropagation(); this.swapBackground(); });
            themeSwitch.parentElement.insertBefore(btn, themeSwitch);
        }
    },

    swapBackground() {
        const theme = this.activeTheme;
        if (!theme) return;
        const list = this.manifest[theme] || [];
        if (list.length < 2) return;
        this.rotateBackground(theme);
    }
};

// === Clock ===
const ClockManager = {
    init() {
        this.generateHourMarkers();
        this.animate();
    },

    generateHourMarkers() {
        const container = document.getElementById('hour-markers');
        if (!container) return;
        let svg = '';
        for (let i = 0; i < 60; i++) {
            const angle = i * 6;
            const isHour = i % 5 === 0;
            const innerR = isHour ? 82 : 86;
            const outerR = 88;
            const x1 = 100 + innerR * Math.sin(angle * Math.PI / 180);
            const y1 = 100 - innerR * Math.cos(angle * Math.PI / 180);
            const x2 = 100 + outerR * Math.sin(angle * Math.PI / 180);
            const y2 = 100 - outerR * Math.cos(angle * Math.PI / 180);
            const className = isHour ? 'hour-marker major' : 'hour-marker';
            svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="${className}"/>`;
        }
        container.innerHTML = svg;
    },

    update() {
        const now = new Date();
        const hours = now.getHours();
        const minutes = now.getMinutes();
        const seconds = now.getSeconds();
        const milliseconds = now.getMilliseconds();

        const displayHours = hours % 12 || 12;
        const ampm = hours >= 12 ? 'PM' : 'AM';

        const elHours = document.getElementById('hours');
        const elMinutes = document.getElementById('minutes');
        const elSeconds = document.getElementById('seconds');
        const elAmPm = document.getElementById('ampm');
        const elDate = document.getElementById('date');

        if (elHours) elHours.textContent = String(displayHours).padStart(2, '0');
        if (elMinutes) elMinutes.textContent = String(minutes).padStart(2, '0');
        if (elSeconds) elSeconds.textContent = String(seconds).padStart(2, '0');
        if (elAmPm) elAmPm.textContent = ampm;

        if (elDate) {
            const options = { weekday: 'long', month: 'long', day: 'numeric' };
            elDate.textContent = now.toLocaleDateString('en-US', options);
        }

        this.updateAnalog(hours, minutes, seconds, milliseconds);
    },

    updateAnalog(hours, minutes, seconds, milliseconds) {
        const hourHand = document.getElementById('hour-hand');
        const minuteHand = document.getElementById('minute-hand');
        const secondHand = document.getElementById('second-hand');
        if (!hourHand || !minuteHand || !secondHand) return;

        const hourAngle = ((hours % 12) + minutes / 60) * 30;
        const minuteAngle = (minutes + seconds / 60) * 6;
        const secondAngle = (seconds + milliseconds / 1000) * 6;

        hourHand.style.transform = `rotate(${hourAngle}deg)`;
        minuteHand.style.transform = `rotate(${minuteAngle}deg)`;
        secondHand.style.transform = `rotate(${secondAngle}deg)`;
    },

    animate() {
        this.update();
        requestAnimationFrame(() => this.animate());
    }
};

// The home weather pill previously requested precise device location only to
// populate a decorative readout. Keep the dormant markup out of view without
// prompting for a permission the site does not otherwise need.
function disableLocationWeather() {
    const pill = document.getElementById('weather');
    if (!pill) return;
    pill.hidden = true;
    pill.setAttribute('aria-hidden', 'true');
}

// === Idle Mode (screensaver-only) ===
// Fades chrome after IDLE_MS of no input. Any input wakes. Only runs where a
// .clock-section is present.
const IdleManager = {
    IDLE_MS: 2 * 60 * 1000,
    timer: null,

    init() {
        if (!document.querySelector('.clock-section')) return;
        const wake = () => this.wake();
        const opts = { passive: true };
        ['mousemove', 'mousedown', 'keydown', 'touchstart', 'wheel', 'scroll'].forEach(ev => {
            window.addEventListener(ev, wake, opts);
        });
        this.scheduleSleep();
    },

    scheduleSleep() {
        if (this.timer) clearTimeout(this.timer);
        this.timer = setTimeout(() => document.body.classList.add('idle'), this.IDLE_MS);
    },

    wake() {
        if (document.body.classList.contains('idle')) document.body.classList.remove('idle');
        this.scheduleSleep();
    },
};

// === Init ===
document.addEventListener('DOMContentLoaded', () => {
    SiteNavigation.init();
    ThemeManager.init();
    if (document.getElementById('hours')) ClockManager.init();
    IdleManager.init();
    disableLocationWeather();
});
