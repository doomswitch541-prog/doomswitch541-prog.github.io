import { createRadioSurfaceMonitor } from '/js/radio-surfaces.js';

const BOOTSTRAP_SERVER = 'https://all.api.radio-browser.info';
const FALLBACK_SERVERS = [
    'https://de1.api.radio-browser.info',
    'https://nl1.api.radio-browser.info',
    'https://at1.api.radio-browser.info'
];
const FAVORITES_KEY = 'rg-broadcast-favorites-v1';
const LAST_STATION_KEY = 'rg-broadcast-last-station-v1';
const RESULT_LIMIT = 50;
const SIGNAL_TEST_LIMIT = 30;
const SIGNAL_TEST_TIMEOUT = 9000;
const SIGNAL_TEST_CONCURRENCY = 4;
const BAND_FREQUENCIES = [88.1, 90.3, 92.7, 95.1, 97.5, 100.1, 102.5, 104.9, 106.3, 107.7];
const BAND_LOCK_DISTANCE = 0.42;
const NEWS_TERMS = ['Bloomberg', 'CNN', 'Fox News'];
const CONSPIRACY_TAGS = ['conspiracy', 'conspiracy theories', 'paranormal', 'ufo', 'uap'];
const OFFICIAL_NEWS_STATIONS = [{
    stationuuid: 'official-alex-jones-network',
    name: 'Alex Jones Network',
    url_resolved: 'https://stream.alexjones.media/stream/7/',
    homepage: 'https://alexjones.media/',
    countrycode: 'US',
    codec: 'AAC+',
    bitrate: 32,
    tags: 'infowars,news,talk',
    hls: false,
    lastcheckok: true,
    source: 'official'
}];

const audio = document.getElementById('radio-audio');
const nowPlaying = document.getElementById('now-playing');
const airLabel = document.getElementById('air-label');
const currentName = document.getElementById('current-name');
const currentDetail = document.getElementById('current-detail');
const playerStatus = document.getElementById('player-status');
const playToggle = document.getElementById('play-toggle');
const playStateLabel = document.getElementById('play-state-label');
const previousButton = document.getElementById('previous-station');
const nextButton = document.getElementById('next-station');
const favoriteToggle = document.getElementById('favorite-toggle');
const favoriteCount = document.getElementById('favorite-count');
const favoritesFilter = document.getElementById('favorites-filter');
const shareButton = document.getElementById('share-station');
const stationHome = document.getElementById('station-home');
const bandConsole = document.getElementById('band-console');
const bandFrequency = document.getElementById('band-frequency');
const bandState = document.getElementById('band-state');
const bandTuner = document.getElementById('band-tuner');
const bandMarkers = document.getElementById('band-markers');
const bandMeter = [...document.querySelectorAll('.band-meter i')];
const searchForm = document.getElementById('station-search');
const searchQuery = document.getElementById('search-query');
const searchField = document.getElementById('search-field');
const presetButtons = [...document.querySelectorAll('[data-preset]')];
const presetTrack = document.getElementById('station-mode-track');
const previousPresetButton = document.getElementById('previous-station-mode');
const nextPresetButton = document.getElementById('next-station-mode');
const presetPosition = document.getElementById('station-mode-position');
const resultsLabel = document.getElementById('results-label');
const testSignalsButton = document.getElementById('test-signals');
const randomButton = document.getElementById('random-station');
const stationList = document.getElementById('station-list');
const directoryMessage = document.getElementById('directory-message');
const directoryMessageCopy = document.getElementById('directory-message-copy');
const retryButton = document.getElementById('retry-directory');
const surfaceMonitor = createRadioSurfaceMonitor({
    root: 'broadcast-surface-list',
    summary: 'broadcast-surface-summary'
});

let apiServers = [];
let stations = [];
let currentStation = null;
let currentIndex = -1;
let lastRequest = { kind: 'us' };
let favoritesOnly = false;
let favorites = loadFavorites();
let playbackRun = 0;
let playPending = false;
let signalTestRun = 0;
let stationRequestRun = 0;
let bandStations = [];
const signalResults = new Map();
const supportsNativeHls = audio.canPlayType('application/vnd.apple.mpegurl') !== '';

function timeoutSignal(milliseconds) {
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
        return AbortSignal.timeout(milliseconds);
    }
    const controller = new AbortController();
    window.setTimeout(() => controller.abort(), milliseconds);
    return controller.signal;
}

function loadFavorites() {
    try {
        const stored = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
        if (!Array.isArray(stored)) return [];
        return stored.filter(item => item && item.stationuuid && item.url_resolved);
    } catch {
        return [];
    }
}

function saveFavorites() {
    try {
        localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
    } catch {
        // Favorites remain usable for this visit if storage is unavailable.
    }
    updateFavoriteControls();
}

function shuffled(items) {
    const copy = [...new Set(items)];
    for (let index = copy.length - 1; index > 0; index -= 1) {
        const swapWith = Math.floor(Math.random() * (index + 1));
        [copy[index], copy[swapWith]] = [copy[swapWith], copy[index]];
    }
    return copy;
}

async function discoverServers() {
    const url = `${BOOTSTRAP_SERVER}/json/servers`;
    const startedAt = performance.now();
    surfaceMonitor.report('directory-bootstrap', {
        kind: 'DIRECTORY API', auth: 'KEYLESS', name: 'Radio Browser mirror discovery',
        url, state: 'checking', label: 'CHECKING', detail: 'Public read-only GET.'
    });
    try {
        const response = await fetch(url, {
            headers: { Accept: 'application/json' },
            signal: timeoutSignal(6500)
        });
        if (!response.ok) throw new Error(`Server list returned ${response.status}`);
        const data = await response.json();
        const discovered = data
            .map(item => item && item.name ? `https://${item.name}` : '')
            .filter(Boolean);
        apiServers = shuffled([...discovered, ...FALLBACK_SERVERS]);
        surfaceMonitor.report('directory-bootstrap', {
            state: 'ready', label: 'LIVE',
            detail: `HTTP ${response.status} · ${discovered.length} mirrors · ${Math.round(performance.now() - startedAt)} ms`
        });
    } catch (error) {
        apiServers = shuffled(FALLBACK_SERVERS);
        surfaceMonitor.report('directory-bootstrap', {
            state: 'error', label: 'FALLBACK', detail: error.message
        });
    }
}

