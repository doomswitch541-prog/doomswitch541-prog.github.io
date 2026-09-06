// One console, three views. This module never owns or changes the audio element.
const consoleRoot = document.getElementById('now-playing');
const panesRoot = document.getElementById('console-panes');
const handle = document.getElementById('dock-toggle');
const tabs = [...document.querySelectorAll('[data-console-view]')];
const siteMenuToggle = document.getElementById('site-menu-toggle');
const siteMenu = document.getElementById('broadcast-site-menu');
function closeSiteMenu(restoreFocus = false) {
    siteMenu.hidden = true;
    siteMenu.inert = true;
    siteMenuToggle.setAttribute('aria-expanded', 'false');
    if (restoreFocus) siteMenuToggle.focus({preventScroll:true});
}
siteMenuToggle.addEventListener('click', () => {
    if (!siteMenu.hidden) { closeSiteMenu(true); return; }
    siteMenu.hidden = false;
    siteMenu.inert = false;
    siteMenuToggle.setAttribute('aria-expanded', 'true');
    siteMenu.querySelector('a').focus({preventScroll:true});
});
document.addEventListener('pointerdown', event => {
    if (!siteMenu.hidden && !siteMenu.contains(event.target) && !siteMenuToggle.contains(event.target)) closeSiteMenu();
});
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const state = { view: 'channels', expanded: true, car: false };
const scrollPositions = new Map();
let animate;
let transition;
let transitionRun = 0;
let pointerStart;
let suppressClick = false;
let frame = { mode: 'receiver-state', state: 'idle', level: 0, transient: 0 };
const field = document.getElementById('station-field');
const stationObject = document.getElementById('station-object');
const beaconCore = document.querySelector('.beacon-core');
const discoveryTools = document.getElementById('discovery-tools');
const searchForm = document.getElementById('station-search');
const searchToggle = document.getElementById('search-toggle');
const toast = document.getElementById('receiver-toast');
let toastTimer;
let lastSignalPaint = 0;
let signalSummary = '';
let stationIdentity = '';
let stationTransition;
const viewScroller = view => document.getElementById(view === 'channels' ? 'station-list' : `pane-${view}`);

function setSearchOpen(open) {
    searchForm.hidden = !open;
    searchToggle.setAttribute('aria-expanded', String(open));
    searchToggle.querySelector('span').textContent = open ? 'Done' : 'Search';
    if (open) document.getElementById('search-query').focus({preventScroll:true});
    else if (searchForm.contains(document.activeElement)) searchToggle.focus({preventScroll:true});
}
searchToggle.addEventListener('click', () => {
    const open = searchForm.hidden;
    if (open) setConsoleView('channels', true);
    setSearchOpen(open);
});
searchForm.addEventListener('submit', () => {
    if (document.getElementById('search-query').value.trim()) setSearchOpen(false);
});
discoveryTools.addEventListener('click', event => {
    if (event.target.closest('[data-preset], #favorites-filter')) {
        setSearchOpen(false);
        if (!state.expanded) setConsoleView('channels', true);
        viewScroller('channels').scrollTop = 0;
    }
});

function updateFieldSpace() {
    const top = consoleRoot.getBoundingClientRect().top;
    const room = top - 82;
    document.documentElement.style.setProperty('--field-bottom', `${Math.max(0, innerHeight - top + 12)}px`);
    field.dataset.space = consoleRoot.dataset.keyboard === 'true' || room < 110 ? 'none' : room < 285 ? 'compact' : 'full';
}

// Optional visuals must not prevent the receiver from initializing.
void import('/echofield/vendor/animejs/anime.esm.min.js')
    .then(module => { animate = module.animate; })
    .catch(() => {});

