        import { createRadioSurfaceMonitor, safeSurfaceUrl } from '/js/radio-surfaces.js';

        const BOOTSTRAP_SERVER = 'https://all.api.radio-browser.info';
        const FALLBACK_SERVERS = [
            'https://de1.api.radio-browser.info',
            'https://nl1.api.radio-browser.info',
            'https://at1.api.radio-browser.info'
        ];
        const STREAM_TIMEOUT = 7000;
        const surfaceMonitor = createRadioSurfaceMonitor({ root: 'legacySurfaceList' });

        // Debug Logger
        function log(msg, type = 'info') {
            const logEl = document.getElementById('apiLog');
            const entry = document.createElement('div');
            entry.className = `log-entry ${type}`;
            const time = new Date().toLocaleTimeString().split(' ')[0];
            entry.textContent = `[${time}] ${msg}`;
            logEl.appendChild(entry);
            logEl.scrollTop = logEl.scrollHeight;
            console.log(`[${type.toUpperCase()}] ${msg}`);
        }

        let debugExpanded = true;
        function toggleDebug() {
            const content = document.getElementById('debugContent');
            debugExpanded = !debugExpanded;
            content.style.display = debugExpanded ? 'grid' : 'none';
        }

        // The USB snapshot names this canvas but leaves its implementation as a
        // literal placeholder. Rebuild the intended CRT snow locally: no
        // network input, a deliberately low resolution, and one still frame
        // when reduced motion is requested.
        function startStaticCanvas() {
            const canvas = document.getElementById('staticCanvas');
            const context = canvas?.getContext('2d', { alpha: true });
            if (!canvas || !context) return;

            const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            let frame = 0;
            let lastPaint = 0;

            function resize() {
                canvas.width = Math.max(120, Math.floor(window.innerWidth / 5));
                canvas.height = Math.max(90, Math.floor(window.innerHeight / 5));
                paint();
            }

            function paint() {
                const image = context.createImageData(canvas.width, canvas.height);
                for (let offset = 0; offset < image.data.length; offset += 4) {
                    const value = Math.random() * 255;
                    image.data[offset] = value;
                    image.data[offset + 1] = value * 0.78;
                    image.data[offset + 2] = value * 0.34;
                    image.data[offset + 3] = 150;
                }
                context.putImageData(image, 0, 0);
            }

            function animate(time) {
                if (time - lastPaint > 85) {
                    paint();
                    lastPaint = time;
                }
                frame = requestAnimationFrame(animate);
            }

            window.addEventListener('resize', resize, { passive: true });
            document.addEventListener('visibilitychange', () => {
                if (reduceMotion) return;
                cancelAnimationFrame(frame);
                if (!document.hidden) frame = requestAnimationFrame(animate);
            });
            resize();
            if (!reduceMotion) frame = requestAnimationFrame(animate);
        }

        // Centralized State - Single source of truth
        const state = {
            stations: [],
            testedStreams: {},
            testDetails: {},
            currentStationIndex: -1,  // -1 means no station locked
            isPlaying: false,
            isDragging: false,
            testRun: 0
        };

        // Backwards compatibility getters
        let stations = state.stations;
        let testedStreams = state.testedStreams;
        let currentStation = null;
        let isPlaying = false;

        function timeoutSignal(milliseconds) {
            if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
                return AbortSignal.timeout(milliseconds);
            }
            const controller = new AbortController();
            window.setTimeout(() => controller.abort(), milliseconds);
            return controller.signal;
        }

        function shuffled(items) {
            const copy = [...new Set(items)];
            for (let index = copy.length - 1; index > 0; index -= 1) {
                const swapWith = Math.floor(Math.random() * (index + 1));
                [copy[index], copy[swapWith]] = [copy[swapWith], copy[index]];
            }
            return copy;
        }

        function stationStreamUrls(station) {
            return [...new Set([station.url_resolved, station.url]
                .map(value => String(value || '').trim())
                .filter(value => value.startsWith('https://')))];
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
                    signal: timeoutSignal(6500),
                    cache: 'no-store'
                });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const data = await response.json();
                const discovered = data
                    .map(item => item?.name ? `https://${item.name}` : '')
                    .filter(Boolean);
                surfaceMonitor.report('directory-bootstrap', {
                    state: 'ready', label: 'LIVE',
                    detail: `HTTP ${response.status} · ${discovered.length} mirrors · ${Math.round(performance.now() - startedAt)} ms`
                });
                return shuffled([...discovered, ...FALLBACK_SERVERS]);
            } catch (error) {
                surfaceMonitor.report('directory-bootstrap', {
                    state: 'error', label: 'FALLBACK', detail: error.message
                });
                return shuffled(FALLBACK_SERVERS);
            }
        }

        async function queryRadioBrowser(path) {
            const servers = await discoverServers();
            let lastError;
            for (const server of servers) {
                const url = `${server}${path}`;
                const id = `directory:${url}`;
                const startedAt = performance.now();
                surfaceMonitor.report(id, {
                    kind: 'DIRECTORY API', auth: 'KEYLESS', name: 'US news station search',
                    url, state: 'checking', label: 'CHECKING', detail: 'Public read-only GET.'
                });
                try {
                    const response = await fetch(url, {
                        headers: { Accept: 'application/json' },
                        signal: timeoutSignal(9000),
                        cache: 'no-store'
                    });
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                    const data = await response.json();
                    surfaceMonitor.report(id, {
                        state: 'ready', label: 'LIVE',
                        detail: `HTTP ${response.status} · ${data.length} candidates · ${Math.round(performance.now() - startedAt)} ms`
                    });
                    return data;
                } catch (error) {
                    lastError = error;
                    surfaceMonitor.report(id, {
                        state: 'error', label: 'FAILED', detail: error.message
                    });
                }
            }
            throw lastError || new Error('No Radio Browser mirror answered');
        }

        async function loadStations() {
            log('Fetching keyless US news directory...', 'info');
            document.getElementById('connectionStatus').textContent = 'DIRECTORY...';
            document.getElementById('apiStatusText').textContent = 'API: Checking';
            document.getElementById('apiStatusDot').className = 'status-dot warn';
            try {
                const data = await queryRadioBrowser(
                    '/json/stations/search?limit=40&countrycode=US&tag=news&is_https=true&hidebroken=true&order=clickcount&reverse=true'
                );
                state.stations = data
                    .map(station => ({ ...station, streamUrls: stationStreamUrls(station) }))
                    .filter(station => station.streamUrls.length)
                    .slice(0, 10)
                    .map((station, index) => ({
                        ...station,
                        assignedFreq: (88.0 + (index * 2.0)).toFixed(1),
                        secureUrl: station.streamUrls[0],
                        playbackMode: 'untested'
                    }));
                stations = state.stations;
                document.getElementById('connectionStatus').textContent = `${stations.length} SIGNALS`;
                document.getElementById('apiStatusText').textContent = 'API: Live';
                document.getElementById('apiStatusDot').className = 'status-dot ok';
                log(`Directory returned ${data.length}; ${stations.length} HTTPS stations loaded.`, 'success');
                renderDebugList();
                renderDialMarkers();
                renderPresetButtons();
                updateStreamStatus();
                updateDisplay(97.5);
            } catch (error) {
                document.getElementById('connectionStatus').textContent = 'DIRECTORY ERROR';
                document.getElementById('apiStatusText').textContent = 'API: Offline';
                document.getElementById('apiStatusDot').className = 'status-dot error';
                document.getElementById('stationName').textContent = 'Directory unavailable';
                document.getElementById('stationLocation').textContent = error.message;
                log(`Directory failed: ${error.message}`, 'error');
            }
        }

        function renderDebugList() {
            const list = document.getElementById('debugList');
            if (!list) return;

            list.replaceChildren();
            state.stations.forEach((station, index) => {
                const item = document.createElement('div');
                item.className = 'debug-item';
                item.id = `debug-item-${index}`;
                const copy = document.createElement('div');
                copy.className = 'debug-item-info';
                const title = document.createElement('strong');
                title.textContent = `${station.assignedFreq} MHz — ${station.name}`;
                const url = document.createElement('small');
                url.textContent = safeSurfaceUrl(station.secureUrl);
                copy.append(title, document.createElement('br'), url);

                const actions = document.createElement('div');
                actions.className = 'debug-item-actions';
                const test = document.createElement('button');
                test.type = 'button';
                test.className = `test-btn${state.testedStreams[index] === true ? ' tested-ok' : state.testedStreams[index] === false ? ' tested-fail' : ''}`;
                test.dataset.action = 'test';
                test.dataset.index = String(index);
                test.textContent = state.testedStreams[index] === true ? '✓ PLAYABLE' : state.testedStreams[index] === false ? '✗ FAILED' : 'TEST';
                const play = document.createElement('button');
                play.type = 'button';
                play.className = 'test-btn';
                play.dataset.action = 'play';
                play.dataset.index = String(index);
                play.disabled = state.currentStationIndex === index && state.isPlaying;
                play.textContent = play.disabled ? 'PLAYING' : 'PLAY';
                actions.append(test, play);
                item.append(copy, actions);
                list.appendChild(item);
            });
        }

        function renderPresetButtons() {
            const container = document.getElementById('stationPresetButtons');
            if (!container) return;

            container.replaceChildren();
            state.stations.forEach((station, index) => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'tag';
                button.dataset.index = String(index);
                button.setAttribute('aria-pressed', String(state.currentStationIndex === index));
                button.textContent = station.assignedFreq;
                container.appendChild(button);
            });
        }

        function renderDialMarkers() {
            const markers = document.getElementById('stationMarkers');
            if (!markers) return;

            markers.innerHTML = stations.map(s => {
                const pct = (parseFloat(s.assignedFreq) - 87.5) / 20.5 * 100;
                return `<div class="station-marker" style="left: ${pct}%"></div>`;
            }).join('');
        }
        function mediaErrorDetail(media, fallbackError) {
            const messages = {
                1: 'Playback aborted', 2: 'Network error',
                3: 'Audio decode error', 4: 'Format not supported'
            };
            if (messages[media?.error?.code]) return `${messages[media.error.code]} (media ${media.error.code})`;
            if (fallbackError?.name === 'NotSupportedError') return 'Format not supported';
            if (fallbackError?.message) return fallbackError.message;
            return 'No playable audio returned';
        }

        function probeStream(station, url) {
            return new Promise(resolve => {
                const probe = new Audio();
                const startedAt = performance.now();
                const surfaceId = `media:${station.stationuuid}:${url}`;
                let settled = false;
                let timer;
                surfaceMonitor.report(surfaceId, {
                    kind: 'DIRECT MEDIA', auth: 'NO KEY', name: station.name,
                    url, state: 'checking', label: 'TESTING', detail: 'Waiting for browser-decodable audio.'
                });

                const finish = (ok, label, detail) => {
                    if (settled) return;
                    settled = true;
                    clearTimeout(timer);
                    ['loadeddata', 'canplay', 'playing'].forEach(name => probe.removeEventListener(name, onReady));
                    probe.removeEventListener('error', onError);
                    probe.pause();
                    probe.removeAttribute('src');
                    probe.load();
                    const elapsed = Math.round(performance.now() - startedAt);
                    surfaceMonitor.report(surfaceId, {
                        state: ok ? 'ready' : 'error', label,
                        detail: `${detail} · ${elapsed} ms`
                    });
                    resolve({ ok, label, detail, elapsed });
                };
                const onReady = () => finish(true, 'PLAYABLE', 'Direct HTTPS audio returned');
                const onError = () => finish(false, 'FAILED', mediaErrorDetail(probe));

                ['loadeddata', 'canplay', 'playing'].forEach(name => probe.addEventListener(name, onReady, { once: true }));
                probe.addEventListener('error', onError, { once: true });
                timer = setTimeout(() => finish(false, 'TIMEOUT', `${STREAM_TIMEOUT / 1000}s without playable audio`), STREAM_TIMEOUT);
                probe.preload = 'auto';
                probe.muted = true;
                probe.volume = 0;
                probe.playsInline = true;
                probe.src = url;
                probe.load();
                const attempt = probe.play();
                attempt?.catch(error => {
                    if (error?.name !== 'NotAllowedError') finish(false, 'FAILED', mediaErrorDetail(probe, error));
                });
            });
        }

        // Test individual stream using the USB receiver's browser-probe idea.
        async function testStream(idx) {
            const station = state.stations[idx];
            if (!station) return false;
            log(`Testing ${station.assignedFreq}: ${station.name}`, 'info');
            if (state.currentStationIndex === idx) document.getElementById('signalLabel').textContent = 'TESTING';
            let lastResult = null;
            for (const url of station.streamUrls) {
                lastResult = await probeStream(station, url);
                if (lastResult.ok) {
                    station.secureUrl = url;
                    station.playbackMode = 'direct';
                    state.testedStreams[idx] = true;
                    state.testDetails[idx] = lastResult;
                    testedStreams = state.testedStreams;
                    log(`Stream ${station.assignedFreq}: playable direct audio.`, 'success');
                    updateStreamStatus();
                    renderDebugList();
                    updateDisplay(parseFloat(state.stations[state.currentStationIndex]?.assignedFreq || 97.5));
                    return true;
                }
            }
            station.playbackMode = 'unavailable';
            state.testedStreams[idx] = false;
            state.testDetails[idx] = lastResult;
            testedStreams = state.testedStreams;
            log(`Stream ${station.assignedFreq}: ${lastResult?.detail || 'no playable candidate'}.`, 'error');
            updateStreamStatus();
            renderDebugList();
            updateDisplay(parseFloat(state.stations[state.currentStationIndex]?.assignedFreq || 97.5));
            return false;
        }

        async function testAllStreams() {
            const run = ++state.testRun;
            const button = document.getElementById('testAllStreams');
            button.disabled = true;
            let cursor = 0;
            let ready = 0;
            async function worker() {
                while (cursor < state.stations.length && run === state.testRun) {
                    const index = cursor;
                    cursor += 1;
                    if (await testStream(index)) ready += 1;
                    button.textContent = `${ready}/${cursor} LIVE`;
                }
            }
            await Promise.all(Array.from({ length: Math.min(3, state.stations.length) }, () => worker()));
            if (run !== state.testRun) return;
            button.disabled = false;
            button.textContent = `${ready}/${state.stations.length} LIVE`;
        }

        // Play a station directly from debug panel
        async function playFromDebug(idx) {
            log(`Play requested from debug for station ${idx}`, 'info');

            // Stop current playback if any
            if (state.isPlaying) {
                stopPlayback();
            }

            // Tune to station frequency
            const station = state.stations[idx];
            if (!station) return;

            const freq = parseFloat(station.assignedFreq);
            const pct = (freq - 87.5) / 20.5;

            // Update dial position
            document.getElementById('freqDisplay').textContent = freq.toFixed(2);
            document.getElementById('dialKnob').style.left = `${pct * 100}%`;
            document.getElementById('dialFill').style.width = `${pct * 100}%`;
            dialTrack.setAttribute('aria-valuenow', freq.toFixed(1));
            dialTrack.setAttribute('aria-valuetext', `${freq.toFixed(1)} megahertz display position`);

            // Update state
            state.currentStationIndex = idx;
            currentStation = { station, index: idx, distance: 0 };

            // Update UI
            updateDisplay(freq);

            if (state.testedStreams[idx] !== true && !(await testStream(idx))) return;
            await startPlayback();

            // Update all UI elements
            syncAllUI();
        }

        // Tune to a specific station by index
        function tuneToStation(idx) {
            if (idx < 0 || idx >= state.stations.length) return;

            const station = state.stations[idx];
            const freq = parseFloat(station.assignedFreq);
            const pct = (freq - 87.5) / 20.5;

            // Update dial position
            document.getElementById('freqDisplay').textContent = freq.toFixed(2);
            document.getElementById('dialKnob').style.left = `${pct * 100}%`;
            document.getElementById('dialFill').style.width = `${pct * 100}%`;
            dialTrack.setAttribute('aria-valuenow', freq.toFixed(1));
            dialTrack.setAttribute('aria-valuetext', `${freq.toFixed(1)} megahertz display position`);

            // Update state
            state.currentStationIndex = idx;
            currentStation = { station, index: idx, distance: 0 };

            // Update UI
            updateDisplay(freq);
            syncAllUI();

            log(`Tuned to ${station.assignedFreq} MHz - ${station.name}`, 'info');
        }

        // Change station with prev/next buttons
        function changeStation(direction) {
            const newIndex = state.currentStationIndex + direction;
            if (newIndex >= 0 && newIndex < state.stations.length) {
                // Stop playback when changing stations
                if (state.isPlaying) {
                    stopPlayback();
                }
                tuneToStation(newIndex);
            } else if (state.stations.length > 0) {
                // Wrap around or go to first/last if no station selected
                if (newIndex < 0) {
                    tuneToStation(state.stations.length - 1);
                } else if (newIndex >= state.stations.length) {
                    tuneToStation(0);
                }
            }
        }

        // Toggle play/stop from tape deck controls
        async function togglePlayFromTape() {
            if (!currentStation) {
                // If no station is selected, tune to the first one
                if (state.stations.length > 0) {
                    tuneToStation(0);
                }
                if (!currentStation) return;
            }

            if (state.isPlaying) {
                stopPlayback();
            } else {
                await startPlayback();
            }
            syncAllUI();
            updateTapeSpools();
        }

        // Update tape spool animation based on playback state
        function updateTapeSpools() {
            const leftSpool = document.getElementById('leftSpool');
            const rightSpool = document.getElementById('rightSpool');
            if (leftSpool && rightSpool) {
                leftSpool.classList.toggle('spinning', state.isPlaying);
                rightSpool.classList.toggle('spinning', state.isPlaying);
            }
        }

        // Start playback for current station
        async function startPlayback() {
            const s = currentStation?.station;
            if (!s) return;
            const index = currentStation.index;
            if (state.testedStreams[index] !== true && !(await testStream(index))) {
                document.getElementById('signalLabel').textContent = 'NO SIGNAL';
                updatePlayButtonUI();
                return;
            }

            const audio = document.getElementById('radioPlayer');
            const src = s.secureUrl;
            const surfaceId = `media:${s.stationuuid}:${src}`;

            log(`Starting direct playback: ${s.name}`, 'info');
            document.getElementById('signalLabel').textContent = 'TUNING';
            surfaceMonitor.report(surfaceId, {
                kind: 'DIRECT MEDIA', auth: 'NO KEY', name: s.name, url: src,
                state: 'checking', label: 'TUNING', detail: 'Main receiver is opening this stream.'
            });

            audio.src = src;
            try {
                await audio.play();
                state.isPlaying = true;
                isPlaying = true;
                log('Playback started successfully', 'success');
                document.getElementById('signalLabel').textContent = 'ON AIR';
                document.getElementById('connectionStatus').textContent = 'RECEIVING';
                surfaceMonitor.report(surfaceId, {
                    state: 'ready', label: 'ON AIR', detail: 'Playable audio confirmed by the main receiver.'
                });
                updatePlayButtonUI();
                updateTapeSpools();
            } catch (e) {
                log(`Playback failed: ${e.message}`, 'error');
                state.isPlaying = false;
                isPlaying = false;
                state.testedStreams[index] = false;
                state.testDetails[index] = { ok: false, detail: mediaErrorDetail(audio, e) };
                document.getElementById('signalLabel').textContent = 'NO SIGNAL';
                document.getElementById('connectionStatus').textContent = 'STREAM ERROR';
                surfaceMonitor.report(surfaceId, {
                    state: 'error', label: 'FAILED', detail: mediaErrorDetail(audio, e)
                });
                updateStreamStatus();
                updatePlayButtonUI();
                updateTapeSpools();
            }
        }

        // Stop playback
        function stopPlayback() {
            const audio = document.getElementById('radioPlayer');
            audio.pause();
            audio.removeAttribute('src');
            audio.load();
            state.isPlaying = false;
            isPlaying = false;
            log('Playback stopped', 'info');
            document.getElementById('connectionStatus').textContent = `${state.stations.length} SIGNALS`;
            if (currentStation) document.getElementById('signalLabel').textContent = 'LOCKED';
            updatePlayButtonUI();
            updateTapeSpools();
        }

        // Update play button UI based on state
        function updatePlayButtonUI() {
            const btn = document.getElementById('playBtn');
            const icon = document.getElementById('playIcon');
            const text = document.getElementById('playText');
            const tapePlayBtn = document.getElementById('tapePlayBtn');

            if (state.isPlaying) {
                btn.classList.add('playing');
                text.textContent = 'STOP';
                icon.textContent = '⏸';
                if (tapePlayBtn) tapePlayBtn.textContent = '⏹';
            } else {
                btn.classList.remove('playing');
                text.textContent = currentStation
                    ? state.testedStreams[currentStation.index] === false ? 'RETEST SIGNAL' : 'PLAY STREAM'
                    : 'CONNECTING...';
                icon.textContent = '▶';
                if (tapePlayBtn) tapePlayBtn.textContent = '⏯';
            }

            // Update debug panel play buttons
            renderDebugList();
        }

        // Sync all UI elements to current state
        function syncAllUI() {
            renderPresetButtons();
            renderDebugList();
            updatePlayButtonUI();
        }

        function updateStreamStatus() {
            const ok = Object.values(state.testedStreams).filter(v => v).length;
            const total = state.stations.length;
            const tested = Object.keys(state.testedStreams).length;
            document.getElementById('streamStatusText').textContent = `Streams: ${ok}/${total} LIVE`;
            document.getElementById('streamStatusDot').className = ok > 0
                ? 'status-dot ok'
                : tested === total && total ? 'status-dot error' : 'status-dot warn';
        }

        // Main UI Logic
        const dialTrack = document.getElementById('dialTrack');
        const dialKnob = document.getElementById('dialKnob');

        function updateFromPct(pct) {
            const freq = 87.5 + (pct * 20.5);
            document.getElementById('freqDisplay').textContent = freq.toFixed(2);
            dialKnob.style.left = `${pct * 100}%`;
            document.getElementById('dialFill').style.width = `${pct * 100}%`;
            dialTrack.setAttribute('aria-valuenow', freq.toFixed(1));
            dialTrack.setAttribute('aria-valuetext', `${freq.toFixed(1)} megahertz display position`);
            updateDisplay(freq);
        }

        function updateDisplay(freq) {
            let nearest = null;
            let minDist = Infinity;

            state.stations.forEach((s, i) => {
                const dist = Math.abs(parseFloat(s.assignedFreq) - freq);
                if (dist < minDist) {
                    minDist = dist;
                    nearest = { station: s, index: i, distance: dist };
                }
            });

            const info = document.getElementById('stationInfo');
            const mystery = document.getElementById('mysteryMode');

            if (nearest && nearest.distance < 0.5) {
                currentStation = nearest;
                state.currentStationIndex = nearest.index;
                info.style.display = 'block';
                mystery.style.display = 'none';

                const s = nearest.station;
                document.getElementById('callSign').textContent =
                    `${s.name.substring(0, 4).toUpperCase()}-${s.assignedFreq.replace('.', '')}`;
                document.getElementById('stationName').textContent = s.name;
                document.getElementById('stationLocation').textContent =
                    `${s.state || 'USA'} | ${s.bitrate || '?'}kbps ${s.codec || ''}`;

                const tags = document.getElementById('stationTags');
                tags.innerHTML = `<span class="tag">NEWS</span>`;

                if (state.testedStreams[nearest.index] === true) {
                    tags.innerHTML += `<span class="tag ok">🔊 CLEAR SIGNAL</span>`;
                    document.getElementById('playBtn').disabled = false;
                    if (!state.isPlaying) {
                        document.getElementById('playText').textContent = 'PLAY STREAM';
                    }
                } else if (state.testedStreams[nearest.index] === false) {
                    tags.innerHTML += `<span class="tag">× NO DIRECT SIGNAL</span>`;
                    document.getElementById('playBtn').disabled = false;
                    if (!state.isPlaying) {
                        document.getElementById('playText').textContent = 'RETEST SIGNAL';
                    }
                } else {
                    tags.innerHTML += `<span class="tag" style="opacity: 0.6;">NOT TESTED</span>`;
                    document.getElementById('playBtn').disabled = false;
                    if (!state.isPlaying) {
                        document.getElementById('playText').textContent = 'TEST & PLAY';
                    }
                }

                const strength = Math.max(1, 4 - Math.floor(nearest.distance * 4));
                document.querySelectorAll('.signal-bar').forEach((b, i) => {
                    b.classList.toggle('active', i < strength);
                });

                document.getElementById('signalLabel').textContent =
                    nearest.distance < 0.2 ? 'LOCKED' : 'ACQUIRING';
            } else {
                currentStation = null;
                state.currentStationIndex = -1;
                info.style.display = 'none';
                mystery.style.display = 'block';
                document.querySelectorAll('.signal-bar').forEach(b => b.classList.remove('active'));
                document.getElementById('signalLabel').textContent = 'NO SIGNAL';
                // Don't update preset buttons here to keep last selection visible
            }

            // Sync preset buttons highlight
            renderPresetButtons();
        }

        // Pointer events keep the original drag tuner usable on mouse and phone.
        dialTrack.addEventListener('pointerdown', event => {
            state.isDragging = true;
            dialTrack.setPointerCapture(event.pointerId);
            if (state.isPlaying) stopPlayback();
            updateFromPointer(event);
        });
        dialTrack.addEventListener('pointermove', event => {
            if (state.isDragging) updateFromPointer(event);
        });
        dialTrack.addEventListener('pointerup', event => {
            state.isDragging = false;
            if (dialTrack.hasPointerCapture(event.pointerId)) dialTrack.releasePointerCapture(event.pointerId);
        });
        dialTrack.addEventListener('keydown', event => {
            const current = Number(dialTrack.getAttribute('aria-valuenow')) || 97.5;
            const changes = {
                ArrowLeft: -0.1,
                ArrowDown: -0.1,
                ArrowRight: 0.1,
                ArrowUp: 0.1,
                PageDown: -1,
                PageUp: 1
            };
            let next = current;
            if (event.key === 'Home') next = 87.5;
            else if (event.key === 'End') next = 108;
            else if (event.key in changes) next += changes[event.key];
            else return;
            event.preventDefault();
            if (state.isPlaying) stopPlayback();
            updateFromPct((Math.max(87.5, Math.min(108, next)) - 87.5) / 20.5);
        });

        function updateFromPointer(event) {
            const rect = dialTrack.getBoundingClientRect();
            const pct = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
            updateFromPct(pct);
        }

        // Main play button logic
        document.getElementById('playBtn').addEventListener('click', async () => {
            if (!currentStation) return;

            if (state.isPlaying) {
                stopPlayback();
            } else {
                await startPlayback();
            }
            syncAllUI();
        });

        document.getElementById('debugList').addEventListener('click', event => {
            const button = event.target.closest('[data-action]');
            if (!button) return;
            const index = Number(button.dataset.index);
            if (button.dataset.action === 'test') testStream(index);
            if (button.dataset.action === 'play') playFromDebug(index);
        });

        document.getElementById('stationPresetButtons').addEventListener('click', event => {
            const button = event.target.closest('[data-index]');
            if (button) tuneToStation(Number(button.dataset.index));
        });

        document.getElementById('tapePrevBtn').addEventListener('click', () => changeStation(-1));
        document.getElementById('tapeNextBtn').addEventListener('click', () => changeStation(1));
        document.getElementById('tapePlayBtn').addEventListener('click', togglePlayFromTape);
        document.getElementById('prevStationBtn').addEventListener('click', () => changeStation(-1));
        document.getElementById('nextStationBtn').addEventListener('click', () => changeStation(1));
        document.getElementById('testAllStreams').addEventListener('click', event => {
            event.stopPropagation();
            testAllStreams();
        });
        document.getElementById('debugToggle').addEventListener('click', event => {
            event.stopPropagation();
            toggleDebug();
        });
        document.getElementById('debugHeader').addEventListener('click', event => {
            if (!event.target.closest('button')) toggleDebug();
        });

        document.getElementById('radioPlayer').addEventListener('error', event => {
            if (!currentStation || !event.currentTarget.getAttribute('src')) return;
            const detail = mediaErrorDetail(event.currentTarget);
            const station = currentStation.station;
            state.isPlaying = false;
            isPlaying = false;
            state.testedStreams[currentStation.index] = false;
            surfaceMonitor.report(`media:${station.stationuuid}:${station.secureUrl}`, {
                state: 'error', label: 'FAILED', detail
            });
            document.getElementById('signalLabel').textContent = 'NO SIGNAL';
            log(`Stream stopped: ${detail}`, 'error');
            updateStreamStatus();
            updatePlayButtonUI();
            updateTapeSpools();
        });

        // Init
        log('Debug panel initialized', 'info');
        log(
            'Client-side detection: ' +
            (window.location.protocol === 'https:' ? 'HTTPS (Good for streams)' : 'HTTP (May cause mixed content)'),
            'warn'
        );
        startStaticCanvas();
        loadStations();
