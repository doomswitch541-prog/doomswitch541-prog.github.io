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

// Optional visuals must not prevent the receiver from initializing.
void import('/echofield/vendor/animejs/anime.esm.min.js')
    .then(module => { animate = module.animate; })
    .catch(() => {});

export function publishSignalFrame(next) {
    frame = next;
}

export function setConsoleView(view = state.view, expanded = true) {
    if (!['channels', 'signal', 'more'].includes(view)) return;
    const previousPane = document.getElementById(`pane-${state.view}`);
    scrollPositions.set(state.view, previousPane.scrollTop);
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
    handle.setAttribute('aria-label', expanded ? 'Contract radio' : 'Expand radio');
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
    activePane.scrollTop = scrollPositions.get(view) || 0;
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
}
window.visualViewport?.addEventListener('resize', viewportChanged);
window.visualViewport?.addEventListener('scroll', viewportChanged);
window.addEventListener('resize', viewportChanged);
viewportChanged();
reduced.addEventListener('change', () => {
    viewportChanged();
    document.querySelectorAll('.console-pane').forEach(pane => {
        pane.style.transform = ''; pane.style.opacity = '';
    });
});

// Mirror just the two source text nodes; never observe the console subtree.
function syncSignalTitle() {
    document.getElementById('signal-current-name').textContent = document.getElementById('current-name').textContent;
    document.getElementById('signal-current-program').textContent = document.getElementById('current-program').textContent;
}
const titleObserver = new MutationObserver(syncSignalTitle);
['current-name', 'current-program'].forEach(id => titleObserver.observe(document.getElementById(id), {childList:true, characterData:true, subtree:true}));
syncSignalTitle();

// Keep keyboard focus and scrollIntoView below the sticky discovery controls.
const channelTools = document.querySelector('.channel-tools');
const channelPane = document.getElementById('pane-channels');
const toolsObserver = new ResizeObserver(() => {
    channelPane.style.scrollPaddingTop = `${channelTools.getBoundingClientRect().height + 8}px`;
});
toolsObserver.observe(channelTools);
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
            stars.rotation.y += delta * 0.000003;
            material.opacity = 0.43 + (frame.mode === 'audio-analysis' ? frame.level * 0.12 : 0);
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
