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

export function createBroadcastInstruments({ audio, nowPlaying, replaceAudio, resumePlayback, onSignalFrame = () => {} }) {
    const surfaces = [
        createSurface('receiver', 'receiver-instruments'),
        createSurface('dock', 'dock-instruments')
    ].filter(Boolean);
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    if (!audio || !surfaces.length) {
        return { arm() {}, fallbackToPlayback() { return false; }, setState() {}, setStation() {} };
    }

    const model = {
        receiverState: nowPlaying?.dataset.state || 'idle',
        receiverLabel: '',
        audioContext: null,
        analyser: null,
        streamSource: null,
        timeData: null,
        displayTimeData: null,
        frequencyData: null,
        analysisAllowed: false,
        captureAttempted: false,
        captureRun: 0,
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
        fallbackPhase: 0,
        fallbackPlaybackMs: 0,
        fallbackLastAt: 0,
        reducedFrameKey: '',
        lastRenderAt: 0
    };
    let audioEvents;
    let astraInstrument;
    // Optional and locally vendored; failure keeps the two original motifs available.
    void import('/js/broadcast-astra-instrument.js?v=20260911-2')
        .then(module=>{astraInstrument=module.createAstraInstrument();})
        .catch(()=>{});

    function setAnalysisState(state, label, note = '') {
        surfaces.forEach(surface => {
            surface.root.dataset.analysis = state;
            surface.waveform.setAttribute('aria-label', (state === 'live' || (state === 'paused' && model.liveValidated))
                ? 'Measured station audio waveform and frequency spectrum'
                : 'Animated receiver state, not measured audio');
            surface.root.dataset.sampleFrame = String(model.sampleFrame);
            surface.root.dataset.contextState = model.audioContext?.state || 'none';
            surface.root.dataset.audioPath = model.streamSource ? 'media-element' : 'native';
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
        model.liveValidated = false;
        model.smoothedBands = [0, 0, 0];
        model.lastBands = [0, 0, 0];
        model.energy = model.flux = model.impact = model.carrier = 0;
        const state = model.receiverState;
        const label = state === 'loading'
            ? (model.receiverLabel === 'BUFFERING' ? 'BUFFERING' : 'TUNING')
            : state === 'error' ? 'NO SIGNAL'
            : state === 'playing'
                ? 'PLAYBACK ANIMATION'
                : state === 'paused'
                    ? 'PAUSED'
                    : 'READY';
        setAnalysisState(
            state === 'error' ? 'error' : 'fallback',
            label,
            state === 'error' ? 'Playback interrupted. Retry or choose another station.'
                : 'Playback animation · audio analysis unavailable'
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
        model.fallbackPhase = 0;
        model.fallbackPlaybackMs = 0;
        model.fallbackLastAt = 0;
        model.displayTimeData?.fill(0);
        setAnalysisState('waiting', 'READY');
    }

    function ensureAudioContext() {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return null;
        if (!model.audioContext || model.audioContext.state === 'closed') {
            model.audioContext = new AudioContextClass();
            const context = model.audioContext;
            context.addEventListener('statechange', () => {
                if (model.audioContext !== context) return;
                if (!model.analysisAllowed || audio.paused || model.receiverState !== 'playing') return;
                if (model.audioContext.state === 'running') {
                    model.captureFailed = false;
                    if (!model.analyser) {
                        model.captureAttempted = false;
                        void attemptAnalysis();
                        return;
                    }
                    model.liveValidated = false;
                    model.audibleFrames = 0;
                    model.validationFrames = 0;
                    setAnalysisState('listening', 'LISTENING');
                } else {
                    if (model.streamSource) {
                        restoreNativePlayback();
                        return;
                    }
                    model.captureFailed = true;
                    analysisUnavailable();
                }
            });
        }
        return model.audioContext;
    }

    function connectAudioElement() {
        const context = ensureAudioContext();
        // Do not reroute audible playback into a suspended context. Unlike file
        // players, this receiver also needs to play stations without audio CORS.
        if (context?.state !== 'running' || !model.analysisAllowed || audio.crossOrigin !== 'anonymous') return false;
        const analyser = context.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.58;
        analyser.minDecibels = -100;
        analyser.maxDecibels = -8;
        const source = context.createMediaElementSource(audio);
        model.streamSource = source;
        source.connect(analyser);
        analyser.connect(context.destination);
        model.analyser = analyser;
        model.timeData = new Uint8Array(analyser.fftSize);
        model.frequencyData = new Uint8Array(analyser.frequencyBinCount);
        model.displayTimeData = new Float32Array(analyser.fftSize);
        return true;
    }

    function releaseAudioGraph() {
        model.captureRun += 1;
        const routed = Boolean(model.streamSource);
        audioEvents?.abort();
        try { model.streamSource?.disconnect(); } catch {}
        try { model.analyser?.disconnect(); } catch {}
        model.analyser = null;
        model.streamSource = null;
        model.timeData = null;
        model.displayTimeData = null;
        model.frequencyData = null;
        model.captureAttempted = false;
        if (routed) audio = replaceAudio();
        bindAudioEvents();
    }

    function restoreNativePlayback() {
        const source = audio.getAttribute('src');
        const shouldPlay = !audio.paused;
        releaseAudioGraph();
        model.analysisAllowed = false;
        model.captureFailed = true;
        audio.removeAttribute('crossorigin');
        analysisUnavailable();
        if (source) {
            audio.src = source;
            if (shouldPlay) resumePlayback();
        }
    }

    async function attemptAnalysis() {
        if (audio.paused || !model.analysisAllowed || (model.captureAttempted && !model.analyser)) return;
        const run = model.captureRun;
        if (!model.captureAttempted) model.captureAttempted = true;
        model.captureFailed = false;
        setAnalysisState('listening', model.analyser ? 'RESUMING AUDIO' : 'OPENING AUDIO');
        if (!(window.AudioContext || window.webkitAudioContext)) {
            model.captureFailed = true;
            analysisUnavailable();
            return;
        }

        try {
            ensureAudioContext();
            if (model.audioContext?.state !== 'running') {
                let timer;
                try {
                    await Promise.race([
                        model.audioContext.resume(),
                        new Promise(resolve => { timer = window.setTimeout(resolve, 1800); })
                    ]);
                } finally {
                    window.clearTimeout(timer);
                }
            }
            if (run !== model.captureRun || audio.paused) return;
            if (model.audioContext?.state !== 'running') {
                model.captureFailed = true;
                analysisUnavailable();
                return;
            }
            if (!model.analyser && !connectAudioElement()) {
                model.captureFailed = true;
                analysisUnavailable();
                return;
            }
            if (model.receiverState !== 'playing') return;
            setAnalysisState(model.liveValidated ? 'live' : 'listening', model.liveValidated ? 'LIVE AUDIO' : 'LISTENING');
        } catch (error) {
            if (run !== model.captureRun || audio.paused) return;
            if (model.streamSource) {
                restoreNativePlayback();
                return;
            }
            model.captureFailed = true;
            analysisUnavailable();
            console.info('RG Broadcast audio samples are unavailable in this browser.', error?.name || error);
        }
    }

    function drawReceiverFallback(context, width, height, center, playbackMs=model.fallbackPlaybackMs) {
        const active = ['loading', 'playing', 'paused'].includes(model.receiverState);
        const elapsed = playbackMs % 28000;
        const fade = clamp((elapsed - 26400) / 1600);
        const eased = fade * fade * (3 - 2 * fade);
        const bars = active ? (Math.floor(playbackMs / 28000) % 2 ? 1 - eased : eased) : 0;
        const opacity=context.globalAlpha;
        if (bars < 1) {
            context.save();
            context.globalAlpha = opacity * (1 - bars);
            drawPilotFallback(context, width, height, center);
            context.restore();
        }
        if (bars > 0) {
            context.save();
            context.globalAlpha = opacity * bars;
            drawBarFallback(context, width, height, center);
            context.restore();
        }
        return true;
    }

    function drawBarFallback(context, width, height, center) {
        const phase = model.fallbackPhase;
        const step = width / 18;
        const barWidth = Math.max(1, step * 0.42);
        for (let index = 0; index < 18; index += 1) {
            const edge = Math.sin(Math.PI * (index + 0.5) / 18);
            const rhythm = 0.5 + 0.3 * Math.sin(phase + index * 0.63)
                + 0.2 * Math.sin(phase * 0.71 - index * 0.91);
            const barHeight = Math.max(2, height * (0.12 + edge * (0.2 + rhythm * 0.56)));
            context.fillStyle = index % 3 === 0 ? 'rgba(183,219,230,.8)' : 'rgba(168,204,185,.68)';
            context.fillRect((index + 0.5) * step - barWidth / 2, center - barHeight / 2, barWidth, barHeight);
        }
    }

    function drawPilotFallback(context, width, height, center) {
        const active = ['loading', 'playing', 'paused'].includes(model.receiverState);
        const phase = model.fallbackPhase;
        // Pilot marks describe receiver activity, never frequency magnitudes.
        // Both surfaces share this phase; pause holds it and reduced motion stops it.
        const step = width / 12;
        context.strokeStyle = 'rgba(184, 217, 222, 0.14)';
        context.lineWidth = Math.max(1, height / 48);
        context.beginPath();
        context.moveTo(step, center);
        context.lineTo(width - step, center);
        context.stroke();
        for (let i = 1; i < 12; i += 1) {
            const emphasis = active ? 0.25 + 0.35 * Math.pow(0.5 + Math.sin(phase * 0.65 - i * 0.6) * 0.5, 3) : 0.15;
            context.fillStyle = `rgba(184, 217, 222, ${emphasis})`;
            const tickHeight = height * (i % 3 === 0 ? 0.19 : 0.08);
            context.fillRect(i * step, center - tickHeight / 2, Math.max(1, width / 350), tickHeight);
        }
        const position = active ? 0.5 + Math.sin(phase * 0.23) * 0.28 : 0.5;
        context.fillStyle = active ? '#86b59c' : 'rgba(134, 181, 156, 0.25)';
        context.beginPath();
        context.arc(width * position, center, Math.max(2, height * 0.045), 0, Math.PI * 2);
        context.fill();
        return true;
    }

    function readLiveSignal() {
        if (model.captureFailed || !model.analyser || !model.timeData || !model.frequencyData
            || audio.paused || model.receiverState !== 'playing'
            || model.audioContext?.state !== 'running') return null;
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
            // Some native stream decoders expose no samples even with CORS.
            // Return audio ownership instead of leaving that station in the graph.
            restoreNativePlayback();
            return null;
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
        if (!model.liveValidated) {
            // The Signal panel keeps its original trace/bars. The dock gains a third chapter.
            const dock=surface.root.id==='dock-instruments';
            const active=['playing','paused'].includes(model.receiverState);
            const elapsed=model.fallbackPlaybackMs;
            const chapter=Math.floor(elapsed/28000)%3;
            const progress=clamp((elapsed%28000-25600)/2400);
            const blend=progress*progress*(3-2*progress);
            const astraWeight=dock&&active&&!reducedMotion.matches&&astraInstrument
                ? chapter===1?blend:chapter===2?1-blend:0:0;
            // Retain the original pilot-to-bars transition; let bars hand over to Astra.
            const motifTime=dock&&astraInstrument&&!reducedMotion.matches
                ? chapter===0?elapsed%28000:chapter===1?28000+Math.min(elapsed%28000,25000):0
                : elapsed;
            if(astraWeight<1){context.globalAlpha=1-astraWeight;drawReceiverFallback(context,width,height,center,motifTime);}
            if(astraWeight>0){
                context.globalAlpha=astraWeight;
                if(!astraInstrument.draw(context,width,height,model.fallbackPhase/1.8,density)){
                    context.globalAlpha=1;drawReceiverFallback(context,width,height,center);
                }
            }
            surface.root.dataset.motif=astraWeight>.5?'astra':chapter===1&&dock?'bars':'pilot';
            context.restore();
            return;
        }
        context.strokeStyle = line;
        context.lineWidth = density;
        for (let index = 1; index < 8 && model.liveValidated; index += 1) {
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
        } else if (drawReceiverFallback(context, width, height, center)) {
            // The fallback is deliberately keyed to receiver state, never presented as audio data.
        } else {
            context.moveTo(0, center);
            context.lineTo(width, center);
        }
        context.strokeStyle = ink;
        context.lineWidth = Math.max(density, (1.1 + model.energy * 0.75) * density);
        context.shadowColor = ink;
        context.shadowBlur = model.liveValidated
            ? (2 + model.energy * 8) * density
            : model.captureFailed && model.receiverState === 'playing' ? 3 * density : 0;
        context.stroke();

        // A fixed measuring cursor belongs to live analysis, not the ambient carrier.
        if (!model.liveValidated) {
            context.restore();
            return;
        }
        const carrierX = Math.round(width / 2) + 0.5;
        const carrierHeight = height * (0.16 + model.carrier * 0.56);
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
        if (document.hidden || time - model.lastRenderAt < 33) {
            requestAnimationFrame(render);
            return;
        }
        model.lastRenderAt = time;
        const fallbackDelta = model.fallbackLastAt ? Math.min(100, time - model.fallbackLastAt) : 0;
        model.fallbackLastAt = time;
        if (!reducedMotion.matches && !model.liveValidated &&
            (model.receiverState === 'loading' || (model.receiverState === 'playing' && !audio.paused))) {
            model.fallbackPhase += fallbackDelta * (model.receiverState === 'loading' ? 0.006 : 0.0018);
            if (model.receiverState === 'playing' && !audio.paused) model.fallbackPlaybackMs += fallbackDelta;
        }
        const liveBands = readLiveSignal();
        if (!liveBands && !audio.paused && !model.liveValidated) {
            model.smoothedBands = model.smoothedBands.map(value => followSignal(value, 0, 0.2, 0.18));
            model.energy = followSignal(model.energy, 0, 0.2, 0.12);
            model.flux = followSignal(model.flux, 0, 0.2, 0.16);
            model.impact = followSignal(model.impact, 0, 0.2, 0.14);
            model.carrier = followSignal(model.carrier, 0, 0.2, 0.1);
        }
        const values = liveBands || (audio.paused && model.liveValidated ? model.lastBands : model.smoothedBands);
        onSignalFrame({
            mode: model.liveValidated ? 'audio-analysis' : 'receiver-state',
            phase: model.fallbackPhase, analysisAllowed: model.analysisAllowed,
            contextState: model.audioContext?.state || 'none', captureFailed: model.captureFailed,
            state: model.receiverState, level: model.energy,
            bass: values[0], mid: values[1], treble: values[2], transient: model.impact
        });
        const frameKey = `${model.receiverState}:${model.liveValidated}:${model.captureFailed}:${surfaces.map(surface => `${surface.waveform.clientWidth},${surface.waveform.clientHeight}`).join(':')}`;
        if (!reducedMotion.matches || frameKey !== model.reducedFrameKey) {
            surfaces.forEach(drawWaveform);
            updateBands(values);
        }
        model.reducedFrameKey = reducedMotion.matches ? frameKey : '';
        requestAnimationFrame(render);
    }

    function bindAudioEvents() {
        audioEvents?.abort();
        audioEvents = new AbortController();
        const listen = (name, callback) => audio.addEventListener(name, callback, { signal: audioEvents.signal });
        listen('playing', () => {
            if (model.captureFailed) {
                analysisUnavailable();
                return;
            }
            if (model.audioContext?.state !== 'running' || !model.liveValidated) {
                void attemptAnalysis();
                return;
            }
            setAnalysisState('live', 'LIVE AUDIO');
        });
        listen('pause', () => {
            if (model.liveValidated) setAnalysisState('paused', 'PAUSED');
            else if (model.captureFailed) analysisUnavailable();
        });
        listen('loadstart', () => {
            model.liveValidated = false;
            model.audibleFrames = 0;
            model.validationFrames = 0;
            model.sampleFrame = 0;
            model.captureFailed = !model.analysisAllowed;
            if (!model.analyser) model.captureAttempted = false;
            if (model.captureFailed) analysisUnavailable();
            else setAnalysisState('listening', 'TUNING');
        });
        listen('error', () => setAnalysisState('error', 'NO SIGNAL'));
        listen('emptied', resetSignal);
    }
    bindAudioEvents();

    resetSignal();
    requestAnimationFrame(render);

    return {
        setState({ state, label }) {
            model.receiverState = state || 'idle';
            model.receiverLabel = label || '';
            if (state === 'error') setAnalysisState('error', 'NO SIGNAL');
            else if (model.captureFailed) analysisUnavailable();
            else if (state === 'loading') setAnalysisState('listening', label === 'BUFFERING' ? 'BUFFERING' : 'TUNING');
            else if (state === 'playing' && model.liveValidated && model.audioContext?.state === 'running') setAnalysisState('live', 'LIVE AUDIO');
            else if (state === 'paused' && model.liveValidated) setAnalysisState('paused', 'PAUSED');
            else if (state === 'idle' && !audio.getAttribute('src')) resetSignal();
        },
        setStation(station) {
            releaseAudioGraph();
            model.analysisAllowed = CORS_ANALYSIS_STATIONS.has(station?.stationuuid);
            if (model.analysisAllowed) audio.crossOrigin = 'anonymous';
            else audio.removeAttribute('crossorigin');
            resetSignal();
        },
        fallbackToPlayback() {
            if (!model.analysisAllowed || audio.crossOrigin !== 'anonymous') return false;
            releaseAudioGraph();
            model.analysisAllowed = false;
            model.captureFailed = true;
            audio.removeAttribute('crossorigin');
            analysisUnavailable();
            return true;
        },
        arm() {
            if (!model.analysisAllowed) return;
            try {
                const context = ensureAudioContext();
                if (model.captureFailed) {
                    model.captureFailed = false;
                    model.captureAttempted = false;
                }
                if (context && context.state !== 'running') {
                    const unlock = context.createBufferSource();
                    unlock.buffer = context.createBuffer(1, 1, 22050);
                    unlock.connect(context.destination);
                    unlock.onended = () => unlock.disconnect();
                    unlock.start(0);
                    void context.resume().catch(() => {});
                }
            } catch {
                model.captureFailed = true;
                analysisUnavailable();
            }
        }
    };
}
