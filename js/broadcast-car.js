const FAVORITES_KEY = 'rg-broadcast-favorites-v1';
const CAR_MODE_KEY = 'rg-broadcast-car-mode-v1';
const CAR_DIM_KEY = 'rg-broadcast-car-dim-v1';
const CAR_AWAKE_KEY = 'rg-broadcast-car-awake-v1';
const CAR_MESSAGE_KEY = 'rg-broadcast-car-message-v1';
const CAR_MESSAGE_LIMIT = 48;
const CAR_MESSAGES = [
    'RG Broadcast 🦝🦝 📻🛰️',
    'RG NIGHT SIGNAL 🌙📡',
    'RG OPEN-WEB RADIO 🌐📻'
];
const CAR_ARTWORK = [
    { src: '/music/broadcast/icons/rg-broadcast-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/music/broadcast/icons/rg-broadcast-512.png', sizes: '512x512', type: 'image/png' }
];

const audio = document.getElementById('radio-audio');
const nowPlaying = document.getElementById('now-playing');
const airLabel = document.getElementById('air-label');
const currentName = document.getElementById('current-name');
const currentProgramLabel = document.getElementById('current-program-label');
const currentProgram = document.getElementById('current-program');
const playerStatus = document.getElementById('player-status');
const favoriteCount = document.getElementById('favorite-count');
const favoritesFilter = document.getElementById('favorites-filter');
const stationList = document.getElementById('station-list');
const playerControls = document.querySelector('.player-controls');
const carModeToggle = document.getElementById('car-mode-toggle');
const carMode = document.getElementById('car-mode');
const carModeStation = document.getElementById('car-mode-station');
const carModeProgramLabel = document.getElementById('car-mode-program-label');
const carModeTitle = document.getElementById('car-mode-title');
const carModeMessage = document.getElementById('car-mode-message');
const carModeState = document.getElementById('car-mode-state');
const carModeStatus = document.getElementById('car-mode-status');
const dockToggle = document.getElementById('dock-toggle');
const carDockPanel = document.getElementById('car-dock-panel');
const carDockState = document.getElementById('car-dock-state');
const carDockMessage = document.getElementById('car-dock-message');
const carSignalFigure = document.querySelector('.signal-scope');
const carSignalCanvas = document.getElementById('car-signal-scope');
const carSavedTrack = document.getElementById('car-saved-track');
const carSavedCount = document.getElementById('car-saved-count');
const carSavedEmpty = document.getElementById('car-saved-empty');
const carTextOpen = document.getElementById('car-text-open');
const carTextState = document.getElementById('car-text-state');
const carAwakeToggle = document.getElementById('car-awake-toggle');
const carAwakeState = document.getElementById('car-awake-state');
const carDimToggle = document.getElementById('car-dim-toggle');
const carDimState = document.getElementById('car-dim-state');
const carTextSheet = document.getElementById('car-text-sheet');
const carTextForm = document.getElementById('car-text-form');
const carTextClose = document.getElementById('car-text-close');
const carTextReset = document.getElementById('car-text-reset');
const carTextInput = document.getElementById('car-text-input');
const carTextCount = document.getElementById('car-text-count');
const carTextNote = document.getElementById('car-text-note');
const carTextPreviewTitle = document.getElementById('car-text-preview-title');
const carTextPreviewArtist = document.getElementById('car-text-preview-artist');
const carTextPreviewAlbum = document.getElementById('car-text-preview-album');

const requiredNodes = [
    audio, nowPlaying, airLabel, currentName, currentProgramLabel, currentProgram,
    playerStatus, stationList, playerControls, carModeToggle, carMode, dockToggle,
    carDockPanel, carSignalCanvas, carSavedTrack, carTextSheet
];

let initialized = false;
let carModeActive = false;
let dockExpanded = false;
let customCarMessage = readStoredMessage();
let customCarMessageStored = Boolean(customCarMessage);
let dimPreference = readStoredFlag(CAR_DIM_KEY);
let awakePreference = readStoredFlag(CAR_AWAKE_KEY);
let wakeLockSentinel = null;
let wakeLockReleasing = false;
let dockPointerStart = null;
let suppressDockClick = false;
let scopeFrame = null;
let scopeVisible = false;
let scopePhase = 0;
let previousScopeState = 'idle';
let metadataRefreshAt = 0;
const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

