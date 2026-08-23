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
const NEWS_TERMS = ['Bloomberg', 'CNN', 'Fox News'];
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
const previousButton = document.getElementById('previous-station');
const nextButton = document.getElementById('next-station');
const favoriteToggle = document.getElementById('favorite-toggle');
const favoriteCount = document.getElementById('favorite-count');
const favoritesFilter = document.getElementById('favorites-filter');
const shareButton = document.getElementById('share-station');
const stationHome = document.getElementById('station-home');
const searchForm = document.getElementById('station-search');
const searchQuery = document.getElementById('search-query');
const searchField = document.getElementById('search-field');
const presetButtons = [...document.querySelectorAll('[data-preset]')];
const resultsLabel = document.getElementById('results-label');
const testSignalsButton = document.getElementById('test-signals');
const randomButton = document.getElementById('random-station');
const stationList = document.getElementById('station-list');
const directoryMessage = document.getElementById('directory-message');
const directoryMessageCopy = document.getElementById('directory-message-copy');
const retryButton = document.getElementById('retry-directory');

let apiServers = [];
let stations = [];
let currentStation = null;
let currentIndex = -1;
let lastRequest = { kind: 'top' };
let favoritesOnly = false;
let favorites = loadFavorites();
let playbackRun = 0;
let signalTestRun = 0;
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
    try {
        const response = await fetch(`${BOOTSTRAP_SERVER}/json/servers`, {
            headers: { Accept: 'application/json' },
            signal: timeoutSignal(6500)
        });
        if (!response.ok) throw new Error(`Server list returned ${response.status}`);
        const data = await response.json();
        const discovered = data
            .map(item => item && item.name ? `https://${item.name}` : '')
            .filter(Boolean);
        apiServers = shuffled([...discovered, ...FALLBACK_SERVERS]);
    } catch {
        apiServers = shuffled(FALLBACK_SERVERS);
    }
}