async function radioBrowser(path, options = {}) {
    if (!apiServers.length) await discoverServers();
    let lastError;

    for (const server of apiServers) {
        const url = `${server}${path}`;
        const surfaceId = `directory:${url}`;
        const startedAt = performance.now();
        surfaceMonitor.report(surfaceId, {
            kind: 'DIRECTORY API', auth: 'KEYLESS', name: options.name || 'Radio Browser request',
            url, state: 'checking', label: 'CHECKING', detail: options.detail || 'Public read-only GET.'
        });
        try {
            const response = await fetch(url, {
                headers: { Accept: 'application/json' },
                signal: timeoutSignal(options.timeout || 9000),
                cache: 'no-store'
            });
            if (!response.ok) throw new Error(`${server} returned ${response.status}`);
            const data = await response.json();
            const count = Array.isArray(data) ? `${data.length} rows` : 'response received';
            surfaceMonitor.report(surfaceId, {
                state: 'ready', label: 'LIVE',
                detail: `HTTP ${response.status} · ${count} · ${Math.round(performance.now() - startedAt)} ms`
            });
            return { data, server };
        } catch (error) {
            lastError = error;
            surfaceMonitor.report(surfaceId, {
                state: 'error', label: 'FAILED', detail: error.message
            });
        }
    }

    throw lastError || new Error('No Radio Browser server responded');
}

function sanitizeStations(items, limit = RESULT_LIMIT) {
    const seenUuids = new Set();
    const seenStreams = new Set();
    return items.filter(station => {
        const stream = String(station.url_resolved || '');
        const uuid = String(station.stationuuid || '');
        if (!uuid || !String(station.name || '').trim()) return false;
        if (!stream.startsWith('https://')) return false;
        if ((Number(station.hls) === 1 || station.hls === true) && !supportsNativeHls) return false;
        if (Number(station.lastcheckok) !== 1 && station.lastcheckok !== true) return false;
        if (seenUuids.has(uuid) || seenStreams.has(stream)) return false;
        seenUuids.add(uuid);
        seenStreams.add(stream);
        return true;
    }).slice(0, limit);
}

function solarStateAtStation(station, date = new Date()) {
    if (station.geo_lat === null || station.geo_lat === '' || station.geo_long === null || station.geo_long === '') {
        return null;
    }
    const latitude = Number(station.geo_lat);
    const longitude = Number(station.geo_long);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;

    const utcDay = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
    const yearStart = Date.UTC(date.getUTCFullYear(), 0, 0);
    const dayOfYear = Math.floor((utcDay - yearStart) / 86400000);
    const utcHour = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
    const declination = 23.44 * Math.sin((Math.PI * 2 / 365) * (dayOfYear - 81));
    const solarHour = (utcHour + longitude / 15 + 24) % 24;
    const hourAngle = (solarHour - 12) * 15;
    const toRadians = degrees => degrees * Math.PI / 180;
    const sineElevation =
        Math.sin(toRadians(latitude)) * Math.sin(toRadians(declination)) +
        Math.cos(toRadians(latitude)) * Math.cos(toRadians(declination)) * Math.cos(toRadians(hourAngle));
    const elevation = Math.asin(Math.max(-1, Math.min(1, sineElevation))) * 180 / Math.PI;
    const hours = Math.floor(solarHour);
    const minutes = Math.floor((solarHour - hours) * 60);

    return {
        isNight: elevation < -6,
        label: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')} SOLAR  |  SUN ${Math.round(elevation)}\u00b0`
    };
}

function stationDetail(station) {
    const parts = [];
    if (station.night_context) parts.push(station.night_context);
    if (station.countrycode) parts.push(station.countrycode.toUpperCase());
    if (station.codec) parts.push(String(station.codec).toUpperCase());
    if (Number(station.bitrate) > 0) parts.push(`${station.bitrate} KBPS`);
    const tags = String(station.tags || '')
        .split(',')
        .map(tag => tag.trim())
        .filter(Boolean)
        .slice(0, 2);
    if (tags.length) parts.push(tags.join(' / ').toUpperCase());
    return parts.join('  |  ') || 'LIVE INTERNET RADIO';
}

function safeHttpsUrl(value) {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' ? url.href : '';
    } catch {
        return '';
    }
}

function reportMediaSurface(station, state, label, detail) {
    if (!station?.url_resolved) return;
    surfaceMonitor.report(`playback:${station.stationuuid}:${station.url_resolved}`, {
        kind: 'PLAY STREAM',
        auth: 'NO KEY',
        name: station.name,
        url: station.url_resolved,
        state,
        label,
        detail
    });
}

function compactStation(station) {
    return {
        stationuuid: station.stationuuid,
        name: station.name,
        url_resolved: station.url_resolved,
        homepage: station.homepage || '',
        countrycode: station.countrycode || '',
        codec: station.codec || '',
        bitrate: Number(station.bitrate) || 0,
        tags: station.tags || '',
        source: station.source || 'radio-browser',
        hls: Number(station.hls) === 1 || station.hls === true,
        geo_lat: station.geo_lat !== null && station.geo_lat !== '' && Number.isFinite(Number(station.geo_lat))
            ? Number(station.geo_lat) : null,
        geo_long: station.geo_long !== null && station.geo_long !== '' && Number.isFinite(Number(station.geo_long))
            ? Number(station.geo_long) : null
    };
}