function readStoredFlag(key) {
    try {
        return localStorage.getItem(key) === 'true';
    } catch {
        return false;
    }
}

function writeStoredFlag(key, enabled) {
    try {
        if (enabled) localStorage.setItem(key, 'true');
        else localStorage.removeItem(key);
        return true;
    } catch {
        return false;
    }
}

function normalizeCarMessage(value) {
    return Array.from(String(value || '').replace(/\s+/g, ' ').trim())
        .slice(0, CAR_MESSAGE_LIMIT)
        .join('');
}

function readStoredMessage() {
    try {
        return normalizeCarMessage(localStorage.getItem(CAR_MESSAGE_KEY));
    } catch {
        return '';
    }
}

function readFavorites() {
    try {
        const favorites = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
        if (!Array.isArray(favorites)) return [];
        const seen = new Set();
        return favorites.filter(station => {
            const uuid = String(station?.stationuuid || '');
            if (!uuid || !station?.url_resolved || seen.has(uuid)) return false;
            seen.add(uuid);
            return true;
        });
    } catch {
        return [];
    }
}

function currentMessage() {
    if (customCarMessage) return customCarMessage;
    const album = navigator.mediaSession?.metadata?.album;
    return String(album || CAR_MESSAGES[0]);
}

function effectiveState() {
    if (navigator.onLine === false) return 'offline';
    return nowPlaying.dataset.state || 'idle';
}

function renderFavorites() {
    const favorites = readFavorites();
    const fragment = document.createDocumentFragment();
    favorites.forEach(station => {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.uuid = station.stationuuid;
        button.textContent = station.name;
        button.setAttribute('aria-label', `Play saved station ${station.name}`);
        button.setAttribute('aria-current', String(station.stationuuid === audio.dataset.uuid));
        fragment.appendChild(button);
    });
    carSavedTrack.replaceChildren(fragment);
    carSavedCount.textContent = `${favorites.length} SAVED`;
    carSavedEmpty.hidden = favorites.length > 0;
}

function syncCarTextPreview() {
    const candidate = normalizeCarMessage(carTextInput.value);
    if (candidate !== carTextInput.value) carTextInput.value = candidate;
    carTextCount.textContent = `${Array.from(candidate).length} / ${CAR_MESSAGE_LIMIT}`;
    carTextPreviewTitle.textContent = currentProgram.textContent;
    carTextPreviewArtist.textContent = currentName.textContent;
    carTextPreviewAlbum.textContent = candidate || currentMessage();
}

function syncCarDisplay() {
    const state = effectiveState();
    const offline = state === 'offline';
    const stateLabel = offline ? 'OFFLINE' : airLabel.textContent;
    const status = offline
        ? 'Live stations need a connection. The receiver remains available.'
        : playerStatus.textContent;

    carMode.dataset.state = state;
    carSignalFigure.dataset.state = state;
    playerControls.dataset.carState = state;
    carModeStation.textContent = currentName.textContent;
    carModeProgramLabel.textContent = currentProgramLabel.textContent;
    carModeTitle.textContent = currentProgram.textContent;
    carModeMessage.textContent = currentMessage();
    carModeState.textContent = stateLabel;
    carModeStatus.textContent = status;
    carDockState.textContent = stateLabel;
    carDockMessage.textContent = status;
    carTextState.textContent = customCarMessage
        ? (customCarMessageStored ? 'CUSTOM' : 'THIS VISIT')
        : 'RG ROTATION';
    if (carTextSheet.open) syncCarTextPreview();
    renderFavorites();
    requestScopeFrame();
}

function publishVehicleMetadata({ resetAlbum = false } = {}) {
    if (!('mediaSession' in navigator) || !('MediaMetadata' in window)) return;
    const station = currentName.textContent.trim();
    const program = currentProgram.textContent.trim();
    if (!station || station === 'Choose a station') return;
    const existing = navigator.mediaSession.metadata;
    const album = customCarMessage
        || (resetAlbum ? CAR_MESSAGES[0] : String(existing?.album || CAR_MESSAGES[0]));
    try {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: program || String(existing?.title || station),
            artist: station,
            album,
            artwork: CAR_ARTWORK
        });
    } catch {
        // Vehicle artwork is optional and never allowed to interrupt playback.
    }
}