async function radioBrowser(path, options = {}) {
    if (!apiServers.length) await discoverServers();
    let lastError;

    for (const server of apiServers) {
        try {
            const response = await fetch(`${server}${path}`, {
                headers: { Accept: 'application/json' },
                signal: timeoutSignal(options.timeout || 9000),
                cache: 'no-store'
            });
            if (!response.ok) throw new Error(`${server} returned ${response.status}`);
            return { data: await response.json(), server };
        } catch (error) {
            lastError = error;
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
}

function probeStationSignal(station) {
    return new Promise(resolve => {
        const probe = new Audio();
        const startedAt = performance.now();
        let settled = false;
        let timer;

        const finish = (state, label, detail) => {
            if (settled) return;
            settled = true;
            window.clearTimeout(timer);
            ['loadeddata', 'canplay', 'playing'].forEach(eventName => probe.removeEventListener(eventName, onReady));
            probe.removeEventListener('error', onError);
            probe.pause();
            probe.removeAttribute('src');
            probe.load();
            resolve({
                state,
                label,
                detail: `${detail} | ${Math.round(performance.now() - startedAt)} ms`
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

function setActivePreset(name = '') {
    presetButtons.forEach(button => {
        button.setAttribute('aria-pressed', String(button.dataset.preset === name));
    });
}

async function loadStations(request = lastRequest) {
    lastRequest = request;
    favoritesOnly = false;
    favoritesFilter.setAttribute('aria-pressed', 'false');
    setDirectoryLoading('REQUESTING LIVE STATIONS');

    let path;
    let label;
    if (request.kind === 'news') {
        label = 'NEWS DESK';
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
                `/json/stations/search?name=${encodeURIComponent(term)}&is_https=true&hidebroken=true&order=clickcount&reverse=true&limit=9`
            )));
            data = [
                ...OFFICIAL_NEWS_STATIONS,
                ...responses.flatMap(response => response.status === 'fulfilled' ? response.value.data : [])
            ];
        } else {
            ({ data } = await radioBrowser(path));
        }
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
        stations = [];
        showDirectoryError(error);
    }
}

function setPlayerState(state, label, message) {
    nowPlaying.dataset.state = state;
    airLabel.textContent = label;
    playerStatus.textContent = message;
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
    playToggle.disabled = false;
    favoriteToggle.disabled = false;
    shareButton.disabled = false;

    if (station.homepage && station.homepage.startsWith('http')) {
        stationHome.href = station.homepage;
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
}

async function recordPlay(station) {
    if (!station?.stationuuid || station.source === 'official') return;
    try {
        await radioBrowser(`/json/url/${encodeURIComponent(station.stationuuid)}`, { timeout: 5000 });
    } catch {
        // Playback does not depend on the directory accepting its click count.
    }
}

async function playStation(station, index) {
    if (!station) return;
    const run = ++playbackRun;
    const changed = currentStation?.stationuuid !== station.stationuuid;
    if (changed) {
        audio.pause();
        setCurrentStation(station, index);
    }
    if (changed || !audio.currentSrc || audio.src !== station.url_resolved) {
        audio.dataset.uuid = station.stationuuid;
        audio.src = station.url_resolved;
        audio.load();
    }

    setPlayerState('loading', 'TUNING', `Connecting to ${station.name}...`);
    try {
        await audio.play();
        recordPlay(station);
    } catch (error) {
        if (run !== playbackRun || currentStation?.stationuuid !== station.stationuuid) return;
        if (error?.name === 'NotAllowedError') {
            setPlayerState('paused', 'READY', 'Press play again to start this station.');
            playToggle.setAttribute('aria-label', 'Play station');
            return;
        }
        const detail = mediaErrorDetail(audio, error);
        setSignalResult(station, { state: 'dead', label: signalFailureLabel(detail), detail });
        setPlayerState('error', 'NO SIGNAL', `${detail}. Choose another station or test the list.`);
        console.warn('RG Broadcast playback failed', error);
    }
}

function pauseStation() {
    audio.pause();
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
    setActivePreset();
    loadStations({ kind: 'search', field: searchField.value, value });
});

presetButtons.forEach(button => {
    button.addEventListener('click', () => {
        const preset = button.dataset.preset;
        searchQuery.value = '';
        setActivePreset(preset);
        loadStations(
            preset === 'top'
                ? { kind: 'top' }
                : preset === 'news'
                    ? { kind: 'news' }
                    : preset === 'night' ? { kind: 'night' } : { kind: 'tag', value: preset }
        );
    });
});

favoritesFilter.addEventListener('click', () => {
    favoritesOnly = !favoritesOnly;
    favoritesFilter.setAttribute('aria-pressed', String(favoritesOnly));
    setActivePreset();
    if (favoritesOnly) {
        resetSignalTests();
        stations = [...favorites];
        renderStations();
        resultsLabel.textContent = `SAVED  |  ${stations.length}`;
    } else {
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
    setPlayerState('playing', 'ON AIR', `Playing ${currentStation?.name || 'station'}.`);
    setSignalResult(currentStation, {
        state: 'ready',
        label: 'READY',
        detail: 'Playable audio confirmed by this receiver.'
    });
    playToggle.setAttribute('aria-label', 'Pause station');
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
});

audio.addEventListener('pause', () => {
    if (!currentStation || nowPlaying.dataset.state === 'error') return;
    setPlayerState('paused', 'PAUSED', `${currentStation.name} paused.`);
    playToggle.setAttribute('aria-label', 'Play station');
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
});

audio.addEventListener('waiting', () => {
    if (currentStation) setPlayerState('loading', 'TUNING', `Buffering ${currentStation.name}...`);
});

audio.addEventListener('error', () => {
    if (!currentStation || !audio.getAttribute('src') || audio.dataset.uuid !== currentStation.stationuuid) return;
    const detail = mediaErrorDetail(audio);
    setSignalResult(currentStation, { state: 'dead', label: signalFailureLabel(detail), detail });
    setPlayerState('error', 'NO SIGNAL', `${detail}. Choose another station or test the list.`);
    playToggle.setAttribute('aria-label', 'Retry station');
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'none';
});

audio.addEventListener('stalled', () => {
    if (currentStation) playerStatus.textContent = 'The stream is taking longer than expected.';
});

stationHome.addEventListener('click', event => {
    if (stationHome.getAttribute('aria-disabled') === 'true') event.preventDefault();
});

bindMediaSession();
updateFavoriteControls();
discoverServers().finally(() => {
    loadStations({ kind: 'top' });
    restoreLastStation();
});
