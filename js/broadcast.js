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
const NOW_PLAYING_REFRESH = 30000;
const BAND_FREQUENCIES = [
    87.9, 88.9, 90.0, 91.0, 92.0,
    93.1, 94.1, 95.1, 96.2, 97.2,
    98.2, 99.3, 100.3, 101.3, 102.4,
    103.4, 104.4, 105.5, 106.5, 107.5
];
const BAND_LOCK_DISTANCE = 0.42;
const NEWS_TERMS = ['Bloomberg', 'CNN', 'Fox News'];
const CONSPIRACY_TAGS = ['conspiracy', 'conspiracy theories', 'paranormal', 'ufo', 'uap'];
const ROCK_TAGS = ['rock', 'grunge', 'shoegaze', 'alternative rock', 'emo', 'screamo', 'post-hardcore'];
const TRIPPY_TAGS = ['psychedelic', 'experimental', 'freeform', 'space', 'ambient', 'drone'];
const BEHIND_THE_SCHEMES = {
    stationuuid: '54944202-69d5-4f89-9189-e949aeac59b8',
    name: 'Behind the Sch3m3s',
    url_resolved: 'https://scream.behindthesch3m3s.com/radio/8000/.mp3',
    homepage: 'https://behindthesch3m3s.com/',
    countrycode: 'US', codec: 'MP3', bitrate: 128,
    tags: 'conspiracy theories,independent talk', hls: false, lastcheckok: true, source: 'curated',
    description: 'Late-night conspiracy talk and independent broadcasts.',
    now_playing: { type: 'azuracast', url: 'https://scream.behindthesch3m3s.com/api/nowplaying/the_scaly_show' }
};
const OFFICIAL_NEWS_STATIONS = [{
    stationuuid: 'official-alex-jones-network',
    name: 'Alex Jones Network',
    url_resolved: 'https://stream.alexjones.media/stream/7/',
    homepage: 'https://alexjones.media/',
    countrycode: 'US',
    codec: 'AAC+',
    bitrate: 32,
    tags: 'infowars,alternative news,conspiracy,talk',
    hls: false,
    lastcheckok: true,
    source: 'official',
    description: 'Live Infowars network programming and alternative news.'
}];
const CURATED_TOP_STATIONS = [
    BEHIND_THE_SCHEMES,
    OFFICIAL_NEWS_STATIONS[0],
    {
        stationuuid: 'official-u7-art-bell', name: 'U7 Radio: Art Bell / Coast to Coast',
        url_resolved: 'https://u7radio.org/stream', homepage: 'https://u7radio.org/',
        countrycode: 'US', codec: 'MP3', bitrate: 0, tags: 'art bell,coast to coast,paranormal',
        hls: false, lastcheckok: true, source: 'official',
        description: '24/7 Art Bell and Coast to Coast archive rotation.'
    },
    {
        stationuuid: '15dced36-90ba-4c50-bc06-8156fe53433f', name: 'Ground Zero Plus',
        url_resolved: 'https://s2.radio.co/s7a9080f05/listen', homepage: 'https://groundzeroplus.com/',
        countrycode: 'US', codec: 'MP3', bitrate: 192, tags: 'paranormal,conspiracy,fringe science,talk',
        hls: false, lastcheckok: true, source: 'official',
        description: 'Clyde Lewis on paranormal events, hidden systems, and fringe science.',
        now_playing: { type: 'radio-co', url: 'https://public.radio.co/stations/s7a9080f05/status' }
    },
    {
        stationuuid: 'b21c058e-6f4b-4558-b1cf-cfeae8608f61', name: 'Free People of the Cosmos',
        url_resolved: 'https://podradio.us/stream/free-cosmos', homepage: 'https://podradio.us/',
        countrycode: 'US', codec: 'MP3', bitrate: 128, tags: 'ufo,uap,paranormal,podcast,talk',
        hls: false, lastcheckok: true, source: 'curated',
        description: 'UFO, UAP, paranormal, and contact-focused podcast rotation.',
        now_playing: {
            type: 'podradio',
            url: 'https://podradio.us/admin/modules/IceCastManager/nowplaying.php',
            slug: 'free-cosmos'
        }
    },
    {
        stationuuid: '1d565cd5-d5a7-457d-b212-557be006f31a', name: 'Dr. J Radio',
        url_resolved: 'https://podradio.us/stream/drjradio-live', homepage: 'https://podradio.us/',
        countrycode: 'US', codec: 'MP3', bitrate: 128, tags: 'ufo,paranormal,conspiracy,podcast,talk',
        hls: false, lastcheckok: true, source: 'curated',
        description: 'Paranormal interviews and long-form UFO and conspiracy talk.',
        now_playing: {
            type: 'podradio',
            url: 'https://podradio.us/admin/modules/IceCastManager/nowplaying.php',
            slug: 'drjradio-live'
        }
    },
    {
        stationuuid: 'd78d7518-9212-4541-91be-2a4a6bf1a945', name: 'KHNC 1360 "The Lion"',
        url_resolved: 'https://www.ophanim.net:8444/s/7250/', homepage: 'https://1360khnc.com/',
        countrycode: 'US', codec: 'MP3', bitrate: 48, tags: 'conspiracy,independent talk,politics',
        hls: false, lastcheckok: true, source: 'curated',
        description: 'Colorado independent talk mixing conspiracy, politics, and Christian programming.'
    },
    {
        stationuuid: '1e8febb5-722e-4975-aade-c3e07d4ac6ba', name: 'K-Star Talk Radio Network',
        url_resolved: 'https://c23.radioboss.fm/stream/204', homepage: 'https://www.kstartalkradio.com/',
        countrycode: 'US', codec: 'MP3', bitrate: 128, tags: 'conspiracy theories,alternative news,talk',
        hls: false, lastcheckok: true, source: 'curated',
        description: 'Conspiracy Radio programming, overnight talk, and independent alternative news.',
        now_playing: {
            type: 'radioboss',
            url: 'https://c23.radioboss.fm/w/nowplayinginfo?u=204',
            title_only: true
        }
    },
    {
        stationuuid: '445cbb3a-1c4e-49aa-a268-f5b6acfa8f2e', name: 'KEXP',
        url_resolved: 'https://kexp.streamguys1.com/kexp160.aac', homepage: 'https://www.kexp.org/',
        countrycode: 'US', codec: 'AAC', bitrate: 162, tags: 'alternative,indie,rock',
        hls: false, lastcheckok: true, source: 'curated',
        description: 'Seattle-led alternative, indie, punk, and left-field new music.'
    },
    {
        stationuuid: '021e14a0-ddda-4ed5-bf37-3f5744b65eeb', name: 'WFMU Freeform',
        url_resolved: 'https://stream0.wfmu.org/freeform-extrahigh-primary.aac', homepage: 'https://wfmu.org/',
        countrycode: 'US', codec: 'AAC+', bitrate: 256, tags: 'experimental,freeform',
        hls: false, lastcheckok: true, source: 'curated',
        description: 'Listener-supported freeform radio with experimental programming and no fixed format.'
    },
    {
        stationuuid: '96187609-0601-11e8-ae97-52543be04c81', name: '181.FM The Eagle',
        url_resolved: 'https://listen.181fm.com/181-eagle_128k.mp3', homepage: 'https://www.181.fm/',
        countrycode: 'US', codec: 'MP3', bitrate: 128, tags: 'classic rock',
        hls: false, lastcheckok: true, source: 'curated',
        description: 'Classic-rock heavy rotation built around the familiar deep catalog.'
    },
    {
        stationuuid: '9b65470b-c31d-4a3a-b57b-eea8c62c58c9', name: 'LITT Live: Grunge',
        url_resolved: 'https://das-sa39.cdnstream1.com/5570_128', homepage: 'https://littlive.com/grunge',
        countrycode: 'US', codec: 'MP3', bitrate: 128, tags: '90s,grunge,rock',
        hls: false, lastcheckok: true, source: 'curated',
        description: 'Nirvana, Alice in Chains, Soundgarden, Pearl Jam, and the wider 1990s grunge lane.'
    },
    {
        stationuuid: 'official-hearme-screamo-emo', name: 'Screamo Emo',
        url_resolved: 'https://radio.hearme.fm:8478/stream', homepage: 'https://hearme.fm/radio/screamo-emo/',
        countrycode: 'GB', codec: 'MP3', bitrate: 0, tags: 'emo,screamo,post-hardcore,punk',
        hls: false, lastcheckok: true, source: 'official',
        description: 'Emo, screamo, post-hardcore, and cathartic punk-adjacent rotation.',
        now_playing: {
            type: 'icecast',
            url: 'https://cors.eu.org/https://radio.hearme.fm:8478/status-json.xsl',
            note: 'OFFICIAL TITLE VIA PUBLIC READ BRIDGE'
        }
    },
    {
        stationuuid: '2887dc93-4c30-4981-8f60-a87d25a4386f', name: 'Static: 90s & 2000s Alt Rock',
        url_resolved: 'https://r.bgp.rodeo/listen/static/radio.mp3', homepage: 'https://r.bgp.rodeo/public/static',
        countrycode: 'US', codec: 'MP3', bitrate: 320, tags: '90s alternative,alternative rock,grunge,post-grunge',
        hls: false, lastcheckok: true, source: 'curated',
        description: '90s and 2000s alt-rock anthems, grunge, post-grunge, and loud car-speaker cuts.',
        now_playing: { type: 'azuracast', url: 'https://r.bgp.rodeo/api/nowplaying/static' }
    },
    {
        stationuuid: 'b5585301-1987-4605-9c4d-86da2488c0ad', name: 'DKFM Shoegaze Radio',
        url_resolved: 'https://kathy.torontocast.com:2005/stream', homepage: 'https://decayfm.com/',
        countrycode: 'US', codec: 'MP3', bitrate: 128, tags: 'rock,shoegaze,dream pop,new music',
        hls: false, lastcheckok: true, source: 'curated',
        description: 'Shoegaze and dream pop across classics, deep cuts, and new releases.',
        now_playing: { type: 'icecast', url: 'https://kathy.torontocast.com:2005/status-json.xsl' }
    },
    {
        stationuuid: '51745b10-5f95-49ab-bc53-068ad35fcee1', name: 'DKFM Edge',
        url_resolved: 'https://radio.streemlion.com:4405/stream', homepage: 'https://decayfm.com/dkfm-edge-2/',
        countrycode: 'US', codec: 'AAC+', bitrate: 64, tags: 'shoegaze,dream pop,new music',
        hls: false, lastcheckok: true, source: 'curated',
        description: 'The newest shoegaze and dream-pop releases in a tighter 24/7 rotation.',
        now_playing: { type: 'icecast', url: 'https://radio.streemlion.com:4405/status-json.xsl' }
    },
    {
        stationuuid: '960d3f6f-0601-11e8-ae97-52543be04c81', name: 'Space Station Soma',
        url_resolved: 'https://ice6.somafm.com/spacestation-128-aac', homepage: 'https://somafm.com/spacestation/',
        countrycode: 'US', codec: 'AAC', bitrate: 128, tags: 'ambient,electronic,space',
        hls: false, lastcheckok: true, source: 'curated',
        description: 'Spaced-out ambient and mid-tempo electronica for long orbital listening.',
        now_playing: { type: 'somafm', url: 'https://somafm.com/songs/spacestation.json' }
    },
    {
        stationuuid: '960eb2e9-0601-11e8-ae97-52543be04c81', name: 'Drone Zone',
        url_resolved: 'https://ice2.somafm.com/dronezone-128-mp3', homepage: 'https://somafm.com/dronezone/',
        countrycode: 'US', codec: 'MP3', bitrate: 128, tags: 'ambient,atmospheric,drone',
        hls: false, lastcheckok: true, source: 'curated',
        description: 'Deep ambient drones and atmospheric sound without the hard edges.',
        now_playing: { type: 'somafm', url: 'https://somafm.com/songs/dronezone.json' }
    },
    {
        stationuuid: '9614eb15-0601-11e8-ae97-52543be04c81', name: 'Mission Control',
        url_resolved: 'https://ice5.somafm.com/missioncontrol-128-mp3', homepage: 'https://somafm.com/missioncontrol/',
        countrycode: 'US', codec: 'MP3', bitrate: 128, tags: 'experimental,space program',
        hls: false, lastcheckok: true, source: 'curated',
        description: 'Space-program audio folded into experimental ambient transmission.',
        now_playing: { type: 'somafm', url: 'https://somafm.com/songs/missioncontrol.json' }
    },
    {
        stationuuid: '70133397-5845-4524-bcda-701da75f46fa', name: 'HEADY',
        url_resolved: 'https://c22.radioboss.fm:18364/stream', homepage: 'https://www.heady.fm/',
        countrycode: 'US', codec: 'AAC', bitrate: 320, tags: 'indie rock,psychedelic rock',
        hls: false, lastcheckok: true, source: 'curated',
        description: 'Modern psychedelic and underground indie rock, commercial-free.',
        now_playing: { type: 'icecast', url: 'https://c22.radioboss.fm:18364/status-json.xsl' }
    }
];