function setDockExpanded(expanded) {
    dockExpanded = Boolean(expanded);
    playerControls.classList.toggle('dock-expanded', dockExpanded);
    dockToggle.setAttribute('aria-expanded', String(dockExpanded));
    dockToggle.setAttribute('aria-label', dockExpanded ? 'Collapse receiver dock' : 'Expand receiver dock');
    const label = dockToggle.querySelector('b');
    if (label) label.textContent = dockExpanded ? 'CLOSE DOCK' : 'SIGNAL DOCK';
    carDockPanel.setAttribute('aria-hidden', String(!dockExpanded));
    carDockPanel.inert = !dockExpanded;
    if (dockExpanded) {
        scopeVisible = true;
        syncCarDisplay();
        requestScopeFrame();
        return;
    }
    if (carDockPanel.contains(document.activeElement)) dockToggle.focus({ preventScroll: true });
    scopeVisible = false;
    if (scopeFrame !== null) cancelAnimationFrame(scopeFrame);
    scopeFrame = null;
}

function setCarRegionsInert(active) {
    [
        '.radio-nav-anchor',
        '.connection-status',
        '.receiver-title',
        '.now-playing > .on-air',
        '.now-playing > .station-readout',
        '.now-playing > .station-actions',
        '.now-playing > .player-status',
        '.now-playing > .band-console',
        '.directory',
        '.broadcast-foot'
    ].forEach(selector => {
        const element = document.querySelector(selector);
        if (element) element.inert = active;
    });
}

async function releaseWakeLock() {
    const sentinel = wakeLockSentinel;
    if (!sentinel) return;
    wakeLockSentinel = null;
    wakeLockReleasing = true;
    try {
        await sentinel.release();
    } catch {
        // A system release can win the race.
    } finally {
        wakeLockReleasing = false;
    }
}

function updateWakeLockControl(state = '') {
    const available = 'wakeLock' in navigator;
    carAwakeToggle.setAttribute('aria-pressed', String(awakePreference));
    if (!available) carAwakeState.textContent = 'UNAVAILABLE';
    else if (!awakePreference) carAwakeState.textContent = 'OFF';
    else if (wakeLockSentinel) carAwakeState.textContent = 'ON';
    else if (state) carAwakeState.textContent = state;
    else carAwakeState.textContent = carModeActive ? 'AUTO-LOCK' : 'READY';
}

async function requestWakeLock() {
    if (!awakePreference || !carModeActive || document.visibilityState !== 'visible') {
        updateWakeLockControl(document.visibilityState === 'visible' ? '' : 'AUTO-LOCK');
        return;
    }
    if (!('wakeLock' in navigator)) {
        updateWakeLockControl('UNAVAILABLE');
        return;
    }
    if (wakeLockSentinel) {
        updateWakeLockControl();
        return;
    }
    try {
        const sentinel = await navigator.wakeLock.request('screen');
        if (!awakePreference || !carModeActive) {
            await sentinel.release();
            return;
        }
        wakeLockSentinel = sentinel;
        sentinel.addEventListener('release', () => {
            if (wakeLockSentinel === sentinel) wakeLockSentinel = null;
            updateWakeLockControl(wakeLockReleasing ? '' : 'AUTO-LOCK');
        }, { once: true });
        updateWakeLockControl();
    } catch {
        updateWakeLockControl('AUTO-LOCK');
    }
}

function applyDimPreference() {
    document.body.classList.toggle('car-mode-dim', dimPreference);
    carDimToggle.setAttribute('aria-pressed', String(dimPreference));
    carDimState.textContent = dimPreference ? 'ON' : 'OFF';
    requestScopeFrame();
}

function enterCarMode({ persist = true } = {}) {
    if (carModeActive) return;
    carModeActive = true;
    setDockExpanded(false);
    carMode.hidden = false;
    carMode.setAttribute('aria-hidden', 'false');
    document.body.classList.add('car-mode-active');
    document.body.classList.remove('search-active');
    carModeToggle.setAttribute('aria-expanded', 'true');
    carModeToggle.setAttribute('aria-label', 'Exit Car Mode');
    carModeToggle.querySelector('.car-mode-button-label').textContent = 'EXIT CAR MODE';
    setCarRegionsInert(true);
    if (persist) writeStoredFlag(CAR_MODE_KEY, true);
    applyDimPreference();
    syncCarDisplay();
    publishVehicleMetadata();
    requestWakeLock();
}