function isFavorite(uuid) {
    return favorites.some(station => station.stationuuid === uuid);
}

function toggleFavorite(station) {
    if (!station) return;
    const existing = favorites.findIndex(item => item.stationuuid === station.stationuuid);
    if (existing >= 0) favorites.splice(existing, 1);
    else favorites.unshift(compactStation(station));
    saveFavorites();
    if (favoritesOnly) {
        stations = [...favorites];
        renderStations();
    } else {
        updateRowFavorites();
    }
}

function updateFavoriteControls() {
    favoriteCount.textContent = String(favorites.length);
    const saved = Boolean(currentStation && isFavorite(currentStation.stationuuid));
    favoriteToggle.setAttribute('aria-pressed', String(saved));
    favoriteToggle.textContent = saved ? 'SAVED' : 'SAVE';
    updateRowFavorites();
}

function updateRowFavorites() {
    stationList.querySelectorAll('.row-save').forEach(button => {
        const saved = isFavorite(button.dataset.uuid);
        button.setAttribute('aria-pressed', String(saved));
        button.setAttribute('aria-label', `${saved ? 'Remove' : 'Save'} ${button.dataset.name}`);
        button.textContent = saved ? '-' : '+';
    });
}

function mediaErrorDetail(media, fallbackError) {
    const code = media?.error?.code;
    const messages = {
        1: 'Playback aborted',
        2: 'Network error',
        3: 'Audio decode error',
        4: 'Format not supported'
    };
    if (messages[code]) return `${messages[code]} (media ${code})`;
    if (fallbackError?.name === 'NotSupportedError') return 'Format not supported';
    if (fallbackError?.name === 'AbortError') return 'Connection aborted';
    if (fallbackError?.message) return fallbackError.message;
    return 'No playable audio returned';
}

function signalFailureLabel(detail) {
    const value = detail.toLowerCase();
    if (value.includes('network')) return 'NETWORK ERROR';
    if (value.includes('decode')) return 'DECODE ERROR';
    if (value.includes('not supported') || value.includes('unsupported')) return 'UNSUPPORTED';
    if (value.includes('timed out')) return 'TIMEOUT';
    if (value.includes('aborted')) return 'ABORTED';
    return 'NO RESPONSE';
}

function resetSignalTests() {
    signalTestRun += 1;
    signalResults.clear();
    testSignalsButton.disabled = true;
    testSignalsButton.textContent = 'TEST SIGNALS';
    renderBandMarkers();
}

function updateSignalRow(uuid) {
    const row = [...stationList.querySelectorAll('.station-row')]
        .find(item => item.dataset.uuid === uuid);
    if (!row) return;
    const result = signalResults.get(uuid) || {
        state: 'untested',
        label: 'UNTESTED',
        detail: 'Signal has not been tested on this device.'
    };
    const state = row.querySelector('.signal-state');
    row.dataset.signal = result.state;
    state.dataset.state = result.state;
    state.textContent = result.label;
    state.title = result.detail;
    state.setAttribute('aria-label', `${result.label}: ${result.detail}`);
}

function setSignalResult(station, result) {
    if (!station?.stationuuid) return;
    signalResults.set(station.stationuuid, result);
    updateSignalRow(station.stationuuid);
    renderBandMarkers();
    if (currentStation?.stationuuid === station.stationuuid) {
        if (result.state === 'testing') setBandState('testing', 'TESTING', 3);
        else if (result.state === 'ready' && !audio.paused) setBandState('on-air', 'ON AIR', 5);
        else if (result.state === 'ready') setBandState('ready', 'READY', 5);
        else if (result.state === 'dead') setBandState('error', result.label, 1);
    }
}

function setBandState(state, label, strength = 0) {
    bandConsole.dataset.state = state;
    bandState.textContent = label;
    bandMeter.forEach((bar, index) => bar.classList.toggle('active', index < strength));
}

function renderBandMarkers() {
    bandMarkers.replaceChildren();
    const fragment = document.createDocumentFragment();
    bandStations.forEach(slot => {
        const marker = document.createElement('span');
        const signal = signalResults.get(slot.station.stationuuid)?.state || 'untested';
        marker.className = 'band-marker';
        marker.dataset.signal = signal;
        marker.style.left = `${((slot.frequency - 87.5) / 20.5) * 100}%`;
        fragment.appendChild(marker);
    });
    bandMarkers.appendChild(fragment);
}

function syncBandToStation(station, index) {
    if (!station || !bandStations.length) return;
    let slot = bandStations.find(item => item.station.stationuuid === station.stationuuid);
    if (!slot) {
        const currentFrequency = Number(bandTuner.value) / 10;
        slot = bandStations.reduce((nearest, item) =>
            Math.abs(item.frequency - currentFrequency) < Math.abs(nearest.frequency - currentFrequency)
                ? item : nearest
        );
        slot.station = station;
        slot.index = index;
        renderBandMarkers();
    }
    bandTuner.value = String(Math.round(slot.frequency * 10));
    bandFrequency.textContent = slot.frequency.toFixed(1);
    const result = signalResults.get(station.stationuuid);
    if (result?.state === 'ready') setBandState('ready', 'READY', 5);
    else if (result?.state === 'dead') setBandState('error', result.label, 1);
    else setBandState('locked', 'LOCKED', 4);
}