const audio = document.getElementById('radio-audio');
const nowPlaying = document.getElementById('now-playing');
const airLabel = document.getElementById('air-label');
const currentName = document.getElementById('current-name');
const currentDescription = document.getElementById('current-description');
const currentProgramLabel = document.getElementById('current-program-label');
const currentProgram = document.getElementById('current-program');
const currentProgramNote = document.getElementById('current-program-note');
const currentGenre = document.getElementById('current-genre');
const currentOrigin = document.getElementById('current-origin');
const currentQuality = document.getElementById('current-quality');
const currentSource = document.getElementById('current-source');
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
let lastRequest = { kind: 'top20' };
let favoritesOnly = false;
let favorites = loadFavorites();
let playbackRun = 0;
let playPending = false;
let signalTestRun = 0;
let stationRequestRun = 0;
let bandStations = [];
let bandPointerStart = null;
let nowPlayingRun = 0;
let nowPlayingTimer = null;
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

function curatedMatches(terms) {
    const needles = (Array.isArray(terms) ? terms : [terms])
        .map(term => String(term).trim().toLowerCase())
        .filter(Boolean);
    if (!needles.length) return [];
    return CURATED_TOP_STATIONS.filter(station => {
        const haystack = `${station.name} ${station.tags || ''}`.toLowerCase();
        return needles.some(needle => haystack.includes(needle));
    });
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

function stationTags(station, limit = 3) {
    return String(station.tags || '')
        .split(',')
        .map(tag => tag.trim())
        .filter(Boolean)
        .slice(0, limit);
}

function stationDescription(station) {
    if (station.description) return station.description;
    const tags = stationTags(station);
    const format = tags.length ? tags.join(', ') : 'internet radio';
    const origin = station.countrycode ? ` from ${station.countrycode.toUpperCase()}` : '';
    return `Live ${format}${origin}.`;
}

function stationOrigin(station) {
    const parts = [station.state, station.countrycode]
        .map(value => String(value || '').trim())
        .filter(Boolean);
    return parts.length ? parts.join(', ').toUpperCase() : 'INTERNET';
}

function stationQuality(station) {
    const codec = String(station.codec || '').trim().toUpperCase();
    const bitrate = Number(station.bitrate) > 0 ? `${Number(station.bitrate)} KBPS` : '';
    return [codec, bitrate].filter(Boolean).join(' / ') || 'LIVE STREAM';
}

function stationSource(station) {
    if (station.source === 'official') return 'OFFICIAL FEED';
    if (station.source === 'curated') return 'CURATED DIRECT';
    return 'RADIO BROWSER';
}

function stationFormat(station) {
    const tags = stationTags(station, 4);
    return tags.length ? tags.join(' / ').toUpperCase() : 'LIVE INTERNET RADIO';
}

function setProgramFallback(station, note = 'LIVE TITLE NOT PUBLISHED') {
    currentProgramLabel.textContent = 'ON THIS SIGNAL';
    currentProgram.textContent = stationFormat(station);
    currentProgramNote.textContent = `STATION FORMAT  /  ${note}`;
    currentProgram.closest('.program-readout').dataset.state = 'format';
    updateMediaSession(station);
}

function reportNowPlayingSurface(station, state, label, detail) {
    const config = station?.now_playing;
    if (!config?.url) return;
    surfaceMonitor.report(`metadata:${station.stationuuid}:${config.url}`, {
        kind: 'NOW PLAYING API',
        auth: 'NO KEY',
        name: `${station.name} live metadata`,
        url: config.url,
        state,
        label,
        detail
    });
}

function icecastSource(data, config) {
    const source = data?.icestats?.source;
    const sources = Array.isArray(source) ? source : source ? [source] : [];
    if (!sources.length) return null;
    const match = String(config.match || '').toLowerCase();
    if (match) {
        const matched = sources.find(item =>
            `${item.server_name || ''} ${item.listenurl || ''}`.toLowerCase().includes(match)
        );
        if (matched) return matched;
    }
    return sources.find(item => String(item.title || '').trim()) || sources[0];
}

function cleanProgramText(value) {
    return String(value || '')
        .replace(/[\u0000-\u001f\u007f]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 180);
}

function validProgramTitle(station, value) {
    const title = cleanProgramText(value);
    if (!title) return '';
    const lowered = title.toLowerCase().replace(/[.!]+$/g, '');
    const placeholders = new Set([
        'unknown', 'unknown track', 'no title', 'untitled', 'stream', 'live',
        'live stream', 'radio', 'auto dj', 'autodj', 'loading', 'loading...',
        'carregando', 'carregando...'
    ]);
    if (placeholders.has(lowered)) return '';
    if (lowered === cleanProgramText(station?.name).toLowerCase()) return '';
    if (lowered === cleanProgramText(stationFormat(station)).toLowerCase()) return '';
    return title;
}

function programResult(station, value, note) {
    const title = validProgramTitle(station, value);
    return title ? { title, note } : null;
}

function parseNowPlaying(station, config, data) {
    if (config.type === 'radio-co') {
        const listeners = Number(data?.listeners);
        const note = Number.isFinite(listeners) ? `${listeners} LISTENING  /  LIVE NETWORK DATA` : 'LIVE NETWORK DATA';
        return programResult(station, data?.current_track?.title, note);
    }

    if (config.type === 'somafm') {
        const song = Array.isArray(data?.songs) ? data.songs[0] : null;
        if (!song) return null;
        const artist = cleanProgramText(song.artist);
        const title = cleanProgramText(song.title);
        const album = cleanProgramText(song.album);
        if (!artist && !title) return null;
        const note = album ? `${album.toUpperCase()}  /  SOMAFM LIVE DATA` : 'SOMAFM LIVE DATA';
        return programResult(station, [artist, title].filter(Boolean).join('  /  '), note);
    }

    if (config.type === 'icecast') {
        const source = icecastSource(data, config);
        if (!source) return null;
        const listeners = Number(source.listeners);
        const genre = cleanProgramText(source.genre);
        const note = [
            Number.isFinite(listeners) ? `${listeners} LISTENING` : '',
            genre ? genre.toUpperCase() : '',
            config.note || 'LIVE SERVER DATA'
        ].filter(Boolean).join('  /  ');
        return programResult(station, source?.title, note);
    }

    if (config.type === 'azuracast') {
        const payload = Array.isArray(data)
            ? data.find(item => !config.slug || item?.station?.shortcode === config.slug)
            : data;
        const song = payload?.now_playing?.song;
        const artist = cleanProgramText(song?.artist);
        const title = cleanProgramText(song?.title);
        const text = cleanProgramText(song?.text);
        const album = cleanProgramText(song?.album);
        const listeners = Number(payload?.listeners?.current);
        const display = artist || title
            ? [artist, title].filter(Boolean).join('  /  ')
            : text;
        const note = [
            Number.isFinite(listeners) ? `${listeners} LISTENING` : '',
            album ? album.toUpperCase() : '',
            'AZURACAST LIVE DATA'
        ].filter(Boolean).join('  /  ');
        return programResult(station, display, note);
    }

    if (config.type === 'podradio') {
        return programResult(station, data?.now?.[config.slug], 'PODRADIO LIVE DATA');
    }

    if (config.type === 'radioboss') {
        const artist = cleanProgramText(data?.currenttrack_artist);
        const title = cleanProgramText(data?.currenttrack_title);
        const display = config.title_only
            ? title || data?.nowplaying || data?.currenttrack
            : artist || title
                ? [artist, title].filter(Boolean).join('  /  ')
                : data?.nowplaying || data?.currenttrack;
        return programResult(station, display, 'RADIOBOSS LIVE DATA');
    }

    return null;
}

function stopNowPlayingUpdates() {
    nowPlayingRun += 1;
    if (nowPlayingTimer !== null) window.clearTimeout(nowPlayingTimer);
    nowPlayingTimer = null;
}

function startNowPlayingUpdates(station) {
    stopNowPlayingUpdates();
    setProgramFallback(station);
    const config = station.now_playing;
    if (!config?.url) return;

    const run = nowPlayingRun;
    async function refresh() {
        reportNowPlayingSurface(station, 'checking', 'CHECKING', 'Reading public live-title data for the selected station.');
        try {
            const response = await fetch(config.url, {
                headers: { Accept: 'application/json' },
                cache: 'no-store',
                signal: timeoutSignal(6500)
            });
            if (!response.ok) throw new Error(`Metadata returned ${response.status}`);
            const data = await response.json();
            if (run !== nowPlayingRun || currentStation?.stationuuid !== station.stationuuid) return;
            const program = parseNowPlaying(station, config, data);
            if (!program) throw new Error('No current title was published');
            currentProgramLabel.textContent = 'NOW PLAYING';
            currentProgram.textContent = program.title;
            currentProgramNote.textContent = program.note;
            currentProgram.closest('.program-readout').dataset.state = 'live';
            reportNowPlayingSurface(station, 'ready', 'LIVE', program.note);
            updateMediaSession(station, program.title);
        } catch (error) {
            if (run !== nowPlayingRun || currentStation?.stationuuid !== station.stationuuid) return;
            setProgramFallback(station, 'LIVE TITLE TEMPORARILY UNAVAILABLE');
            reportNowPlayingSurface(station, 'error', 'UNAVAILABLE', error.message);
        }
        if (run === nowPlayingRun && currentStation?.stationuuid === station.stationuuid) {
            nowPlayingTimer = window.setTimeout(refresh, NOW_PLAYING_REFRESH);
        }
    }

    refresh();
}

function safeHttpsUrl(value) {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' ? url.href : '';
    } catch {
        return '';
    }
}

