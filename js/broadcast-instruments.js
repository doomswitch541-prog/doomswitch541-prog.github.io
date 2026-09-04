const clamp = (value, minimum = 0, maximum = 1) => Math.max(minimum, Math.min(maximum, value));
export const BROADCAST_SIGNAL_CONTRACT = Object.freeze({
    carrier: 'overall energy with positive spectral impact',
    spectrumField: 'live low-to-high frequency contour',
    waveform: 'time-domain amplitude from the playing station',
    bands: 'adaptively normalized low, mid, and high energy',
    impact: 'positive spectral flux with a fast attack and restrained release'
});

const CORS_ANALYSIS_STATIONS = new Set([
    'official-alex-jones-network',
    '15dced36-90ba-4c50-bc06-8156fe53433f',
    'd78d7518-9212-4541-91be-2a4a6bf1a945',
    '1e8febb5-722e-4975-aade-c3e07d4ac6ba',
    '445cbb3a-1c4e-49aa-a268-f5b6acfa8f2e',
    'official-capradio-news-kxjz',
    'official-capradio-music-kxpr',
    'official-kuel-1069',
    'official-kzap-933-kzhp',
    '96187609-0601-11e8-ae97-52543be04c81',
    '9b65470b-c31d-4a3a-b57b-eea8c62c58c9',
    'b5585301-1987-4605-9c4d-86da2488c0ad',
    '51745b10-5f95-49ab-bc53-068ad35fcee1',
    '960d3f6f-0601-11e8-ae97-52543be04c81',
    '960eb2e9-0601-11e8-ae97-52543be04c81',
    '9614eb15-0601-11e8-ae97-52543be04c81',
    '70133397-5845-4524-bcda-701da75f46fa'
]);

function rangeStats(data, analyser, minimumHz, maximumHz) {
    const binHz = analyser.context.sampleRate / analyser.fftSize;
    const start = Math.max(0, Math.floor(minimumHz / binHz));
    const end = Math.min(data.length - 1, Math.ceil(maximumHz / binHz));
    let total = 0;
    let squareTotal = 0;
    let peak = 0;
    let count = 0;
    for (let index = start; index <= end; index += 1) {
        const value = data[index] / 255;
        total += value;
        squareTotal += value * value;
        peak = Math.max(peak, value);
        count += 1;
    }
    return count
        ? { average: total / count, rms: Math.sqrt(squareTotal / count), peak }
        : { average: 0, rms: 0, peak: 0 };
}

function bandSignal(data, analyser, minimumHz, maximumHz) {
    const stats = rangeStats(data, analyser, minimumHz, maximumHz);
    return stats.average * 0.56 + stats.rms * 0.29 + stats.peak * 0.15;
}

function followSignal(current, target, attack, release) {
    return current + (target - current) * (target > current ? attack : release);
}

function canvasMetrics(canvas) {
    const cssWidth = canvas.clientWidth;
    const cssHeight = canvas.clientHeight;
    if (cssWidth < 2 || cssHeight < 2) return null;
    const density = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.round(cssWidth * density);
    const height = Math.round(cssHeight * density);
    if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
    }
    return { context: canvas.getContext('2d'), width, height, density };
}

function createSurface(prefix, rootId) {
    const root = document.getElementById(rootId);
    const waveform = document.getElementById(`${prefix}-waveform-canvas`);
    const status = document.getElementById(`${prefix}-analysis-source`);
    const note = document.getElementById(`${prefix}-analysis-note`);
    const bandFills = [
        document.getElementById(`${prefix}-band-low`),
        document.getElementById(`${prefix}-band-mid`),
        document.getElementById(`${prefix}-band-high`)
    ];
    if (!root || !waveform || !status || !note || bandFills.some(element => !element)) return null;
    return { root, waveform, status, note, bandFills };
}