function clearBandSelection() {
    currentStation = null;
    currentIndex = -1;
    currentName.textContent = 'Quiet band';
    currentDetail.textContent = 'No station occupies this part of the current internet band.';
    playToggle.disabled = true;
    favoriteToggle.disabled = true;
    shareButton.disabled = true;
    favoriteToggle.setAttribute('aria-pressed', 'false');
    stationHome.href = '/music/broadcast';
    stationHome.setAttribute('aria-disabled', 'true');
    const params = new URLSearchParams(location.search);
    params.delete('station');
    history.replaceState(null, '', [...params].length ? `${location.pathname}?${params}` : location.pathname);
    updateCurrentRow();
    updateTransportAvailability();
    setPlayerState('idle', 'STATIC', 'Quiet band. Move toward a station marker.');
}

function updateBandFromTuner() {
    if (!bandStations.length) {
        setBandState('idle', 'STANDBY', 0);
        return;
    }
    const frequency = Number(bandTuner.value) / 10;
    bandFrequency.textContent = frequency.toFixed(1);
    const nearest = bandStations.reduce((best, slot) => {
        const distance = Math.abs(slot.frequency - frequency);
        return !best || distance < best.distance ? { slot, distance } : best;
    }, null);

    if (!nearest || nearest.distance > BAND_LOCK_DISTANCE) {
        clearBandSelection();
        return;
    }

    const strength = Math.max(1, 5 - Math.floor(nearest.distance / 0.09));
    if (currentStation?.stationuuid !== nearest.slot.station.stationuuid) {
        setCurrentStation(nearest.slot.station, nearest.slot.index);
    }
    if (audio.paused) {
        setPlayerState('paused', 'LOCKED', `Tuned to ${nearest.slot.station.name}. Press play or test its signal.`);
    }
    const result = signalResults.get(nearest.slot.station.stationuuid);
    if (result?.state === 'ready') setBandState('ready', 'READY', Math.max(strength, 4));
    else if (result?.state === 'dead') setBandState('error', result.label, 1);
    else setBandState(
        nearest.distance < 0.16 ? 'locked' : 'acquiring',
        nearest.distance < 0.16 ? 'LOCKED' : 'ACQUIRING',
        strength
    );
}

function renderBandStations() {
    bandStations = stations.slice(0, BAND_FREQUENCIES.length).map((station, index) => ({
        station,
        index,
        frequency: BAND_FREQUENCIES[index]
    }));
    renderBandMarkers();
    if (!bandStations.length) {
        setBandState('idle', 'NO BAND', 0);
        return;
    }
    if (currentStation) syncBandToStation(currentStation, currentIndex);
    else {
        const center = bandStations[Math.floor((bandStations.length - 1) / 2)];
        bandTuner.value = String(Math.round(center.frequency * 10));
        updateBandFromTuner();
    }
}

function probeStationSignal(station) {
    return new Promise(resolve => {
        const probe = new Audio();
        const startedAt = performance.now();
        const surfaceId = `media:${station.stationuuid}:${station.url_resolved}`;
        let settled = false;
        let timer;

        surfaceMonitor.report(surfaceId, {
            kind: station.source === 'official' ? 'OFFICIAL MEDIA' : 'DIRECT MEDIA',
            auth: 'NO KEY',
            name: station.name,
            url: station.url_resolved,
            state: 'checking',
            label: 'TESTING',
            detail: 'Waiting for browser-decodable HTTPS audio.'
        });

        const finish = (state, label, detail) => {
            if (settled) return;
            settled = true;
            window.clearTimeout(timer);
            ['loadeddata', 'canplay', 'playing'].forEach(eventName => probe.removeEventListener(eventName, onReady));
            probe.removeEventListener('error', onError);
            probe.pause();
            probe.removeAttribute('src');
            probe.load();
            const elapsed = Math.round(performance.now() - startedAt);
            surfaceMonitor.report(surfaceId, {
                state: state === 'ready' ? 'ready' : 'error',
                label,
                detail: `${detail} · ${elapsed} ms`
            });
            resolve({
                state,
                label,
                detail: `${detail} | ${elapsed} ms`
            });
        };
        const onReady = () => finish('ready', 'READY', 'Playable audio returned');
        const onError = () => {
            const detail = mediaErrorDetail(probe);
            finish('dead', signalFailureLabel(detail), detail);
        };

        ['loadeddata', 'canplay', 'playing'].forEach(eventName => probe.addEventListener(eventName, onReady, { once: true }));
        probe.addEventListener('error', onError, { once: true });
        timer = window.setTimeout(
            () => finish('dead', 'TIMEOUT', `Timed out after ${SIGNAL_TEST_TIMEOUT / 1000} seconds`),
            SIGNAL_TEST_TIMEOUT
        );
        probe.preload = 'auto';
        probe.muted = true;
        probe.volume = 0;
        probe.playsInline = true;
        probe.src = station.url_resolved;
        probe.load();
        const playAttempt = probe.play();
        if (playAttempt?.catch) {
            playAttempt.catch(error => {
                if (error?.name !== 'NotAllowedError') {
                    const detail = mediaErrorDetail(probe, error);
                    finish('dead', signalFailureLabel(detail), detail);
                }
            });
        }
    });
}