async function exitCarMode({ persist = true, restoreFocus = true } = {}) {
    if (!carModeActive) return;
    carModeActive = false;
    setDockExpanded(false);
    await releaseWakeLock();
    carMode.hidden = true;
    carMode.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('car-mode-active');
    carModeToggle.setAttribute('aria-expanded', 'false');
    carModeToggle.setAttribute('aria-label', 'Enter Car Mode');
    carModeToggle.querySelector('.car-mode-button-label').textContent = 'CAR MODE';
    setCarRegionsInert(false);
    if (persist) writeStoredFlag(CAR_MODE_KEY, false);
    updateWakeLockControl();
    if (restoreFocus) carModeToggle.focus({ preventScroll: true });
}

function openCarTextSheet() {
    if (typeof carTextSheet.showModal !== 'function') {
        carTextNote.textContent = 'Car Text is unavailable in this browser.';
        return;
    }
    carTextInput.value = customCarMessage;
    carTextNote.textContent = 'Stored only on this device.';
    syncCarTextPreview();
    carTextSheet.showModal();
    carTextInput.focus();
}

function closeCarTextSheet() {
    if (carTextSheet.open && typeof carTextSheet.close === 'function') carTextSheet.close();
}

function saveCarText() {
    const message = normalizeCarMessage(carTextInput.value);
    if (!message) {
        carTextNote.textContent = 'Enter text, or restore the RG rotation.';
        carTextInput.focus();
        return;
    }
    customCarMessage = message;
    let stored = false;
    try {
        localStorage.setItem(CAR_MESSAGE_KEY, message);
        stored = true;
    } catch {
        // The custom line remains active for this visit.
    }
    customCarMessageStored = stored;
    publishVehicleMetadata();
    syncCarDisplay();
    carTextNote.textContent = stored
        ? 'Saved on this device.'
        : 'Storage unavailable. Text is active for this visit.';
    if (stored) closeCarTextSheet();
}

function resetCarText() {
    customCarMessage = '';
    customCarMessageStored = false;
    try {
        localStorage.removeItem(CAR_MESSAGE_KEY);
    } catch {
        // The rotating messages are still restored for this visit.
    }
    carTextInput.value = '';
    publishVehicleMetadata({ resetAlbum: true });
    syncCarDisplay();
    carTextNote.textContent = 'RG rotation restored.';
    closeCarTextSheet();
}

function playSavedStation(uuid) {
    const findRow = () => [...stationList.querySelectorAll('.station-row')]
        .find(candidate => candidate.dataset.uuid === uuid);
    let row = findRow();
    if (!row && favoritesFilter?.getAttribute('aria-pressed') !== 'true') {
        favoritesFilter?.click();
        row = findRow();
    }
    const select = row?.querySelector('.station-select');
    if (!select) {
        carDockMessage.textContent = 'Open Saved stations in the receiver and try again.';
        return;
    }
    setDockExpanded(false);
    select.click();
}

function scopeShouldAnimate() {
    const state = effectiveState();
    return scopeVisible
        && dockExpanded
        && document.visibilityState === 'visible'
        && !reducedMotionQuery.matches
        && (state === 'loading' || state === 'playing');
}

function drawScopeLine(context, points, color, width = 2) {
    context.beginPath();
    points.forEach(([x, y], index) => {
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
    });
    context.strokeStyle = color;
    context.lineWidth = width;
    context.stroke();
}

