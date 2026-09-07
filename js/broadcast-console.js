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
let searchTransition;
const controlMotions = new Map();
const viewScroller = view => document.getElementById(view === 'channels' ? 'station-list' : `pane-${view}`);

// Respond to contact itself across the receiver, then settle on release/cancel.
const pressedControls = new Map();
const eligibleControl = event => {
    const control = event.target.closest('button, a');
    return control && control.closest('.broadcast-app') && !control.disabled
        && control.getAttribute('aria-disabled') !== 'true' ? control : null;
};
function moveControl(control, release, keyboard = false) {
    if (!animate || reduced.matches) return;
    controlMotions.get(control)?.cancel();
    const pressedScale = control.classList.contains('station-select') ? .99 : .975;
    const motion = animate(control, {
        scale:keyboard ? [pressedScale,1] : release ? 1 : pressedScale,
        duration:release ? 230 : 90, ease:'out(3)',
        onComplete:() => {
            if (release) control.style.transform = '';
            controlMotions.delete(control);
        }
    });
    controlMotions.set(control, motion);
}
document.addEventListener('pointerdown', event => {
    const control = eligibleControl(event);
    if (!control || event.button !== 0) return;
    pressedControls.set(event.pointerId, control);
    moveControl(control, false);
}, {passive:true});
const releaseControl = event => {
    const control = pressedControls.get(event.pointerId);
    if (!control) return;
    pressedControls.delete(event.pointerId);
    moveControl(control, true);
};
document.addEventListener('pointerup', releaseControl, {passive:true});
document.addEventListener('pointercancel', releaseControl, {passive:true});
window.addEventListener('blur', () => {
    pressedControls.forEach(control => moveControl(control,true));
    pressedControls.clear();
});
document.addEventListener('click', event => {
    const control = eligibleControl(event);
    if (control && event.detail === 0) moveControl(control,true,true);
});

function setSearchOpen(open) {
    const restoreFocus = !open && searchForm.contains(document.activeElement);
    if (restoreFocus) document.activeElement.blur();
    searchForm.hidden = !open;
    searchToggle.setAttribute('aria-expanded', String(open));
    searchToggle.querySelector('span').textContent = open ? 'Done' : 'Search';
    if (open) document.getElementById('search-query').focus({preventScroll:true});
    else if (restoreFocus) searchToggle.focus({preventScroll:true});
    searchTransition?.cancel();
    searchForm.style.opacity = '';
    if (open && animate && !reduced.matches) {
        searchTransition = animate(searchForm, {
            opacity:[0.5,1], duration:180, ease:'out(3)',
            onComplete:() => { searchForm.style.opacity = ''; }
        });
    }
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
const categoryRail = document.getElementById('station-mode-track');
const categorySelector = categoryRail.parentElement;
const categoryBack = document.getElementById('category-back');
const categoryForward = document.getElementById('category-forward');
let categoryMotion;
let cueMotion;
let cueShown = false;
function updateCategoryCues() {
    const left = categoryRail.scrollLeft > 2;
    const right = categoryRail.scrollWidth - categoryRail.clientWidth - categoryRail.scrollLeft > 2;
    categorySelector.dataset.scrollLeft = String(left);
    categorySelector.dataset.scrollRight = String(right);
    categoryBack.setAttribute('aria-disabled', String(!left));
    categoryForward.setAttribute('aria-disabled', String(!right));
    if (right && animate && !reduced.matches && !cueShown) {
        cueShown = true;
        cueMotion = animate(categoryForward.querySelector('svg'), {
            translateX:[-3,3,0], duration:900, ease:'inOut(3)',
            onComplete:() => { categoryForward.querySelector('svg').style.transform = ''; }
        });
    }
}
function stepCategories(direction) {
    const button = direction < 0 ? categoryBack : categoryForward;
    if (button.getAttribute('aria-disabled') === 'true') return;
    categoryMotion?.cancel();
    const target = Math.max(0, Math.min(categoryRail.scrollWidth - categoryRail.clientWidth,
        categoryRail.scrollLeft + direction * categoryRail.clientWidth * 0.8));
    if (animate && !reduced.matches) {
        categoryMotion = animate(categoryRail, {scrollLeft:target, duration:360, ease:'out(4)'});
    } else categoryRail.scrollLeft = target;
}
categoryBack.addEventListener('click', () => stepCategories(-1));
categoryForward.addEventListener('click', () => stepCategories(1));
categoryRail.addEventListener('pointerdown', () => categoryMotion?.cancel(), {passive:true});
categoryRail.addEventListener('wheel', () => categoryMotion?.cancel(), {passive:true});
categoryRail.addEventListener('scroll', updateCategoryCues, {passive:true});
const categoryObserver = new ResizeObserver(updateCategoryCues);
categoryObserver.observe(categoryRail);
updateCategoryCues();

function updateFieldSpace() {
    const top = consoleRoot.getBoundingClientRect().top;
    const room = top - 82;
    document.documentElement.style.setProperty('--field-bottom', `${Math.max(0, innerHeight - top + 12)}px`);
    field.dataset.space = consoleRoot.dataset.keyboard === 'true' || room < 110 ? 'none' : room < 360 ? 'compact' : 'full';
}

// Optional visuals must not prevent the receiver from initializing.
void import('/echofield/vendor/animejs/anime.esm.min.js')
    .then(module => { animate = module.animate; updateCategoryCues(); })
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
    discoveryTools.hidden = !expanded || view !== 'channels';
    discoveryTools.inert = !expanded || view !== 'channels';
    searchToggle.hidden = !expanded;
    if (!expanded) closeSiteMenu();
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
    document.body.dataset.keyboard = consoleRoot.dataset.keyboard;
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
    pressedControls.forEach(control => { control.style.transform = ''; });
    pressedControls.clear();
    controlMotions.forEach((motion, control) => { motion.cancel(); control.style.transform = ''; });
    controlMotions.clear();
    categoryMotion?.cancel();
    cueMotion?.cancel();
    categoryForward.querySelector('svg').style.transform = '';
    viewportChanged();
    stationTransition?.cancel();
    stationObject.style.opacity = '';
    stationObject.style.transform = '';
    searchTransition?.cancel();
    searchForm.style.opacity = '';
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
    document.getElementById('field-format').hidden = program.trim().toLowerCase() === text('current-genre').trim().toLowerCase();
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
    void import('./broadcast-sky.js?v=20260907-1')
        .then(module => module.createBroadcastSky({getFrame:() => frame, getCarMode:() => state.car, reduced}))
        .catch(() => { delete document.body.dataset.sky; });
}
if (document.readyState === 'complete') initializeStars();
else window.addEventListener('load', initializeStars, {once:true});