async function testCurrentSignals() {
    if (!stations.length) return;
    const run = ++signalTestRun;
    const candidates = stations.slice(0, SIGNAL_TEST_LIMIT);
    let complete = 0;
    let ready = 0;

    testSignalsButton.disabled = true;
    candidates.forEach(station => setSignalResult(station, {
        state: 'testing',
        label: 'TESTING',
        detail: 'Waiting for playable audio from this stream.'
    }));
    testSignalsButton.textContent = `TESTING 0 / ${candidates.length}`;

    let cursor = 0;
    async function worker() {
        while (cursor < candidates.length && run === signalTestRun) {
            const station = candidates[cursor];
            cursor += 1;
            const result = await probeStationSignal(station);
            if (run !== signalTestRun) return;
            setSignalResult(station, result);
            complete += 1;
            if (result.state === 'ready') ready += 1;
            testSignalsButton.textContent = `TESTING ${complete} / ${candidates.length}`;
        }
    }

    await Promise.all(Array.from(
        { length: Math.min(SIGNAL_TEST_CONCURRENCY, candidates.length) },
        () => worker()
    ));
    if (run !== signalTestRun) return;
    testSignalsButton.disabled = false;
    testSignalsButton.textContent = `READY ${ready} / ${candidates.length}`;
}

function renderStations() {
    stationList.replaceChildren();
    stationList.setAttribute('aria-busy', 'false');
    directoryMessage.hidden = true;

    if (!stations.length) {
        bandStations = [];
        renderBandMarkers();
        setBandState('idle', 'NO BAND', 0);
        const nightSearch = lastRequest.kind === 'night';
        resultsLabel.textContent = favoritesOnly
            ? 'NO SAVED STATIONS'
            : nightSearch ? 'NO NIGHT SIGNALS FOUND' : 'NO HTTPS STATIONS FOUND';
        randomButton.disabled = true;
        testSignalsButton.disabled = true;
        directoryMessageCopy.textContent = favoritesOnly
            ? 'Save a station and it will stay here on this device.'
            : nightSearch ? 'No after-dark stations answered this pass. Try the night again.' : 'Try another name, genre, or country.';
        retryButton.hidden = favoritesOnly;
        directoryMessage.hidden = false;
        return;
    }

    retryButton.hidden = false;
    resultsLabel.textContent = `${stations.length} STATIONS`;
    randomButton.disabled = false;
    testSignalsButton.disabled = false;

    const fragment = document.createDocumentFragment();
    stations.forEach((station, index) => {
        const item = document.createElement('li');
        item.className = 'station-row';
        item.dataset.uuid = station.stationuuid;
        item.classList.toggle('is-current', currentStation?.stationuuid === station.stationuuid);

        const number = document.createElement('span');
        number.className = 'station-number';
        number.textContent = String(index + 1).padStart(2, '0');

        const select = document.createElement('button');
        select.type = 'button';
        select.className = 'station-select';
        select.dataset.index = String(index);
        select.innerHTML = `<strong></strong><span class="station-detail"></span><span class="signal-state"></span>`;
        select.querySelector('strong').textContent = station.name.trim();
        select.querySelector('.station-detail').textContent = stationDetail(station);
        select.setAttribute('aria-label', `Play ${station.name}`);

        const save = document.createElement('button');
        save.type = 'button';
        save.className = 'row-save';
        save.dataset.uuid = station.stationuuid;
        save.dataset.name = station.name;

        item.append(number, select, save);
        fragment.appendChild(item);
    });
    stationList.appendChild(fragment);
    stations.forEach(station => updateSignalRow(station.stationuuid));
    renderBandStations();
    updateRowFavorites();
    updateTransportAvailability();
}

function setDirectoryLoading(label) {
    resetSignalTests();
    stationList.replaceChildren();
    stationList.setAttribute('aria-busy', 'true');
    resultsLabel.textContent = label;
    directoryMessage.hidden = true;
    randomButton.disabled = true;
}

function showDirectoryError(error) {
    stationList.replaceChildren();
    stationList.setAttribute('aria-busy', 'false');
    resultsLabel.textContent = 'DIRECTORY OFFLINE';
    directoryMessageCopy.textContent = 'The live station directory did not answer. Your saved stations are still available.';
    retryButton.hidden = false;
    directoryMessage.hidden = false;
    testSignalsButton.disabled = true;
    console.warn('RG Broadcast directory request failed', error);
}

function centerPreset(button) {
    if (!button) return;
    const left = button.offsetLeft - ((presetTrack.clientWidth - button.offsetWidth) / 2);
    presetTrack.scrollTo({
        left: Math.max(0, left),
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
    });
}

function setActivePreset(name = '', emptyLabel = 'CUSTOM LIST') {
    let activeButton = null;
    presetButtons.forEach(button => {
        const active = button.dataset.preset === name;
        button.setAttribute('aria-pressed', String(active));
        if (active) activeButton = button;
    });

    const index = activeButton ? presetButtons.indexOf(activeButton) : -1;
    presetPosition.textContent = index >= 0
        ? `${index + 1} OF ${presetButtons.length} · ${activeButton.textContent.trim()}`
        : emptyLabel;
    previousPresetButton.disabled = index === 0;
    nextPresetButton.disabled = index === presetButtons.length - 1;
    if (activeButton) centerPreset(activeButton);
}

function requestForPreset(preset) {
    if (preset === 'us') return { kind: 'us' };
    if (preset === 'top') return { kind: 'top' };
    if (preset === 'news') return { kind: 'news' };
    if (preset === 'conspiracy') return { kind: 'conspiracy' };
    if (preset === 'night') return { kind: 'night' };
    return { kind: 'tag', value: preset };
}

function choosePreset(button, { focus = false } = {}) {
    if (!button) return;
    const preset = button.dataset.preset;
    searchQuery.value = '';
    setActivePreset(preset);
    if (focus) button.focus({ preventScroll: true });
    loadStations(requestForPreset(preset));
}

function movePreset(direction, options) {
    const activeIndex = presetButtons.findIndex(button => button.getAttribute('aria-pressed') === 'true');
    const nextIndex = activeIndex < 0
        ? direction > 0 ? 0 : presetButtons.length - 1
        : Math.min(presetButtons.length - 1, Math.max(0, activeIndex + direction));
    choosePreset(presetButtons[nextIndex], options);
}