function drawSignalScope(now = performance.now()) {
    const bounds = carSignalCanvas.getBoundingClientRect();
    const width = Math.round(bounds.width);
    const height = Math.round(bounds.height);
    if (width < 2 || height < 2) return;
    const context = carSignalCanvas.getContext('2d');
    if (!context) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const pixelWidth = Math.round(width * ratio);
    const pixelHeight = Math.round(height * ratio);
    if (carSignalCanvas.width !== pixelWidth || carSignalCanvas.height !== pixelHeight) {
        carSignalCanvas.width = pixelWidth;
        carSignalCanvas.height = pixelHeight;
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    context.strokeStyle = 'rgba(230, 220, 195, 0.10)';
    context.lineWidth = 1;
    [0.25, 0.5, 0.75].forEach(mark => {
        context.beginPath();
        context.moveTo(0, Math.round(height * mark) + 0.5);
        context.lineTo(width, Math.round(height * mark) + 0.5);
        context.stroke();
    });

    const state = effectiveState();
    const center = height / 2;
    const reduced = reducedMotionQuery.matches;
    if (state === 'playing' && !reduced) scopePhase = now / 1000;
    if (previousScopeState === 'playing' && state === 'paused' && !scopePhase) scopePhase = now / 1000;
    previousScopeState = state;

    if (state === 'offline' || state === 'error') {
        const red = getComputedStyle(document.body).getPropertyValue('--red').trim() || '#d34f3f';
        [
            [[0, center], [width * 0.16, center], [width * 0.23, center - 18]],
            [[width * 0.31, center + 14], [width * 0.47, center - 6]],
            [[width * 0.57, center + 11], [width * 0.7, center + 11], [width * 0.76, center - 20]],
            [[width * 0.85, center + 17], [width, center + 17]]
        ].forEach(points => drawScopeLine(context, points, red, 2));
        return;
    }

    if (state === 'loading') {
        const phase = reduced ? 0.42 : (now / 1100) % 1;
        const pulseX = phase * (width + 80) - 40;
        const points = [];
        for (let x = 0; x <= width; x += 4) {
            const distance = (x - pulseX) / 34;
            const pulse = Math.exp(-(distance * distance)) * 27;
            points.push([x, center - pulse + Math.sin(x * 0.08) * pulse * 0.18]);
        }
        const amber = getComputedStyle(document.body).getPropertyValue('--amber').trim() || '#e6a04a';
        drawScopeLine(context, points, amber, 2);
        return;
    }

    if (state === 'playing' || state === 'paused') {
        const phase = reduced ? 0.8 : (scopePhase || 0.8);
        const points = [];
        for (let x = 0; x <= width; x += 3) {
            const envelope = 0.45 + 0.55 * Math.sin((x / Math.max(width, 1)) * Math.PI);
            const wave = Math.sin(x * 0.075 + phase * 3.2) * 12
                + Math.sin(x * 0.021 - phase * 1.7) * 7
                + Math.sin(x * 0.19 + phase) * 3;
            points.push([x, center + wave * envelope]);
        }
        const styles = getComputedStyle(document.body);
        const green = styles.getPropertyValue('--green').trim() || '#86b59c';
        const amber = styles.getPropertyValue('--amber').trim() || '#e6a04a';
        const gradient = context.createLinearGradient(0, 0, width, 0);
        gradient.addColorStop(0, green);
        gradient.addColorStop(0.78, green);
        gradient.addColorStop(1, amber);
        drawScopeLine(context, points, gradient, state === 'paused' ? 1.5 : 2);
        return;
    }

    const baseline = [];
    for (let x = 0; x <= width; x += 5) baseline.push([x, center + Math.sin(x * 0.04) * 1.25]);
    drawScopeLine(context, baseline, 'rgba(147, 142, 130, 0.72)', 1);
}

function runScopeFrame(now) {
    scopeFrame = null;
    drawSignalScope(now);
    if (scopeShouldAnimate()) scopeFrame = requestAnimationFrame(runScopeFrame);
}

function requestScopeFrame() {
    if (scopeFrame === null) scopeFrame = requestAnimationFrame(runScopeFrame);
}

function bindInteraction() {
    carModeToggle.addEventListener('click', () => {
        if (carModeActive) exitCarMode();
        else enterCarMode();
    });
    dockToggle.addEventListener('click', () => {
        if (suppressDockClick) {
            suppressDockClick = false;
            return;
        }
        setDockExpanded(!dockExpanded);
    });
    playerControls.addEventListener('pointerdown', event => {
        if (event.pointerType === 'mouse' || event.target.closest('.transport, .car-dock-control, .car-saved-track button')) return;
        dockPointerStart = {
            pointerId: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            fromHandle: Boolean(event.target.closest('.mini-player-handle'))
        };
    });
    playerControls.addEventListener('pointerup', event => {
        const start = dockPointerStart;
        dockPointerStart = null;
        if (!start || start.pointerId !== event.pointerId) return;
        const xDistance = event.clientX - start.x;
        const yDistance = event.clientY - start.y;
        if (Math.abs(yDistance) < 42 || Math.abs(yDistance) <= Math.abs(xDistance) * 1.15) return;
        setDockExpanded(yDistance < 0);
        suppressDockClick = start.fromHandle;
    });
    playerControls.addEventListener('pointercancel', () => {
        dockPointerStart = null;
    });
    carSavedTrack.addEventListener('click', event => {
        const button = event.target.closest('button[data-uuid]');
        if (button) playSavedStation(button.dataset.uuid);
    });
    carTextOpen.addEventListener('click', openCarTextSheet);
    carTextClose.addEventListener('click', closeCarTextSheet);
    carTextReset.addEventListener('click', resetCarText);
    carTextInput.addEventListener('input', syncCarTextPreview);
    carTextForm.addEventListener('submit', event => {
        event.preventDefault();
        saveCarText();
    });
    carTextSheet.addEventListener('click', event => {
        if (event.target === carTextSheet) closeCarTextSheet();
    });
    carTextSheet.addEventListener('close', () => {
        if (dockExpanded) carTextOpen.focus({ preventScroll: true });
    });
    carAwakeToggle.addEventListener('click', async () => {
        awakePreference = !awakePreference;
        writeStoredFlag(CAR_AWAKE_KEY, awakePreference);
        if (awakePreference) await requestWakeLock();
        else {
            await releaseWakeLock();
            updateWakeLockControl();
        }
    });
    carDimToggle.addEventListener('click', () => {
        dimPreference = !dimPreference;
        writeStoredFlag(CAR_DIM_KEY, dimPreference);
        applyDimPreference();
    });
    document.addEventListener('keydown', event => {
        if (event.key !== 'Escape' || !carModeActive || carTextSheet.open) return;
        event.preventDefault();
        exitCarMode();
    });
    document.addEventListener('visibilitychange', async () => {
        if (document.visibilityState === 'hidden') await releaseWakeLock();
        else if (carModeActive && awakePreference) await requestWakeLock();
        updateWakeLockControl();
        requestScopeFrame();
    });
    window.addEventListener('online', syncCarDisplay);
    window.addEventListener('offline', syncCarDisplay);
    if (typeof reducedMotionQuery.addEventListener === 'function') {
        reducedMotionQuery.addEventListener('change', requestScopeFrame);
    } else if (typeof reducedMotionQuery.addListener === 'function') {
        reducedMotionQuery.addListener(requestScopeFrame);
    }
    audio.addEventListener('timeupdate', () => {
        const now = Date.now();
        if (now - metadataRefreshAt < 2000) return;
        metadataRefreshAt = now;
        publishVehicleMetadata();
        syncCarDisplay();
    });
    ['playing', 'pause', 'waiting', 'error', 'stalled'].forEach(eventName => {
        audio.addEventListener(eventName, () => window.setTimeout(syncCarDisplay, 0));
    });
}

function initialize() {
    if (initialized || requiredNodes.some(node => !node)) return;
    initialized = true;
    setDockExpanded(false);
    applyDimPreference();
    updateWakeLockControl();
    bindInteraction();
    renderFavorites();
    syncCarDisplay();
    publishVehicleMetadata();

    const observer = new MutationObserver(() => {
        syncCarDisplay();
        publishVehicleMetadata();
    });
    [nowPlaying, airLabel, currentName, currentProgramLabel, currentProgram, playerStatus, favoriteCount]
        .filter(Boolean)
        .forEach(node => {
            if (node === nowPlaying) {
                observer.observe(node, {
                    attributes: true,
                    attributeFilter: ['data-state']
                });
                return;
            }
            observer.observe(node, { childList: true, characterData: true, subtree: true });
        });

    if ('IntersectionObserver' in window) {
        const scopeObserver = new IntersectionObserver(entries => {
            scopeVisible = Boolean(entries[0]?.isIntersecting) && dockExpanded;
            requestScopeFrame();
        });
        scopeObserver.observe(carSignalCanvas);
    }
    if ('ResizeObserver' in window) {
        const resizeObserver = new ResizeObserver(requestScopeFrame);
        resizeObserver.observe(carSignalCanvas);
    }
    if (readStoredFlag(CAR_MODE_KEY)) enterCarMode({ persist: false });
}

if (requiredNodes.every(Boolean)) {
    if (stationList.getAttribute('aria-busy') === 'false' || stationList.children.length) {
        initialize();
    } else {
        const receiverObserver = new MutationObserver(() => {
            if (stationList.getAttribute('aria-busy') !== 'false' && !stationList.children.length) return;
            receiverObserver.disconnect();
            initialize();
        });
        receiverObserver.observe(stationList, { attributes: true, childList: true });
    }
}
