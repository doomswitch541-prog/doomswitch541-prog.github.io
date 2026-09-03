const clamp = (value, minimum = 0, maximum = 1) => Math.max(minimum, Math.min(maximum, value));

function averageRange(data, analyser, minimumHz, maximumHz) {
    const binHz = analyser.context.sampleRate / analyser.fftSize;
    const start = Math.max(0, Math.floor(minimumHz / binHz));
    const end = Math.min(data.length - 1, Math.ceil(maximumHz / binHz));
    let total = 0;
    let count = 0;
    for (let index = start; index <= end; index += 1) {
        total += data[index];
        count += 1;
    }
    return count ? total / count / 255 : 0;
}

function stationSeed(station) {
    const source = `${station?.stationuuid || ''}${station?.name || ''}`;
    let value = 2166136261;
    for (let index = 0; index < source.length; index += 1) {
        value ^= source.charCodeAt(index);
        value = Math.imul(value, 16777619);
    }
    return Math.abs(value % 997) / 997;
}

function canvasMetrics(canvas) {
    const density = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(canvas.clientWidth * density));
    const height = Math.max(1, Math.round(canvas.clientHeight * density));
    if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
    }
    return { context: canvas.getContext('2d'), width, height, density };
}

export function createBroadcastInstruments({ audio, nowPlaying }) {
    const root = document.getElementById('receiver-instruments');
    const elements = {
        source: document.getElementById('receiver-analysis-source'),
        waveformLabel: document.getElementById('receiver-waveform-label'),
        waveformState: document.getElementById('receiver-waveform-state'),
        waveform: document.getElementById('receiver-waveform-canvas'),
        spectrumLabel: document.getElementById('receiver-spectrum-label'),
        spectrumState: document.getElementById('receiver-spectrum-state'),
        spectrum: document.getElementById('receiver-spectrum-canvas'),
        bandLabels: [
            document.getElementById('receiver-band-low-label'),
            document.getElementById('receiver-band-mid-label'),
            document.getElementById('receiver-band-high-label')
        ],
        bandFills: [
            document.getElementById('receiver-band-low'),
            document.getElementById('receiver-band-mid'),
            document.getElementById('receiver-band-high')
        ],
        bandValues: [
            document.getElementById('receiver-band-low-value'),
            document.getElementById('receiver-band-mid-value'),
            document.getElementById('receiver-band-high-value')
        ],
        levelLabel: document.getElementById('receiver-level-label'),
        level: document.getElementById('receiver-level')
    };

    if (!root || !audio || !elements.waveform || !elements.spectrum) {
        return { setState() {}, setStation() {} };
    }

    const model = {
        receiverState: nowPlaying?.dataset.state || 'idle',
        stateLabel: 'STANDBY',
        station: null,
        seed: 0.37,
        audioContext: null,
        analyser: null,
        streamSource: null,
        timeData: null,
        frequencyData: null,
        captureAttempted: false,
        liveValidated: false,
        liveFrames: 0,
        quietFrames: 0,
        smoothedLevel: 0,
        smoothedBands: [0, 0, 0],
        reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches
    };

    function setSourceMode(isLive) {
        root.dataset.source = isLive ? 'live' : 'state';
        elements.source.textContent = isLive ? 'LIVE AUDIO ANALYSIS' : 'RECEIVER STATE';
        elements.waveformLabel.textContent = isLive ? 'WAVEFORM ANALYSIS' : 'RECEIVER STATE TRACE';
        elements.spectrumLabel.textContent = isLive ? 'FREQUENCY SCAN' : 'SIGNAL HEALTH';
        elements.spectrumState.textContent = isLive ? 'B / M / T' : 'CONNECTION';
        elements.bandLabels.forEach((element, index) => {
            element.textContent = isLive ? ['BASS', 'MID', 'TREBLE'][index] : ['LOCK', 'LINK', 'BUF'][index];
        });
        elements.levelLabel.textContent = isLive ? 'LIVE LEVEL' : 'STATE LEVEL';
        elements.waveform.setAttribute('aria-label', isLive ? 'Live audio waveform analysis' : 'Receiver state trace');
        elements.spectrum.setAttribute('aria-label', isLive ? 'Live bass, mid, and treble spectrum' : 'Receiver connection health');
    }

    function resetCaptureProof() {
        model.liveValidated = false;
        model.liveFrames = 0;
        model.quietFrames = 0;
        setSourceMode(false);
    }

    async function attemptCapture() {
        if (model.captureAttempted || audio.paused) return;
        model.captureAttempted = true;
        const capture = audio.captureStream || audio.mozCaptureStream;
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!capture || !AudioContextClass) return;

        try {
            const stream = capture.call(audio);
            if (!stream?.getAudioTracks().length) return;
            const context = new AudioContextClass();
            const analyser = context.createAnalyser();
            analyser.fftSize = 1024;
            analyser.smoothingTimeConstant = 0.76;
            const source = context.createMediaStreamSource(stream);
            source.connect(analyser);
            model.audioContext = context;
            model.analyser = analyser;
            model.streamSource = source;
            model.timeData = new Uint8Array(analyser.fftSize);
            model.frequencyData = new Uint8Array(analyser.frequencyBinCount);
            if (context.state === 'suspended') await context.resume();
        } catch (error) {
            console.info('RG Broadcast kept receiver-state visuals; stream capture was unavailable.', error?.name || error);
        }
    }

    function stateTargets(time) {
        const phase = time * 0.001;
        const targets = {
            idle: [0.05, 0.08, 0.03, 0.04],
            paused: [0.34, 0.2, 0.08, 0.13],
            loading: [0.56, 0.46, 0.72, 0.45],
            playing: [0.92, 0.88, 0.2, 0.64],
            error: [0.16, 0.05, 0.02, 0.18]
        }[model.receiverState] || [0.08, 0.08, 0.04, 0.05];
        const motion = model.reducedMotion ? 0 : Math.sin(phase * 2.1 + model.seed * 8) * 0.035;
        return [
            clamp(targets[0] + motion),
            clamp(targets[1] + motion * 0.7),
            clamp(targets[2] + Math.max(0, motion)),
            clamp(targets[3] + motion * 0.45)
        ];
    }

    function readLiveSignal() {
        if (!model.analyser || !model.timeData || !model.frequencyData || audio.paused) return null;
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
        const audibleSample = rms > 0.0015 || peak > 0.008 || model.frequencyData.some(value => value > 3);
        model.liveFrames = audibleSample ? model.liveFrames + 1 : Math.max(0, model.liveFrames - 1);
        model.quietFrames = audibleSample ? 0 : model.quietFrames + 1;
        if (!model.liveValidated && model.liveFrames >= 5) {
            model.liveValidated = true;
            setSourceMode(true);
        }
        if (model.liveValidated && model.quietFrames > 240) resetCaptureProof();
        if (!model.liveValidated) return null;
        return {
            level: clamp(rms * 4.8),
            bands: [
                clamp(averageRange(model.frequencyData, model.analyser, 20, 250) * 1.55),
                clamp(averageRange(model.frequencyData, model.analyser, 250, 2500) * 1.42),
                clamp(averageRange(model.frequencyData, model.analyser, 2500, 10000) * 1.72)
            ]
        };
    }

    function drawWaveform(time, live) {
        const { context, width, height, density } = canvasMetrics(elements.waveform);
        context.clearRect(0, 0, width, height);
        context.strokeStyle = 'rgba(230, 220, 195, 0.08)';
        context.lineWidth = density;
        for (let row = 1; row < 4; row += 1) {
            const y = height * row / 4;
            context.beginPath();
            context.moveTo(0, y);
            context.lineTo(width, y);
            context.stroke();
        }

        const points = live ? model.timeData.length : 180;
        const stateAmplitude = stateTargets(time)[3];
        context.beginPath();
        for (let index = 0; index < points; index += 1) {
            const ratio = index / Math.max(1, points - 1);
            const x = ratio * width;
            let normalized;
            if (live) normalized = (model.timeData[index] - 128) / 128;
            else {
                const phase = time * 0.0018 + ratio * 18 + model.seed * 11;
                const carrier = Math.sin(phase) * 0.52 + Math.sin(phase * 2.41) * 0.18;
                const gate = model.receiverState === 'error' ? (index % 17 < 2 ? 1 : 0.12) : 1;
                normalized = carrier * stateAmplitude * gate;
            }
            const y = height / 2 + normalized * height * 0.37;
            if (index === 0) context.moveTo(x, y);
            else context.lineTo(x, y);
        }
        const color = model.receiverState === 'error' ? '#d34f3f' : live ? '#86b59c' : '#e6a04a';
        context.strokeStyle = color;
        context.lineWidth = Math.max(1, 1.2 * density);
        context.shadowColor = color;
        context.shadowBlur = 7 * density;
        context.stroke();
        context.shadowBlur = 0;
    }

    function drawSpectrum(time, live, targets) {
        const { context, width, height, density } = canvasMetrics(elements.spectrum);
        context.clearRect(0, 0, width, height);
        const bars = 36;
        const gap = 3 * density;
        const barWidth = Math.max(1, (width - gap * (bars - 1)) / bars);
        for (let index = 0; index < bars; index += 1) {
            let value;
            if (live) {
                const sourceIndex = Math.floor((index / bars) ** 1.7 * Math.min(model.frequencyData.length - 1, 230));
                value = model.frequencyData[sourceIndex] / 255;
            } else {
                const group = index < 12 ? 0 : index < 24 ? 1 : 2;
                const pulse = model.reducedMotion ? 0 : Math.sin(time * 0.0017 + index * 0.7 + model.seed * 9) * 0.04;
                value = clamp(targets[group] * (0.52 + (index % 5) * 0.08) + pulse);
            }
            const barHeight = Math.max(2 * density, value * height * 0.86);
            const x = index * (barWidth + gap);
            context.fillStyle = index > 28 ? 'rgba(211, 79, 63, 0.72)' : live ? 'rgba(134, 181, 156, 0.86)' : 'rgba(230, 160, 74, 0.78)';
            context.fillRect(x, height - barHeight, barWidth, barHeight);
        }
    }

    function updateReadout(values) {
        const speed = 0.13;
        model.smoothedLevel += (values.level - model.smoothedLevel) * speed;
        model.smoothedBands = model.smoothedBands.map((value, index) => value + (values.bands[index] - value) * speed);
        elements.bandFills.forEach((element, index) => {
            const percentage = Math.round(model.smoothedBands[index] * 100);
            element.style.width = `${percentage}%`;
            elements.bandValues[index].value = String(percentage).padStart(2, '0');
            elements.bandValues[index].textContent = elements.bandValues[index].value;
        });
        const level = Math.round(model.smoothedLevel * 100);
        elements.level.textContent = `${String(level).padStart(2, '0')}%`;
    }

    function render(time) {
        const liveSignal = readLiveSignal();
        const state = stateTargets(time);
        const live = Boolean(liveSignal);
        const values = liveSignal || { bands: state.slice(0, 3), level: state[3] };
        drawWaveform(time, live);
        drawSpectrum(time, live, values.bands);
        updateReadout(values);
        requestAnimationFrame(render);
    }

    audio.addEventListener('playing', () => {
        void attemptCapture();
    });
    audio.addEventListener('loadstart', () => {
        if (!model.analyser) model.captureAttempted = false;
        resetCaptureProof();
    });
    audio.addEventListener('error', resetCaptureProof);
    window.addEventListener('resize', () => {
        canvasMetrics(elements.waveform);
        canvasMetrics(elements.spectrum);
    });

    setSourceMode(false);
    requestAnimationFrame(render);

    return {
        setState({ state, label }) {
            model.receiverState = state || 'idle';
            model.stateLabel = label || state || 'STANDBY';
            elements.waveformState.textContent = String(model.stateLabel).toUpperCase();
            if (state === 'error') resetCaptureProof();
        },
        setStation(station) {
            model.station = station;
            model.seed = stationSeed(station);
            resetCaptureProof();
        }
    };
}