async function loadStations(request = lastRequest) {
    const run = ++stationRequestRun;
    lastRequest = request;
    favoritesOnly = false;
    favoritesFilter.setAttribute('aria-pressed', 'false');
    setDirectoryLoading('REQUESTING LIVE STATIONS');

    let path;
    let label;
    if (request.kind === 'news') {
        label = 'NEWS DESK';
    } else if (request.kind === 'conspiracy') {
        label = 'CONSPIRACY';
    } else if (request.kind === 'us') {
        path = `/json/stations/search?countrycode=US&is_https=true&hidebroken=true&order=clickcount&reverse=true&limit=${RESULT_LIMIT}`;
        label = 'US LIVE';
    } else if (request.kind === 'tag') {
        const tag = encodeURIComponent(request.value);
        path = `/json/stations/search?tag=${tag}&is_https=true&hidebroken=true&order=clickcount&reverse=true&limit=${RESULT_LIMIT}`;
        label = request.value.toUpperCase();
    } else if (request.kind === 'search') {
        const parameter = request.field === 'tag' ? 'tag' : request.field === 'country' ? 'country' : 'name';
        path = `/json/stations/search?${parameter}=${encodeURIComponent(request.value)}&is_https=true&hidebroken=true&order=clickcount&reverse=true&limit=${RESULT_LIMIT}`;
        label = `RESULTS: ${request.value.toUpperCase()}`;
    } else if (request.kind === 'night') {
        path = '/json/stations/search?has_geo_info=true&is_https=true&hidebroken=true&order=random&limit=250';
        label = 'FOLLOW THE NIGHT';
    } else {
        path = `/json/stations/topclick/${RESULT_LIMIT}?hidebroken=true`;
        label = 'MOST PLAYED';
    }

    try {
        let data;
        if (request.kind === 'news') {
            const responses = await Promise.allSettled(NEWS_TERMS.map(term => radioBrowser(
                `/json/stations/search?name=${encodeURIComponent(term)}&countrycode=US&is_https=true&hidebroken=true&order=clickcount&reverse=true&limit=9`
            )));
            data = [
                ...OFFICIAL_NEWS_STATIONS,
                ...responses.flatMap(response => response.status === 'fulfilled' ? response.value.data : [])
            ];
        } else if (request.kind === 'conspiracy') {
            const responses = await Promise.allSettled(CONSPIRACY_TAGS.map(tag => radioBrowser(
                `/json/stations/search?tag=${encodeURIComponent(tag)}&tagExact=true&countrycode=US&is_https=true&hidebroken=true&order=clickcount&reverse=true&limit=12`
            )));
            data = [
                ...OFFICIAL_NEWS_STATIONS,
                ...responses.flatMap(response => response.status === 'fulfilled' ? response.value.data : [])
            ];
        } else {
            ({ data } = await radioBrowser(path));
        }
        if (run !== stationRequestRun) return;
        if (request.kind === 'night') {
            const now = new Date();
            stations = sanitizeStations(data, 250)
                .map(station => {
                    const solar = solarStateAtStation(station, now);
                    return solar?.isNight ? { ...station, night_context: solar.label } : null;
                })
                .filter(Boolean)
                .slice(0, RESULT_LIMIT);
        } else {
            stations = sanitizeStations(data);
        }
        resultsLabel.textContent = label;
        renderStations();
        resultsLabel.textContent = `${label}  |  ${stations.length}`;
    } catch (error) {
        if (run !== stationRequestRun) return;
        stations = [];
        showDirectoryError(error);
    }
}

function updatePlayControl(state, label) {
    const isLoading = state === 'loading';
    const isRebuffering = isLoading && !playPending && !audio.paused;
    const visibleLabel = state === 'playing'
        ? 'PAUSE'
        : state === 'error'
            ? 'RETRY'
            : isLoading
                ? (label === 'BUFFERING' ? 'BUFFERING' : 'TUNING')
                : 'PLAY';
    const accessibleLabel = state === 'playing'
        ? 'Pause station'
        : state === 'error'
            ? 'Retry station'
            : isLoading
                ? `${visibleLabel.toLowerCase()} station`
                : 'Play station';

    playStateLabel.textContent = visibleLabel;
    playToggle.disabled = !currentStation || playPending;
    playToggle.setAttribute('aria-busy', String(isLoading));
    playToggle.setAttribute('aria-label', isRebuffering ? 'Pause station while buffering' : accessibleLabel);
}

function setPlayerState(state, label, message) {
    nowPlaying.dataset.state = state;
    airLabel.textContent = label;
    playerStatus.textContent = message;
    updatePlayControl(state, label);
    if (!currentStation) {
        if (state === 'idle') setBandState('static', label === 'STATIC' ? 'STATIC' : 'STANDBY', 0);
        return;
    }
    const signal = signalResults.get(currentStation.stationuuid);
    if (state === 'playing') setBandState('on-air', 'ON AIR', 5);
    else if (state === 'loading') setBandState('testing', 'TUNING', 3);
    else if (state === 'error') setBandState('error', 'NO SIGNAL', 0);
    else if (state === 'paused' && label === 'PAUSED') setBandState('paused', 'PAUSED', 4);
    else if (signal?.state === 'ready') setBandState('ready', 'READY', 5);
    else if (signal?.state === 'dead') setBandState('error', signal.label, 1);
    else setBandState('locked', state === 'paused' ? 'LOCKED' : 'STANDBY', 4);
}

function updateCurrentRow() {
    stationList.querySelectorAll('.station-row').forEach(row => {
        row.classList.toggle('is-current', row.dataset.uuid === currentStation?.stationuuid);
    });
}

