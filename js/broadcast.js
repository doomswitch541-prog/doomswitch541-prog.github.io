const BOOTSTRAP_SERVER = 'https://all.api.radio-browser.info';
const FALLBACK_SERVERS = [
    'https://de1.api.radio-browser.info',
    'https://nl1.api.radio-browser.info',
    'https://at1.api.radio-browser.info'
];
const FAVORITES_KEY = 'rg-broadcast-favorites-v1';
const LAST_STATION_KEY = 'rg-broadcast-last-station-v1';
const RESULT_LIMIT = 50;

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
    const seen = new Set();
    return items.filter(station => {
        const stream = String(station.url_resolved || '');
        const uuid = String(station.stationuuid || '');
        if (!uuid || !String(station.name || '').trim()) return false;
        if (!stream.startsWith('https://')) return false;
        if ((Number(station.hls) === 1 || station.hls === true) && !supportsNativeHls) return false;
        if (Number(station.lastcheckok) !== 1 && station.lastcheckok !== true) return false;
        if (seen.has(uuid)) return false;
        seen.add(uuid);
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
        select.innerHTML = `<strong></strong><span></span>`;
        select.querySelector('strong').textContent = station.name.trim();
        select.querySelector('span').textContent = stationDetail(station);
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
    updateRowFavorites();
    updateTransportAvailability();
}

function setDirectoryLoading(label) {
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
    if (request.kind === 'tag') {
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
        const { data } = await radioBrowser(path);
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
    if (!station?.stationuuid) return;
    try {
        await radioBrowser(`/json/url/${encodeURIComponent(station.stationuuid)}`, { timeout: 5000 });
    } catch {
        // Playback does not depend on the directory accepting its click count.
    }
}

async function playStation(station, index) {
    if (!station) return;
    const changed = currentStation?.stationuuid !== station.stationuuid;
    if (changed) {
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
        setCurrentStation(station, index);
        audio.src = station.url_resolved;
    }

    setPlayerState('loading', 'TUNING', `Connecting to ${station.name}...`);
    try {
        await audio.play();
        recordPlay(station);
    } catch (error) {
        setPlayerState('error', 'NO SIGNAL', 'This stream did not start. Choose another station.');
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
                : preset === 'night' ? { kind: 'night' } : { kind: 'tag', value: preset }
        );
    });
});

favoritesFilter.addEventListener('click', () => {
    favoritesOnly = !favoritesOnly;
    favoritesFilter.setAttribute('aria-pressed', String(favoritesOnly));
    setActivePreset();
    if (favoritesOnly) {
        stations = [...favorites];
        renderStations();
        resultsLabel.textContent = `SAVED  |  ${stations.length}`;
    } else {
        loadStations(lastRequest);
    }
});

randomButton.addEventListener('click', () => {
    if (!stations.length) return;
    const index = Math.floor(Math.random() * stations.length);
    playStation(stations[index], index);
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
    setPlayerState('playing', 'ON AIR', `Playing ${currentStation?.name || 'station'}.`);
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
    setPlayerState('error', 'NO SIGNAL', 'This stream stopped or could not be played. Choose another station.');
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