export function publishSignalFrame(next) {
    frame = next;
    const now = performance.now();
    if (now - lastSignalPaint < 80) return;
    lastSignalPaint = now;
    const live = next.mode === 'audio-analysis';
    const playing = next.state === 'playing';
    const moving = !reduced.matches && (playing || next.state === 'loading');
    const strength = live ? next.level : (0.45 + Math.sin((next.phase || 0) * 0.35) * 0.08);
    stationObject.style.setProperty('--beacon-strength', String(playing ? 0.6 + strength * 0.35 : 0.4));
    beaconCore.style.transform = moving && live ? `scale(${1 + next.level * 0.055})` : '';
    const summary = `${next.mode}:${next.state}:${next.analysisAllowed}:${next.contextState}:${next.captureFailed}`;
    if (summary === signalSummary) return;
    signalSummary = summary;
    stationObject.dataset.state = next.state;
    const label = ({idle:'Ready',loading:'Tuning',playing:'On air',paused:'Paused',error:'No signal'})[next.state] || 'Ready';
    document.getElementById('field-state').textContent = label;
    document.getElementById('signal-playback').textContent = label;
    document.getElementById('field-analysis').textContent = live ? 'Audio reactive' : 'Receiver animation';
    document.getElementById('signal-method').textContent = live ? 'Measured audio' : 'Receiver state';
    document.getElementById('signal-explanation').textContent = live
        ? 'The trace and frequency bands follow samples from this playing stream.'
        : !next.analysisAllowed
            ? 'This station uses direct playback. Its stream is not enabled for browser audio analysis; the visual follows receiver state.'
            : next.contextState !== 'running'
                ? 'The browser audio analyser is not running. Direct playback is preserved; the visual follows receiver state.'
                : 'No usable audio samples reached the analyser. Playback is preserved; the visual follows receiver state.';
}

export function setConsoleView(view = state.view, expanded = true) {
    if (!['channels', 'signal', 'more'].includes(view)) return;
    scrollPositions.set(state.view, viewScroller(state.view).scrollTop);
    const oldHeight = consoleRoot.getBoundingClientRect().height;
    const run = ++transitionRun;
    transition?.cancel();
    document.querySelectorAll('.console-pane').forEach(pane => {
        pane.style.opacity = ''; pane.style.transform = '';
    });
    consoleRoot.style.height = '';
    state.view = view;
    state.expanded = expanded;
    consoleRoot.dataset.view = view;
    consoleRoot.dataset.expanded = String(expanded);
    panesRoot.inert = !expanded;
    panesRoot.hidden = !expanded;
    handle.setAttribute('aria-expanded', String(expanded));
    handle.setAttribute('aria-label', expanded ? 'Close radio panels' : 'Open radio panels');
    document.getElementById('dock-toggle-label').textContent = expanded ? 'Close' : 'Open';
    discoveryTools.hidden = view !== 'channels';
    discoveryTools.inert = view !== 'channels';
    if (!expanded || view !== 'channels') setSearchOpen(false);
    tabs.forEach(tab => {
        const active = expanded && tab.dataset.consoleView === view;
        tab.setAttribute('aria-expanded', String(active));
        const pane = document.getElementById(`pane-${tab.dataset.consoleView}`);
        if (!active && pane.contains(document.activeElement)) {
            (expanded ? document.getElementById(`tab-${view}`) : handle).focus({preventScroll:true});
        }
        pane.hidden = !active;
        pane.inert = !active;
    });
    const activePane = document.getElementById(`pane-${view}`);
    viewScroller(view).scrollTop = scrollPositions.get(view) || 0;
    const newHeight = consoleRoot.getBoundingClientRect().height;
    if (animate && !reduced.matches && Math.abs(oldHeight - newHeight) > 1) {
        consoleRoot.style.height = `${oldHeight}px`;
        transition = animate(consoleRoot, {
            height: [`${oldHeight}px`, `${newHeight}px`],
            duration: 380, ease: 'out(4)',
            onComplete: () => { if (run === transitionRun) consoleRoot.style.height = ''; }
        });
    } else if (animate && !reduced.matches && expanded) {
        transition = animate(activePane, {
            opacity: [0.55, 1], translateY: [5, 0], duration: 210, ease: 'out(3)',
            onComplete: () => { activePane.style.opacity = ''; activePane.style.transform = ''; }
        });
    }
}