function updateTransportAvailability() {
    const canMove = stations.length > 1 && currentStation !== null;
    previousButton.disabled = !canMove;
    nextButton.disabled = !canMove;
}

function setCurrentStation(station, index = stations.findIndex(item => item.stationuuid === station.stationuuid)) {
    currentStation = station;
    currentIndex = index;
    currentName.textContent = station.name.trim();
    currentDetail.textContent = stationDetail(station);
    favoriteToggle.disabled = false;
    shareButton.disabled = false;

    const homepage = safeHttpsUrl(station.homepage);
    if (homepage) {
        stationHome.href = homepage;
        stationHome.setAttribute('aria-disabled', 'false');
    } else {
        stationHome.href = '/music/broadcast';
        stationHome.setAttribute('aria-disabled', 'true');
    }

    const params = new URLSearchParams(location.search);
    params.set('station', station.stationuuid);
    history.replaceState(null, '', `${location.pathname}?${params}`);
    try {
        localStorage.setItem(LAST_STATION_KEY, JSON.stringify(compactStation(station)));
    } catch {
        // The selected station still works without persistence.
    }

    updateFavoriteControls();
    updateCurrentRow();
    updateTransportAvailability();
    updateMediaSession(station);
    syncBandToStation(station, index);
    updatePlayControl(nowPlaying.dataset.state || 'idle', airLabel.textContent);
}

async function recordPlay(station) {
    if (!station?.stationuuid || station.source === 'official') return;
    try {
        await radioBrowser(`/json/url/${encodeURIComponent(station.stationuuid)}`, {
            timeout: 5000,
            name: 'Radio Browser click counter',
            detail: 'Keyless directory count sent after successful playback.'
        });
    } catch {
        // Playback does not depend on the directory accepting its click count.
    }
}

async function playStation(station, index) {
    if (!station) return;
    if (playPending && currentStation?.stationuuid === station.stationuuid) return;

    const run = ++playbackRun;
    const changed = currentStation?.stationuuid !== station.stationuuid;
    playPending = true;
    if (changed) {
        audio.pause();
        setCurrentStation(station, index);
    }
    if (changed || audio.dataset.uuid !== station.stationuuid || audio.src !== station.url_resolved) {
        audio.dataset.uuid = station.stationuuid;
        audio.src = station.url_resolved;
    }

    setPlayerState('loading', 'TUNING', `Connecting to ${station.name}...`);
    reportMediaSurface(station, 'checking', 'TUNING', 'Main receiver is opening this direct HTTPS stream.');
    try {
        await audio.play();
        if (run !== playbackRun || currentStation?.stationuuid !== station.stationuuid) return;
        recordPlay(station);
    } catch (error) {
        if (run !== playbackRun || currentStation?.stationuuid !== station.stationuuid) return;
        playPending = false;
        if (error?.name === 'NotAllowedError') {
            setPlayerState('error', 'PLAY BLOCKED', 'The browser blocked playback. Tap RETRY once.');
            reportMediaSurface(station, 'error', 'PLAY BLOCKED', 'The browser rejected the playback gesture.');
            return;
        }
        const detail = mediaErrorDetail(audio, error);
        reportMediaSurface(station, 'error', signalFailureLabel(detail), detail);
        setSignalResult(station, { state: 'dead', label: signalFailureLabel(detail), detail });
        setPlayerState('error', 'NO SIGNAL', `${detail}. Choose another station or test the list.`);
        console.warn('RG Broadcast playback failed', error);
    }
}

function pauseStation() {
    playbackRun += 1;
    playPending = false;
    audio.pause();
    if (currentStation) setPlayerState('paused', 'PAUSED', `${currentStation.name} paused.`);
}

function moveStation(direction) {
    if (!stations.length) return;
    const knownIndex = stations.findIndex(item => item.stationuuid === currentStation?.stationuuid);
    const next = knownIndex >= 0
        ? (knownIndex + direction + stations.length) % stations.length
        : direction > 0 ? 0 : stations.length - 1;
    playStation(stations[next], next);
}

function updateMediaSession(station) {
    if (!('mediaSession' in navigator) || !('MediaMetadata' in window)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
        title: station.name,
        artist: stationDetail(station),
        album: 'RG Broadcast'
    });
}

function bindMediaSession() {
    if (!('mediaSession' in navigator)) return;
    const handlers = {
        play: () => currentStation && playStation(currentStation, currentIndex),
        pause: pauseStation,
        previoustrack: () => moveStation(-1),
        nexttrack: () => moveStation(1)
    };
    Object.entries(handlers).forEach(([action, handler]) => {
        try {
            navigator.mediaSession.setActionHandler(action, handler);
        } catch {
            // Some browsers expose Media Session without every action.
        }
    });
}

function restoreLastStation() {
    const requestedUuid = new URLSearchParams(location.search).get('station');
    if (requestedUuid) {
        const official = OFFICIAL_NEWS_STATIONS.find(station => station.stationuuid === requestedUuid);
        if (official) {
            setCurrentStation(official);
            setPlayerState('idle', 'STANDBY', 'Press play to connect.');
            return;
        }
        radioBrowser(`/json/stations/byuuid/${encodeURIComponent(requestedUuid)}`)
            .then(({ data }) => {
                const [station] = sanitizeStations(data);
                if (station) setCurrentStation(station);
            })
            .catch(() => {});
        return;
    }

    try {
        const stored = JSON.parse(localStorage.getItem(LAST_STATION_KEY) || 'null');
        if (stored?.stationuuid && String(stored.url_resolved || '').startsWith('https://')) {
            setCurrentStation(stored);
            setPlayerState('idle', 'STANDBY', 'Press play to reconnect.');
        }
    } catch {
        // Start empty if the saved station cannot be read.
    }
}

