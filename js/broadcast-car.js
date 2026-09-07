import { setConsoleCarMode } from '/js/broadcast-console.js?v=20260907-3';
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
    { src: '/music/broadcast/icons/rg-broadcast-v2-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/music/broadcast/icons/rg-broadcast-v2-512.png', sizes: '512x512', type: 'image/png' }
];


let audio = document.getElementById('radio-audio');
const nowPlaying = document.getElementById('now-playing');
const currentName = document.getElementById('current-name');
const currentProgram = document.getElementById('current-program');
const playerStatus = document.getElementById('player-status');
const carModeToggle = document.getElementById('car-mode-toggle');
const carModeShortcut = document.getElementById('car-mode-shortcut');
const carModeMessage = document.getElementById('car-mode-message');
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


let carModeActive = false;
let customCarMessage = readStoredMessage();
let customCarMessageStored = Boolean(customCarMessage);
let dimPreference = readStoredFlag(CAR_DIM_KEY);
let awakePreference = readStoredFlag(CAR_AWAKE_KEY);
let wakeLockSentinel = null;
let wakeLockReleasing = false;
let metadataRefreshAt = 0;
let carAudioEvents;

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

function normalizeCarMessage(value, { final = true } = {}) {
    const collapsed = String(value || '').replace(/\s+/g, ' ');
    const normalized = final ? collapsed.trim() : collapsed.trimStart();
    return Array.from(normalized)
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


function currentMessage() {
    if (customCarMessage) return customCarMessage;
    const album = navigator.mediaSession?.metadata?.album;
    return String(album || CAR_MESSAGES[0]);
}


function syncCarTextPreview() {
    const candidate = normalizeCarMessage(carTextInput.value, { final: false });
    if (candidate !== carTextInput.value) carTextInput.value = candidate;
    carTextCount.textContent = `${Array.from(candidate).length} / ${CAR_MESSAGE_LIMIT}`;
    carTextPreviewTitle.textContent = currentProgram.textContent;
    carTextPreviewArtist.textContent = currentName.textContent;
    carTextPreviewAlbum.textContent = candidate || currentMessage();
}


function syncCarDisplay() {
    carModeShortcut.setAttribute('aria-pressed', String(carModeActive));
    carModeShortcut.setAttribute('aria-label', carModeActive ? 'Exit Car Mode' : 'Enter Car Mode');
    carModeShortcut.title = carModeActive ? 'Exit Car Mode' : 'Car Mode';
    carModeMessage.textContent = currentMessage();
    carTextState.textContent = customCarMessage
        ? (customCarMessageStored ? 'Custom' : 'This visit') : 'RG rotation';
    if (carTextSheet.open) syncCarTextPreview();
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
}


function enterCarMode({ persist = true } = {}) {
    if (carModeActive) return;
    carModeActive = true;
    carModeToggle.setAttribute('aria-pressed', 'true');
    carModeToggle.setAttribute('aria-label', 'Exit Car Mode');
    carModeToggle.querySelector('.car-mode-button-label').textContent = 'Exit Car Mode';
    if (persist) writeStoredFlag(CAR_MODE_KEY, true);
    setConsoleCarMode(true);
    applyDimPreference();
    syncCarDisplay();
    publishVehicleMetadata();
    void requestWakeLock();
}

async function exitCarMode() {
    if (!carModeActive) return;
    carModeActive = false;
    carModeToggle.setAttribute('aria-pressed', 'false');
    carModeToggle.setAttribute('aria-label', 'Enter Car Mode');
    carModeToggle.querySelector('.car-mode-button-label').textContent = 'Car Mode';
    writeStoredFlag(CAR_MODE_KEY, false);
    setConsoleCarMode(false);
    syncCarDisplay();
    await releaseWakeLock();
    updateWakeLockControl();
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


function bindInteraction() {
    carModeShortcut.addEventListener('click', () => {
        if (carModeActive) void exitCarMode();
        else enterCarMode();
    });
    carModeToggle.addEventListener('click', () => {
        if (carModeActive) void exitCarMode();
        else enterCarMode();
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
        carTextOpen.focus({ preventScroll: true });
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
        if (event.defaultPrevented || event.key !== 'Escape' || !carModeActive || carTextSheet.open) return;
        event.preventDefault();
        exitCarMode();
    });
    document.addEventListener('visibilitychange', async () => {
        if (document.visibilityState === 'hidden') await releaseWakeLock();
        else if (carModeActive && awakePreference) await requestWakeLock();
        updateWakeLockControl();
    });
    window.addEventListener('online', syncCarDisplay);
    window.addEventListener('offline', syncCarDisplay);
    bindCarAudio();
    window.addEventListener('broadcast:audio-replaced', event => {
        audio = event.detail.audio;
        bindCarAudio();
        syncCarDisplay();
    });
}


function bindCarAudio() {
    carAudioEvents?.abort();
    carAudioEvents = new AbortController();
    const options = { signal: carAudioEvents.signal };
    audio.addEventListener('timeupdate', () => {
        const now = Date.now();
        if (now - metadataRefreshAt < 2000) return;
        metadataRefreshAt = now;
        publishVehicleMetadata();
        syncCarDisplay();
    }, options);
    ['playing', 'pause', 'waiting', 'error', 'stalled'].forEach(eventName => {
        audio.addEventListener(eventName, () => window.setTimeout(syncCarDisplay, 0), options);
    });
}


applyDimPreference();
updateWakeLockControl();
bindInteraction();
syncCarDisplay();
publishVehicleMetadata();

// Observe only source text and state attributes, never the subtree we update.
const observer = new MutationObserver(() => {
    syncCarDisplay();
    publishVehicleMetadata();
});
observer.observe(nowPlaying, {attributes:true, attributeFilter:['data-state']});
[currentName, currentProgram, playerStatus].forEach(node => {
    observer.observe(node, {childList:true, characterData:true, subtree:true});
});
if (readStoredFlag(CAR_MODE_KEY)) enterCarMode({persist:false});