export function setConsoleCarMode(enabled) {
    state.car = enabled;
    document.body.classList.toggle('car-mode-active', enabled);
    if (enabled) setConsoleView('channels', false);
    else setConsoleView('more', true);
    if (enabled) handle.focus({preventScroll:true});
    document.getElementById('car-mode-indicator').hidden = !enabled;
    toast.textContent = enabled ? 'Car mode on' : 'Car mode off';
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 2200);
    updateFieldSpace();
}

tabs.forEach(tab => tab.addEventListener('click', () => {
    setConsoleView(tab.dataset.consoleView, true);
}));
handle.addEventListener('click', () => {
    if (suppressClick) { suppressClick = false; return; }
    setConsoleView(state.view, !state.expanded);
});
handle.addEventListener('pointerdown', event => {
    pointerStart = {id:event.pointerId, y:event.clientY};
    suppressClick = false;
    handle.setPointerCapture(event.pointerId);
});
handle.addEventListener('pointerup', event => {
    if (!pointerStart || pointerStart.id !== event.pointerId) return;
    const distance = event.clientY - pointerStart.y;
    pointerStart = null;
    if (Math.abs(distance) > 30) {
        suppressClick = true;
        setConsoleView(state.view, distance < 0);
    }
});
handle.addEventListener('pointercancel', () => { pointerStart = null; suppressClick = false; });
document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || document.querySelector('dialog[open]')) return;
    if (!siteMenu.hidden) { event.preventDefault(); closeSiteMenu(true); return; }
    if (!searchForm.hidden) { event.preventDefault(); setSearchOpen(false); return; }
    if (state.expanded) {
        event.preventDefault();
        setConsoleView(state.view, false);
    }
});

function viewportChanged() {
    const viewport = window.visualViewport;
    const height = viewport?.height || innerHeight;
    document.documentElement.style.setProperty('--view-height', `${height}px`);
    document.documentElement.style.setProperty('--keyboard-offset', `${Math.max(0, innerHeight - height - (viewport?.offsetTop || 0))}px`);
    consoleRoot.dataset.keyboard = String(height < innerHeight * 0.75);
    ++transitionRun;
    transition?.cancel();
    consoleRoot.style.height = '';
    updateFieldSpace();
}
window.visualViewport?.addEventListener('resize', viewportChanged);
window.visualViewport?.addEventListener('scroll', viewportChanged);
window.addEventListener('resize', viewportChanged);
viewportChanged();
reduced.addEventListener('change', () => {
    viewportChanged();
    stationTransition?.cancel();
    stationObject.style.opacity = '';
    stationObject.style.transform = '';
    document.querySelectorAll('.console-pane').forEach(pane => {
        pane.style.transform = ''; pane.style.opacity = '';
    });
});