function topStationIndex(station) {
    if (!station) return -1;
    return CURATED_TOP_STATIONS.findIndex(item => item.stationuuid === station.stationuuid);
}

function stationListenUrl(station) {
    const url = new URL(location.pathname, location.origin);
    url.searchParams.set('station', station.stationuuid);
    return url.href;
}

function shareCardFilename(station) {
    const slug = station.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 54);
    return `rg-broadcast-${slug || 'top-20'}.png`;
}

function wrapCanvasText(context, text, maxWidth, maxLines) {
    const words = String(text).trim().split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';

    words.forEach(word => {
        const candidate = line ? `${line} ${word}` : word;
        if (!line || context.measureText(candidate).width <= maxWidth) {
            line = candidate;
            return;
        }
        if (lines.length < maxLines - 1) {
            lines.push(line);
            line = word;
        } else {
            line = `${line} ${word}`;
        }
    });
    if (line) lines.push(line);

    if (lines.length > maxLines) lines.length = maxLines;
    const lastIndex = lines.length - 1;
    if (lastIndex >= 0 && context.measureText(lines[lastIndex]).width > maxWidth) {
        let shortened = lines[lastIndex];
        while (shortened.length && context.measureText(`${shortened}...`).width > maxWidth) {
            shortened = shortened.slice(0, -1).trimEnd();
        }
        lines[lastIndex] = `${shortened}...`;
    }
    return lines;
}