export function createBroadcastInstruments({ audio, nowPlaying }) {
    const surfaces = [
        createSurface('receiver', 'receiver-instruments'),
        createSurface('dock', 'dock-instruments')
    ].filter(Boolean);

    if (!audio || !surfaces.length) {
        return { arm() {}, fallbackToPlayback() { return false; }, setState() {}, setStation() {} };
    }

    const model = {
        receiverState: nowPlaying?.dataset.state || 'idle',
        audioContext: null,
        analyser: null,
        capturedStream: null,
        streamSource: null,
        sinkGain: null,
        timeData: null,
        displayTimeData: null,
        frequencyData: null,
        analysisAllowed: false,
        captureAttempted: false,
        captureFailed: false,
        liveValidated: false,
        audibleFrames: 0,
        validationFrames: 0,
        sampleFrame: 0,
        rawBands: [0, 0, 0],
        smoothedBands: [0, 0, 0],
        bandFloors: [0, 0, 0],
        bandCeilings: [0.18, 0.18, 0.18],
        rangesReady: false,
        previousBands: [0, 0, 0],
        previousEnergy: 0,
        energy: 0,
        flux: 0,
        impact: 0,
        carrier: 0,
        lastBands: [0, 0, 0],
        lastRenderAt: 0
    };

    function setAnalysisState(state, label, note = '') {
        surfaces.forEach(surface => {
            surface.root.dataset.analysis = state;
            surface.root.dataset.sampleFrame = String(model.sampleFrame);
            surface.root.dataset.contextState = model.audioContext?.state || 'none';
            surface.root.dataset.energy = model.energy.toFixed(3);
            surface.root.dataset.flux = model.flux.toFixed(3);
            surface.root.dataset.impact = model.impact.toFixed(3);
            surface.root.style.setProperty('--signal-energy', model.energy.toFixed(3));
            surface.root.style.setProperty('--signal-impact', model.impact.toFixed(3));
            surface.status.textContent = label;
            surface.note.textContent = note;
            surface.note.hidden = !note;
        });
    }

    function analysisUnavailable() {
        setAnalysisState(
            'unavailable',
            'METER UNAVAILABLE',
            'Audio keeps playing; this browser cannot inspect this signal.'
        );
    }

    function resetSignal() {
        model.liveValidated = false;
        model.audibleFrames = 0;
        model.validationFrames = 0;
        model.sampleFrame = 0;
        model.rawBands = [0, 0, 0];
        model.smoothedBands = [0, 0, 0];
        model.bandFloors = [0, 0, 0];
        model.bandCeilings = [0.18, 0.18, 0.18];
        model.rangesReady = false;
        model.previousBands = [0, 0, 0];
        model.previousEnergy = 0;
        model.energy = 0;
        model.flux = 0;
        model.impact = 0;
        model.carrier = 0;
        model.lastBands = [0, 0, 0];
        model.displayTimeData?.fill(0);
        setAnalysisState('waiting', 'READY');
    }

    function ensureAudioContext() {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return null;
        if (!model.audioContext) model.audioContext = new AudioContextClass();
        return model.audioContext;
    }

    function connectCapturedStream(stream) {
        const context = ensureAudioContext();
        if (!context || !stream?.getAudioTracks().length) return false;
        const analyser = context.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.58;
        analyser.minDecibels = -100;
        analyser.maxDecibels = -8;
        const source = context.createMediaStreamSource(stream);
        const sink = context.createGain();
        sink.gain.value = 0;
        source.connect(analyser);
        analyser.connect(sink);
        sink.connect(context.destination);
        model.analyser = analyser;
        model.capturedStream = stream;
        model.streamSource = source;
        model.sinkGain = sink;
        model.timeData = new Uint8Array(analyser.fftSize);
        model.frequencyData = new Uint8Array(analyser.frequencyBinCount);
        model.displayTimeData = new Float32Array(analyser.fftSize);
        return true;
    }

    function releaseCapturedStream() {
        try { model.streamSource?.disconnect(); } catch {}
        try { model.analyser?.disconnect(); } catch {}
        try { model.sinkGain?.disconnect(); } catch {}
        model.capturedStream?.getTracks().forEach(track => track.stop());
        model.analyser = null;
        model.capturedStream = null;
        model.streamSource = null;
        model.sinkGain = null;
        model.timeData = null;
        model.displayTimeData = null;
        model.frequencyData = null;
        model.captureAttempted = false;
    }

    async function attemptCapture() {
        if (model.captureAttempted || audio.paused) return;
        model.captureAttempted = true;
        model.captureFailed = false;
        setAnalysisState('listening', 'OPENING AUDIO');
        const capture = audio.captureStream || audio.mozCaptureStream;
        if (!capture || !(window.AudioContext || window.webkitAudioContext)) {
            model.captureFailed = true;
            analysisUnavailable();
            return;
        }

        try {
            if (!model.analyser) {
                const stream = capture.call(audio);
                if (!connectCapturedStream(stream)) {
                    model.captureFailed = true;
                    analysisUnavailable();
                    return;
                }
            }
            if (model.audioContext?.state === 'suspended') {
                await model.audioContext.resume();
            }
            setAnalysisState('listening', 'LISTENING');
        } catch (error) {
            model.captureFailed = true;
            analysisUnavailable();
            console.info('RG Broadcast audio samples are unavailable in this browser.', error?.name || error);
        }
    }

    function readLiveSignal() {
        if (model.captureFailed || !model.analyser || !model.timeData || !model.frequencyData || audio.paused) return null;
        model.analyser.getByteTimeDomainData(model.timeData);
        model.analyser.getByteFrequencyData(model.frequencyData);

        let energy = 0;
        let peak = 0;
        for (const sample of model.timeData) {
            const centered = (sample - 128) / 128;
            energy += centered * centered;
            peak = Math.max(peak, Math.abs(centered));
        }

        const rms = Math.sqrt(energy / model.timeData.length);
        if (model.displayTimeData) {
            for (let index = 0; index < model.timeData.length; index += 1) {
                const sample = (model.timeData[index] - 128) / 128;
                model.displayTimeData[index] += (sample - model.displayTimeData[index]) * 0.24;
            }
        }
        const audibleSample = rms > 0.0015
            || peak > 0.008
            || model.frequencyData.some(value => value > 3);
        model.validationFrames += 1;
        model.audibleFrames = audibleSample ? model.audibleFrames + 1 : Math.max(0, model.audibleFrames - 1);

        if (!model.liveValidated && model.audibleFrames >= 5) {
            model.liveValidated = true;
            setAnalysisState('live', 'LIVE AUDIO');
        }
        if (!model.liveValidated && model.validationFrames > 300) {
            model.captureFailed = true;
            analysisUnavailable();
        }
        if (!model.liveValidated) return null;

        const rawBands = [
            bandSignal(model.frequencyData, model.analyser, 20, 250),
            bandSignal(model.frequencyData, model.analyser, 250, 2500),
            bandSignal(model.frequencyData, model.analyser, 2500, 10000)
        ];
        const weights = [0.46, 0.34, 0.2];
        const rawEnergy = rawBands.reduce((total, value, index) => total + value * weights[index], 0);
        let bandDeltas = rawBands.map((value, index) => value - model.previousBands[index]);

        if (!model.rangesReady && rawEnergy > 0.012) {
            model.bandFloors = rawBands.map(value => Math.max(0, value - 0.06));
            model.bandCeilings = rawBands.map(value => Math.min(1, value + 0.12));
            model.previousBands = [...rawBands];
            model.previousEnergy = rawEnergy;
            model.rangesReady = true;
            bandDeltas = [0, 0, 0];
        }

        model.bandFloors = model.bandFloors.map((floor, index) => (
            floor + (rawBands[index] - floor) * (rawBands[index] < floor ? 0.1 : 0.0015)
        ));
        model.bandCeilings = model.bandCeilings.map((ceiling, index) => (
            ceiling + (rawBands[index] - ceiling) * (rawBands[index] > ceiling ? 0.08 : 0.0025)
        ));

        const relativeBands = rawBands.map((value, index) => clamp(
            (value - model.bandFloors[index]) / Math.max(0.1, model.bandCeilings[index] - model.bandFloors[index])
        ));
        const positiveBands = bandDeltas.map(delta => Math.max(0, delta));
        const responsiveBands = rawBands.map((value, index) => clamp(
            value * 0.48 + relativeBands[index] * 0.34 + positiveBands[index] * 1.35
        ));
        const attacks = [0.34, 0.32, 0.4];
        const releases = [0.11, 0.13, 0.17];
        model.smoothedBands = model.smoothedBands.map((value, index) => (
            followSignal(value, responsiveBands[index], attacks[index], releases[index])
        ));

        const positiveFlux = positiveBands.reduce((total, value, index) => total + value * weights[index], 0);
        const fluxTarget = Math.max(0, rawEnergy - model.previousEnergy) + positiveFlux * 0.72;
        model.flux = followSignal(model.flux, fluxTarget, 0.46, 0.1);
        model.impact = followSignal(model.impact, clamp(positiveFlux * 5 + model.flux * 3.4), 0.52, 0.09);
        const energyTarget = model.smoothedBands.reduce((total, value, index) => total + value * weights[index], 0);
        model.energy = followSignal(model.energy, energyTarget, 0.28, 0.08);
        model.carrier = followSignal(
            model.carrier,
            clamp(model.energy * 0.72 + model.impact * 0.52 + model.flux * 1.8),
            0.36,
            0.07
        );
        model.rawBands = rawBands;
        model.previousBands = rawBands;
        model.previousEnergy = rawEnergy;
        model.lastBands = [...model.smoothedBands];
        model.sampleFrame += 1;
        surfaces.forEach(surface => {
            surface.root.dataset.sampleFrame = String(model.sampleFrame);
            surface.root.dataset.energy = model.energy.toFixed(3);
            surface.root.dataset.flux = model.flux.toFixed(3);
            surface.root.dataset.impact = model.impact.toFixed(3);
            surface.root.style.setProperty('--signal-energy', model.energy.toFixed(3));
            surface.root.style.setProperty('--signal-impact', model.impact.toFixed(3));
        });
        return model.smoothedBands;
    }

    function drawWaveform(surface) {
        const metrics = canvasMetrics(surface.waveform);
        if (!metrics) return;
        const { context, width, height, density } = metrics;
        context.clearRect(0, 0, width, height);

        const styles = getComputedStyle(surface.root);
        const line = styles.getPropertyValue('--signal-line').trim() || 'rgba(230, 220, 195, 0.14)';
        const ink = styles.getPropertyValue('--signal-ink').trim() || 'rgba(147, 142, 130, 0.72)';
        const fill = styles.getPropertyValue('--signal-fill').trim() || 'rgba(134, 181, 156, 0.08)';
        const center = Math.round(height / 2) + 0.5;

        context.save();
        context.strokeStyle = line;
        context.lineWidth = density;
        for (let index = 1; index < 8; index += 1) {
            const x = Math.round(width * index / 8) + 0.5;
            context.beginPath();
            context.moveTo(x, 0);
            context.lineTo(x, height);
            context.stroke();
        }
        context.beginPath();
        context.moveTo(0, center);
        context.lineTo(width, center);
        context.stroke();

        if (model.liveValidated && model.frequencyData) {
            const points = 72;
            context.beginPath();
            context.moveTo(0, center);
            for (let index = 0; index <= points; index += 1) {
                const normalized = index / points;
                const sourceIndex = Math.min(
                    model.frequencyData.length - 1,
                    Math.floor(Math.pow(normalized, 1.72) * model.frequencyData.length)
                );
                const energy = model.frequencyData[sourceIndex] / 255;
                context.lineTo(normalized * width, center - Math.pow(energy, 1.18) * height * 0.31);
            }
            for (let index = points; index >= 0; index -= 1) {
                const normalized = index / points;
                const sourceIndex = Math.min(
                    model.frequencyData.length - 1,
                    Math.floor(Math.pow(normalized, 1.72) * model.frequencyData.length)
                );
                const energy = model.frequencyData[sourceIndex] / 255;
                context.lineTo(normalized * width, center + Math.pow(energy, 1.18) * height * 0.31);
            }
            context.closePath();
            context.fillStyle = fill;
            context.fill();
        }

        context.beginPath();
        if (model.liveValidated && model.displayTimeData) {
            for (let index = 0; index < model.displayTimeData.length; index += 1) {
                const x = index / Math.max(1, model.displayTimeData.length - 1) * width;
                const normalized = model.displayTimeData[index];
                const y = height / 2 + normalized * height * (0.26 + model.energy * 0.13);
                if (index === 0) context.moveTo(x, y);
                else context.lineTo(x, y);
            }
        } else {
            context.moveTo(0, center);
            context.lineTo(width, center);
        }
        context.strokeStyle = ink;
        context.lineWidth = Math.max(density, (1.1 + model.energy * 0.75) * density);
        context.shadowColor = ink;
        context.shadowBlur = model.liveValidated ? (2 + model.energy * 8) * density : 0;
        context.stroke();

        const carrierX = Math.round(width / 2) + 0.5;
        const carrierHeight = model.liveValidated
            ? height * (0.16 + model.carrier * 0.56)
            : height * 0.14;
        context.beginPath();
        context.moveTo(carrierX, center - carrierHeight / 2);
        context.lineTo(carrierX, center + carrierHeight / 2);
        context.strokeStyle = ink;
        context.lineWidth = Math.max(density, (0.9 + model.impact * 1.6) * density);
        context.shadowColor = ink;
        context.shadowBlur = model.liveValidated ? (4 + model.impact * 18) * density : 0;
        context.stroke();
        context.beginPath();
        context.arc(carrierX, center, Math.max(1.5 * density, (1.5 + model.impact * 2.8) * density), 0, Math.PI * 2);
        context.fillStyle = ink;
        context.fill();
        context.restore();
    }

    function updateBands(values) {
        surfaces.forEach(surface => {
            surface.bandFills.forEach((element, index) => {
                element.style.width = `${Math.round(values[index] * 100)}%`;
            });
        });
    }

    function render(time = 0) {
        if (time - model.lastRenderAt < 33) {
            requestAnimationFrame(render);
            return;
        }
        model.lastRenderAt = time;
        const liveBands = readLiveSignal();
        if (!liveBands && !audio.paused && !model.liveValidated) {
            model.smoothedBands = model.smoothedBands.map(value => followSignal(value, 0, 0.2, 0.18));
            model.energy = followSignal(model.energy, 0, 0.2, 0.12);
            model.flux = followSignal(model.flux, 0, 0.2, 0.16);
            model.impact = followSignal(model.impact, 0, 0.2, 0.14);
            model.carrier = followSignal(model.carrier, 0, 0.2, 0.1);
        }
        const values = liveBands || (audio.paused && model.liveValidated ? model.lastBands : model.smoothedBands);
        surfaces.forEach(drawWaveform);
        updateBands(values);
        requestAnimationFrame(render);
    }

    audio.addEventListener('playing', () => {
        if (model.liveValidated) {
            setAnalysisState('live', 'LIVE AUDIO');
            return;
        }
        if (model.captureFailed) {
            analysisUnavailable();
            return;
        }
        void attemptCapture();
    });
    audio.addEventListener('pause', () => {
        if (model.liveValidated) setAnalysisState('paused', 'PAUSED');
    });
    audio.addEventListener('loadstart', () => {
        model.liveValidated = false;
        model.audibleFrames = 0;
        model.validationFrames = 0;
        model.sampleFrame = 0;
        model.captureFailed = !model.analysisAllowed;
        if (!model.analyser) model.captureAttempted = false;
        if (model.captureFailed) analysisUnavailable();
        else setAnalysisState('listening', 'TUNING');
    });
    audio.addEventListener('error', () => setAnalysisState('error', 'NO SIGNAL'));
    audio.addEventListener('emptied', resetSignal);

    resetSignal();
    requestAnimationFrame(render);

    return {
        setState({ state }) {
            model.receiverState = state || 'idle';
            if (state === 'error') setAnalysisState('error', 'NO SIGNAL');
            else if (state === 'loading' && model.captureFailed) analysisUnavailable();
            else if (state === 'loading' && !model.liveValidated) setAnalysisState('listening', 'TUNING');
            else if (state === 'paused' && model.liveValidated) setAnalysisState('paused', 'PAUSED');
            else if (state === 'idle' && !audio.getAttribute('src')) resetSignal();
        },
        setStation(station) {
            releaseCapturedStream();
            model.analysisAllowed = CORS_ANALYSIS_STATIONS.has(station?.stationuuid);
            if (model.analysisAllowed) audio.crossOrigin = 'anonymous';
            else audio.removeAttribute('crossorigin');
            resetSignal();
        },
        fallbackToPlayback() {
            if (!model.analysisAllowed || audio.crossOrigin !== 'anonymous') return false;
            releaseCapturedStream();
            model.analysisAllowed = false;
            model.captureFailed = true;
            audio.removeAttribute('crossorigin');
            analysisUnavailable();
            return true;
        },
        arm() {
            const context = ensureAudioContext();
            if (context?.state === 'suspended') {
                const unlock = context.createBufferSource();
                unlock.buffer = context.createBuffer(1, 1, 22050);
                unlock.connect(context.destination);
                unlock.start(0);
                void context.resume();
            }
        }
    };
}