// Mirror explicit source text only, never a subtree containing our own writes.
function syncSignalTitle() {
    const text = id => document.getElementById(id).textContent;
    const name = text('current-name');
    const program = text('current-program');
    document.getElementById('signal-current-name').textContent = name;
    document.getElementById('signal-current-program').textContent = program;
    document.getElementById('field-station').textContent = name;
    document.getElementById('field-program').textContent = program;
    document.getElementById('field-format').textContent = text('current-genre');
    document.getElementById('signal-description').textContent = text('current-description');
    document.getElementById('signal-origin').textContent = text('current-origin');
    document.getElementById('signal-quality').textContent = text('current-quality');
    if (stationIdentity === name) return;
    stationIdentity = name;
    let seed = [...name].reduce((value, char) => (value * 31 + char.charCodeAt(0)) >>> 0, 541);
    const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    document.querySelectorAll('.beacon-stars circle').forEach((point, i) => {
        const angle = random() * Math.PI * 2;
        const radius = 48 + random() * 27;
        point.setAttribute('cx', String(100 + Math.cos(angle) * radius));
        point.setAttribute('cy', String(100 + Math.sin(angle) * radius));
        point.setAttribute('r', String(i === 0 ? 3 : 1.5));
    });
    const bearing = random() * 70 - 35;
    document.querySelector('.beacon-orbits').style.transform = `rotate(${bearing}deg)`;
    stationTransition?.cancel();
    stationObject.style.opacity = '';
    stationObject.style.transform = '';
    if (animate && !reduced.matches) {
        stationTransition = animate(stationObject, {
            opacity:[0.4,1], translateY:[4,0], duration:650, ease:'out(3)',
            onComplete:() => { stationObject.style.opacity = ''; stationObject.style.transform = ''; }
        });
    }
}
const titleObserver = new MutationObserver(syncSignalTitle);
['current-name','current-program','current-genre','current-description','current-origin','current-quality']
    .forEach(id => titleObserver.observe(document.getElementById(id), {childList:true,characterData:true,subtree:true}));
syncSignalTitle();
const fieldObserver = new ResizeObserver(updateFieldSpace);
fieldObserver.observe(consoleRoot);
const controls = document.querySelector('.player-controls');
const controlsObserver = new ResizeObserver(() => {
    consoleRoot.style.setProperty('--controls-height', `${controls.getBoundingClientRect().height}px`);
});
controlsObserver.observe(controls);

function initializeStars() {
    const THREE = window.THREE;
    const canvas = document.getElementById('broadcast-stars');
    if (!THREE || !canvas) return;
    let renderer;
    try { renderer = new THREE.WebGLRenderer({canvas, alpha:true, antialias:false, powerPreference:'low-power'}); }
    catch { return; }
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 40);
    camera.position.z = 12;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(180 * 3);
    // Stable star locations; brightness is atmosphere, not pretend audio analysis.
    let seed = 541;
    const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < positions.length; i += 3) {
        positions[i] = (random() - 0.5) * 27;
        positions[i + 1] = (random() - 0.5) * 24;
        positions[i + 2] = (random() - 0.5) * 10;
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({color:0xb8d9de, size:0.035, transparent:true, opacity:0.43, depthWrite:false});
    const stars = new THREE.Points(geometry, material);
    scene.add(stars);
    let stopped = false;
    let raf = 0;
    let last = 0;
    let dirty = true;
    let travelPhase = 0;
    function resize() {
        renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
        renderer.setSize(innerWidth, innerHeight, false);
        camera.aspect = innerWidth / innerHeight;
        camera.updateProjectionMatrix();
        dirty = true;
    }
    function render(time) {
        if (stopped || document.hidden) return;
        raf = requestAnimationFrame(render);
        if (time - last < 42) return;
        const delta = Math.min(time - last, 100);
        last = time;
        const playing = frame.state === 'playing' && !reduced.matches;
        if (playing) {
            // Slow forward drift reads as a receiving field, not a spinning sky.
            travelPhase += delta * 0.00003;
            stars.position.z = Math.sin(travelPhase) * (state.car ? 0.6 : 0.2);
            material.opacity = (state.car ? 0.52 : 0.43) + (frame.mode === 'audio-analysis' ? frame.level * 0.12 : 0);
        }
        if (playing || dirty) { renderer.render(scene, camera); dirty = false; }
    }
    canvas.addEventListener('webglcontextlost', event => {
        event.preventDefault(); stopped = true; cancelAnimationFrame(raf); canvas.hidden = true;
    });
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', () => {
        cancelAnimationFrame(raf);
        if (!document.hidden && !stopped) { last = 0; dirty = true; raf = requestAnimationFrame(render); }
    });
    reduced.addEventListener('change', () => { dirty = true; });
    resize();
    raf = requestAnimationFrame(render);
}
if (document.readyState === 'complete') initializeStars();
else window.addEventListener('load', initializeStars, {once:true});