function shareCardSignal(station) {
    if (currentStation?.stationuuid === station.stationuuid && nowPlaying.dataset.state === 'playing') {
        return { label: 'ON AIR', bars: 5, color: 'green' };
    }
    const result = signalResults.get(station.stationuuid);
    if (result?.state === 'ready') return { label: 'SIGNAL READY', bars: 5, color: 'green' };
    if (result?.state === 'dead') return { label: result.label || 'NO SIGNAL', bars: 1, color: 'red' };
    return { label: 'CURATED LOCK', bars: 4, color: 'amber' };
}

function stationCardBlob(station, slotIndex) {
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 630;
    const context = canvas.getContext('2d');
    if (!context) return Promise.reject(new Error('Canvas is not available'));

    const colors = {
        black: '#0a0b0b', panel: '#111313', paper: '#e6dfcd', muted: '#938e82',
        amber: '#e6a04a', green: '#86b59c', red: '#d34f3f', line: '#4a4842'
    };
    const frequency = BAND_FREQUENCIES[slotIndex].toFixed(1);
    const signal = shareCardSignal(station);
    const listenUrl = stationListenUrl(station);
    const displayUrl = listenUrl.replace(/^https?:\/\//, '');
    const tags = String(station.tags || 'live internet radio')
        .split(',')
        .map(tag => tag.trim().toUpperCase())
        .filter(Boolean)
        .slice(0, 3)
        .join(' / ');

    context.fillStyle = colors.black;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = colors.panel;
    context.fillRect(36, 36, canvas.width - 72, canvas.height - 72);
    context.strokeStyle = colors.line;
    context.lineWidth = 2;
    context.strokeRect(36, 36, canvas.width - 72, canvas.height - 72);
    context.fillStyle = colors.amber;
    context.fillRect(36, 36, canvas.width - 72, 7);

    context.textBaseline = 'alphabetic';
    context.fillStyle = colors.paper;
    context.font = '700 30px "Arial Narrow", "Helvetica Neue", Arial, sans-serif';
    context.fillText('RG BROADCAST', 74, 94);
    context.fillStyle = colors.amber;
    context.font = '700 18px "Courier New", monospace';
    context.fillText(`TOP 20 / LOCK ${String(slotIndex + 1).padStart(2, '0')}`, 75, 126);

    context.textAlign = 'right';
    context.fillStyle = colors.paper;
    context.font = '900 72px "Arial Narrow", "Helvetica Neue", Arial, sans-serif';
    context.fillText(frequency, 1115, 104);
    context.fillStyle = colors.muted;
    context.font = '700 18px "Courier New", monospace';
    context.fillText('RG BAND / DISPLAY SCALE', 1113, 130);
    context.textAlign = 'left';

    context.fillStyle = colors.paper;
    context.font = '900 78px "Arial Narrow", "Helvetica Neue", Arial, sans-serif';
    const nameLines = wrapCanvasText(context, station.name, 1020, 2);
    nameLines.forEach((line, index) => context.fillText(line, 74, 242 + index * 82));

    context.fillStyle = colors.muted;
    context.font = '700 20px "Courier New", monospace';
    context.fillText(tags, 76, 391);

    const bandStart = 76;
    const bandEnd = 1124;
    const bandY = 461;
    context.fillStyle = colors.line;
    context.fillRect(bandStart, bandY - 1, bandEnd - bandStart, 2);
    BAND_FREQUENCIES.forEach((value, index) => {
        const x = bandStart + (index / (BAND_FREQUENCIES.length - 1)) * (bandEnd - bandStart);
        const active = index === slotIndex;
        context.fillStyle = active ? colors.amber : colors.muted;
        context.fillRect(x - (active ? 3 : 1), bandY - (active ? 21 : 9), active ? 6 : 2, active ? 42 : 18);
    });

    for (let index = 0; index < 5; index += 1) {
        const height = 8 + index * 6;
        context.fillStyle = index < signal.bars ? colors[signal.color] : colors.line;
        context.fillRect(76 + index * 12, 529 - height, 7, height);
    }
    context.fillStyle = colors.paper;
    context.font = '700 17px "Courier New", monospace';
    context.fillText(signal.label, 151, 527);
    context.textAlign = 'right';
    context.fillStyle = colors.amber;
    context.fillText(`${String(slotIndex + 1).padStart(2, '0')} / 20`, 1123, 527);
    context.textAlign = 'left';

    context.fillStyle = colors.muted;
    context.font = '16px "Courier New", monospace';
    context.fillText(`LISTEN  ${displayUrl}`, 76, 576, 1048);
    context.fillStyle = colors.red;
    context.fillRect(1113, 566, 10, 10);

    return new Promise((resolve, reject) => {
        canvas.toBlob(blob => {
            if (blob) resolve(blob);
            else reject(new Error('Card image could not be created'));
        }, 'image/png');
    });
}

function downloadShareCard(blob, filename) {
    const link = document.createElement('a');
    const objectUrl = URL.createObjectURL(blob);
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

async function copyStationLink(url) {
    if (!navigator.clipboard?.writeText) return false;
    try {
        await navigator.clipboard.writeText(url);
        return true;
    } catch {
        return false;
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
        state: station.state || '',
        codec: station.codec || '',
        bitrate: Number(station.bitrate) || 0,
        tags: station.tags || '',
        description: station.description || '',
        now_playing: station.now_playing || null,
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
    stopNowPlayingUpdates();
    currentStation = null;
    currentIndex = -1;
    currentName.textContent = 'Quiet band';
    currentDescription.textContent = 'No station occupies this part of the current internet band.';
    currentProgramLabel.textContent = 'ON THIS SIGNAL';
    currentProgram.textContent = 'STATIC';
    currentProgramNote.textContent = 'MOVE TOWARD A MARKER TO LOCK';
    currentProgram.closest('.program-readout').dataset.state = 'format';
    currentGenre.textContent = '—';
    currentOrigin.textContent = '—';
    currentQuality.textContent = '—';
    currentSource.textContent = '—';
    playToggle.disabled = true;
    favoriteToggle.disabled = true;
    shareButton.disabled = true;
    shareButton.title = 'Share cards are available for Top 20 stations';
    shareButton.setAttribute('aria-label', 'Share cards are available for Top 20 stations');
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

function snapBandToPointer(event) {
    if (!bandStations.length) return;
    const bounds = bandTuner.getBoundingClientRect();
    if (!bounds.width) return;
    const ratio = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
    const bandMinimum = Number(bandTuner.min) / 10;
    const bandMaximum = Number(bandTuner.max) / 10;
    const clickedFrequency = bandMinimum + ratio * (bandMaximum - bandMinimum);
    const nearest = bandStations.reduce((best, slot) => (
        !best || Math.abs(slot.frequency - clickedFrequency) < Math.abs(best.frequency - clickedFrequency)
            ? slot : best
    ), null);
    if (!nearest) return;

    if (!audio.paused || playPending) pauseStation();
    bandTuner.value = String(Math.round(nearest.frequency * 10));
    updateBandFromTuner();
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
            : nightSearch ? 'No after-dark stations answered this pass. Try the night again.' : 'Try another station name or genre.';
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
        select.innerHTML = `
            <strong></strong>
            <span class="station-description"></span>
            <span class="station-detail"></span>
            <span class="signal-state"></span>
        `;
        select.querySelector('strong').textContent = station.name.trim();
        select.querySelector('.station-description').textContent = stationDescription(station);
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
    if (preset === 'top20') return { kind: 'top20' };
    if (preset === 'news') return { kind: 'news' };
    if (preset === 'conspiracy') return { kind: 'conspiracy' };
    if (preset === 'rock') return { kind: 'rock' };
    if (preset === 'trippy') return { kind: 'trippy' };
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
    if (request.kind === 'top20') {
        label = 'TOP 20';
    } else if (request.kind === 'news') {
        label = 'NEWS DESK';
    } else if (request.kind === 'conspiracy') {
        label = 'CONSPIRACY';
    } else if (request.kind === 'rock') {
        label = 'ROCK';
    } else if (request.kind === 'trippy') {
        label = 'TRIPPY';
    } else if (request.kind === 'us') {
        path = `/json/stations/search?countrycode=US&is_https=true&hidebroken=true&order=clickcount&reverse=true&limit=${RESULT_LIMIT}`;
        label = 'US LIVE';
    } else if (request.kind === 'tag') {
        const tag = encodeURIComponent(request.value);
        path = `/json/stations/search?tag=${tag}&countrycode=US&is_https=true&hidebroken=true&order=clickcount&reverse=true&limit=${RESULT_LIMIT}`;
        label = request.value.toUpperCase();
    } else if (request.kind === 'search') {
        label = `RESULTS: ${request.value.toUpperCase()}`;
    } else if (request.kind === 'night') {
        path = '/json/stations/search?has_geo_info=true&is_https=true&hidebroken=true&order=random&limit=250';
        label = 'FOLLOW THE NIGHT';
    } else {
        path = `/json/stations/search?countrycode=US&is_https=true&hidebroken=true&order=clickcount&reverse=true&limit=${RESULT_LIMIT}`;
        label = 'US LIVE';
    }

    try {
        let data;
        if (request.kind === 'top20') {
            data = CURATED_TOP_STATIONS;
        } else if (request.kind === 'news') {
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
                BEHIND_THE_SCHEMES,
                ...OFFICIAL_NEWS_STATIONS,
                ...curatedMatches(CONSPIRACY_TAGS),
                ...responses.flatMap(response => response.status === 'fulfilled' ? response.value.data : [])
            ];
        } else if (request.kind === 'rock') {
            const responses = await Promise.allSettled(ROCK_TAGS.map(tag => radioBrowser(
                `/json/stations/search?tag=${encodeURIComponent(tag)}&countrycode=US&is_https=true&hidebroken=true&order=clickcount&reverse=true&limit=15`
            )));
            data = [
                ...curatedMatches([...ROCK_TAGS, 'dream pop']),
                ...responses.flatMap(response => response.status === 'fulfilled' ? response.value.data : [])
            ];
        } else if (request.kind === 'trippy') {
            const responses = await Promise.allSettled(TRIPPY_TAGS.map(tag => radioBrowser(
                `/json/stations/search?tag=${encodeURIComponent(tag)}&countrycode=US&is_https=true&hidebroken=true&order=clickcount&reverse=true&limit=15`
            )));
            data = [
                ...curatedMatches([...TRIPPY_TAGS, 'spy', 'microtonal']),
                ...responses.flatMap(response => response.status === 'fulfilled' ? response.value.data : [])
            ];
        } else if (request.kind === 'search') {
            const term = encodeURIComponent(request.value);
            const responses = await Promise.allSettled(['name', 'tag'].map(field => radioBrowser(
                `/json/stations/search?${field}=${term}&countrycode=US&is_https=true&hidebroken=true&order=clickcount&reverse=true&limit=25`
            )));
            const successful = responses.filter(response => response.status === 'fulfilled');
            const localMatches = curatedMatches(request.value);
            if (!successful.length && !localMatches.length) {
                throw responses[0]?.reason || new Error('Station search did not answer');
            }
            data = [
                ...localMatches,
                ...successful.flatMap(response => response.value.data)
            ];
        } else {
            ({ data } = await radioBrowser(path));
            if (request.kind === 'tag') data = [...curatedMatches(request.value), ...data];
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
    currentDescription.textContent = stationDescription(station);
    currentGenre.textContent = stationFormat(station);
    currentOrigin.textContent = stationOrigin(station);
    currentQuality.textContent = stationQuality(station);
    currentSource.textContent = stationSource(station);
    startNowPlayingUpdates(station);
    favoriteToggle.disabled = false;
    const shareSlot = topStationIndex(station);
    const hasShareCard = shareSlot >= 0;
    shareButton.disabled = !hasShareCard;
    shareButton.title = hasShareCard
        ? `Share Top 20 card for ${station.name}`
        : 'Share cards are available for Top 20 stations';
    shareButton.setAttribute('aria-label', shareButton.title);

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

function updateMediaSession(station, programTitle = '') {
    if (!('mediaSession' in navigator) || !('MediaMetadata' in window)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
        title: programTitle || station.name,
        artist: programTitle ? station.name : stationFormat(station),
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
        const curated = CURATED_TOP_STATIONS.find(station => station.stationuuid === requestedUuid);
        if (curated) {
            setCurrentStation(curated, topStationIndex(curated));
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
    loadStations({ kind: 'search', value });
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

bandTuner.addEventListener('pointerdown', event => {
    bandPointerStart = { x: event.clientX, y: event.clientY };
});

bandTuner.addEventListener('pointerup', event => {
    const start = bandPointerStart;
    bandPointerStart = null;
    if (!start || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8) return;
    snapBandToPointer(event);
});

bandTuner.addEventListener('pointercancel', () => {
    bandPointerStart = null;
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
    const station = currentStation;
    const slotIndex = topStationIndex(station);
    if (!station || slotIndex < 0) return;
    const url = stationListenUrl(station);
    const title = `${station.name} | RG Broadcast`;
    const text = `Listen to ${station.name} on RG Broadcast.`;
    shareButton.disabled = true;
    shareButton.setAttribute('aria-busy', 'true');
    playerStatus.textContent = 'Capturing tuner card...';
    try {
        const blob = await stationCardBlob(station, slotIndex);
        const filename = shareCardFilename(station);
        const file = typeof File === 'function' ? new File([blob], filename, { type: 'image/png' }) : null;
        let canShareFile = false;
        try {
            canShareFile = Boolean(
                file && navigator.share && navigator.canShare && navigator.canShare({ files: [file] })
            );
        } catch {
            // File sharing support varies; the download fallback remains available.
        }

        if (canShareFile) {
            try {
                await navigator.share({ title, text, url, files: [file] });
                playerStatus.textContent = 'Share card opened.';
                return;
            } catch (error) {
                if (error?.name === 'AbortError') {
                    playerStatus.textContent = 'Share cancelled.';
                    return;
                }
            }
        }

        downloadShareCard(blob, filename);
        const copied = await copyStationLink(url);
        playerStatus.textContent = copied
            ? 'Share card downloaded. Station link copied.'
            : 'Share card downloaded.';
    } catch (error) {
        playerStatus.textContent = 'Share card was not available.';
    } finally {
        shareButton.removeAttribute('aria-busy');
        shareButton.disabled = topStationIndex(currentStation) < 0;
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
setActivePreset('top20');
loadStations({ kind: 'top20' });
restoreLastStation();
discoverServers();