stationList.addEventListener('click', event => {
    const select = event.target.closest('.station-select');
    if (select) {
        const index = Number(select.dataset.index);
        playStation(stations[index], index);
        if (matchMedia('(max-width: 860px)').matches) {
            nowPlaying.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
        }
        return;
    }

    const save = event.target.closest('.row-save');
    if (save) {
        const station = stations.find(item => item.stationuuid === save.dataset.uuid);
        toggleFavorite(station);
    }
});

playToggle.addEventListener('click', () => {
    if (!currentStation) return;
    if (playPending) return;
    if (audio.paused) playStation(currentStation, currentIndex);
    else pauseStation();
});

previousButton.addEventListener('click', () => moveStation(-1));
nextButton.addEventListener('click', () => moveStation(1));
favoriteToggle.addEventListener('click', () => toggleFavorite(currentStation));

searchForm.addEventListener('submit', event => {
    event.preventDefault();
    const value = searchQuery.value.trim();
    if (!value) {
        searchQuery.focus();
        return;
    }
    setActivePreset('', 'CUSTOM SEARCH');
    loadStations({ kind: 'search', field: searchField.value, value });
});

presetButtons.forEach(button => {
    button.addEventListener('click', () => choosePreset(button));
});

previousPresetButton.addEventListener('click', () => movePreset(-1));
nextPresetButton.addEventListener('click', () => movePreset(1));

presetTrack.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'Home') choosePreset(presetButtons[0], { focus: true });
    else if (event.key === 'End') choosePreset(presetButtons[presetButtons.length - 1], { focus: true });
    else movePreset(event.key === 'ArrowRight' ? 1 : -1, { focus: true });
});

favoritesFilter.addEventListener('click', () => {
    favoritesOnly = !favoritesOnly;
    favoritesFilter.setAttribute('aria-pressed', String(favoritesOnly));
    setActivePreset('', 'SAVED STATIONS');
    if (favoritesOnly) {
        stationRequestRun += 1;
        resetSignalTests();
        stations = [...favorites];
        renderStations();
        resultsLabel.textContent = `SAVED  |  ${stations.length}`;
    } else {
        const lastPreset = lastRequest.kind === 'tag' ? lastRequest.value : lastRequest.kind;
        setActivePreset(presetButtons.some(button => button.dataset.preset === lastPreset) ? lastPreset : '', 'CUSTOM LIST');
        loadStations(lastRequest);
    }
});

randomButton.addEventListener('click', () => {
    if (!stations.length) return;
    const readyStations = stations
        .map((station, index) => ({ station, index }))
        .filter(item => signalResults.get(item.station.stationuuid)?.state === 'ready');
    const pool = readyStations.length
        ? readyStations
        : stations.map((station, index) => ({ station, index }));
    const choice = pool[Math.floor(Math.random() * pool.length)];
    playStation(choice.station, choice.index);
});

testSignalsButton.addEventListener('click', testCurrentSignals);

bandTuner.addEventListener('input', () => {
    if (!audio.paused || playPending) pauseStation();
    updateBandFromTuner();
});

retryButton.addEventListener('click', () => {
    if (favoritesOnly) {
        stations = [...favorites];
        renderStations();
    } else {
        apiServers = [];
        loadStations(lastRequest);
    }
});

shareButton.addEventListener('click', async () => {
    if (!currentStation) return;
    const url = location.href;
    const data = {
        title: `${currentStation.name} | RG Broadcast`,
        text: `Listening to ${currentStation.name} on RG Broadcast`,
        url
    };
    try {
        if (navigator.share) await navigator.share(data);
        else {
            await navigator.clipboard.writeText(`${data.text} ${url}`);
            playerStatus.textContent = 'Station link copied.';
        }
    } catch (error) {
        if (error?.name !== 'AbortError') playerStatus.textContent = 'Share was not available.';
    }
});

audio.addEventListener('playing', () => {
    playPending = false;
    setSignalResult(currentStation, {
        state: 'ready',
        label: 'READY',
        detail: 'Playable audio confirmed by this receiver.'
    });
    setPlayerState('playing', 'ON AIR', `Playing ${currentStation?.name || 'station'}.`);
    reportMediaSurface(currentStation, 'ready', 'ON AIR', 'Playable audio confirmed by the main receiver.');
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
});

audio.addEventListener('pause', () => {
    if (!currentStation || playPending || nowPlaying.dataset.state === 'error') return;
    if (nowPlaying.dataset.state !== 'paused') {
        setPlayerState('paused', 'PAUSED', `${currentStation.name} paused.`);
    }
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
});

audio.addEventListener('waiting', () => {
    if (currentStation) setPlayerState('loading', 'BUFFERING', `Buffering ${currentStation.name}...`);
});

audio.addEventListener('error', () => {
    if (!currentStation || !audio.getAttribute('src') || audio.dataset.uuid !== currentStation.stationuuid) return;
    playPending = false;
    const detail = mediaErrorDetail(audio);
    reportMediaSurface(currentStation, 'error', signalFailureLabel(detail), detail);
    setSignalResult(currentStation, { state: 'dead', label: signalFailureLabel(detail), detail });
    setPlayerState('error', 'NO SIGNAL', `${detail}. Choose another station or test the list.`);
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'none';
});

audio.addEventListener('stalled', () => {
    if (currentStation && !audio.paused) {
        setPlayerState('loading', 'BUFFERING', `${currentStation.name} is taking longer than expected...`);
    }
});

stationHome.addEventListener('click', event => {
    if (stationHome.getAttribute('aria-disabled') === 'true') event.preventDefault();
});

bindMediaSession();
updateFavoriteControls();
setActivePreset('us');
discoverServers().finally(() => {
    loadStations({ kind: 'us' });
    restoreLastStation();
});
