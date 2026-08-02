// NERV System Monitor — local visual simulation
// No host telemetry, network inspection, permissions, storage, or API requests.

const ARCHIVE_PAGES = [
    ['01', 'Paradise Motel', 'motel.html'],
    ['02', 'Luxury Tier Homelessness', 'luxurytierhomeless.html'],
    ['03', 'Urban Resonance', 'resonance.html'],
    ['04', 'Raccoon Gang', 'raccoongang.html'],
    ['05', 'RE-IND Homeland', 'day5.html'],
    ['06', 'Celestial Drift', 'day6.html'],
    ['07', 'Raccoons of Chongqing', 'day7.html'],
    ['08', 'SolarFlare', 'solarflare-about.html'],
    ['09', 'NERV Terminal', 'day9.html'],
    ['10', 'NERV System Monitor', 'day10.html'],
].map(([day, title, file]) => ({ day, title, route: `/365/${file}` }));

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const startedAt = Date.now();
const archiveHistory = [];
const renderHistory = [];
let tick = 0;
let timerId = null;

function byId(id) {
    return document.getElementById(id);
}

function formatDuration(totalSeconds) {
    const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
    const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
}

function formatRate(value) {
    if (value >= 1024) return `${(value / 1024).toFixed(1)} KB/s`;
    return `${Math.round(value)} B/s`;
}

function createHexRing() {
    const ring = byId('hqHexRing');
    const radius = 50;
    const center = 60;
    for (let index = 0; index < 60; index += 1) {
        const angle = (index * 6 - 90) * (Math.PI / 180);
        const position = document.createElement('div');
        position.className = 'hex-ring-position';
        position.textContent = index % 5 === 0 ? '◆' : '·';
        position.style.left = `${center + radius * Math.cos(angle) - 4}px`;
        position.style.top = `${center + radius * Math.sin(angle) - 4}px`;
        position.dataset.second = String(index);
        ring.append(position);
    }
}

function createLoadGrid() {
    const grid = byId('cpuHexGrid');
    for (let index = 0; index < 16; index += 1) {
        const cell = document.createElement('div');
        cell.className = 'cpu-hex empty';
        cell.textContent = '⬡';
        cell.dataset.core = String(index);
        cell.title = `Local load cell ${index + 1}`;
        grid.append(cell);
    }
}

function createMemoryBar() {
    const bar = byId('memoryHexBar');
    for (let index = 0; index < 20; index += 1) {
        const cell = document.createElement('span');
        cell.className = 'hex-bar-cell';
        cell.textContent = '⬢';
        bar.append(cell);
    }
}

function createThermalModel() {
    const grid = byId('thermalGrid');
    ['ARCHIVE CORE', 'RENDER FIELD', 'MEMORY BUS'].forEach((name, index) => {
        const item = document.createElement('div');
        item.className = 'thermal-item';
        item.dataset.index = String(index);

        const info = document.createElement('div');
        info.className = 'thermal-info';
        const label = document.createElement('span');
        label.className = 'thermal-name';
        label.textContent = name;
        const barContainer = document.createElement('div');
        barContainer.className = 'thermal-bar-container';
        const bar = document.createElement('div');
        bar.className = 'thermal-bar';
        barContainer.append(bar);
        const meta = document.createElement('div');
        meta.className = 'thermal-meta';
        meta.textContent = 'LOCAL MODEL';
        info.append(label, barContainer, meta);

        const values = document.createElement('div');
        values.className = 'thermal-values';
        const value = document.createElement('span');
        value.className = 'thermal-value';
        const state = document.createElement('span');
        state.className = 'thermal-status';
        state.textContent = 'NOMINAL';
        values.append(value, state);
        item.append(info, values);
        grid.append(item);
    });
}

function createInterfaceModel() {
    const grid = byId('interfaceGrid');
    ['ARCHIVE BUS', 'RENDER QUEUE', 'PAGE FIELD'].forEach((name) => {
        const item = document.createElement('div');
        item.className = 'interface-item active';
        const label = document.createElement('span');
        label.className = 'interface-name';
        label.textContent = name;
        const state = document.createElement('span');
        state.className = 'interface-status';
        state.textContent = 'LOCAL';
        item.append(label, state);
        grid.append(item);
    });
}

function createConnectionMatrix() {
    const matrix = byId('connectionMatrix');
    for (let index = 0; index < 32; index += 1) {
        const hex = document.createElement('div');
        hex.className = 'matrix-hex';
        hex.textContent = '⬡';
        hex.dataset.index = String(index);
        matrix.append(hex);
    }
}

function createPageField() {
    const list = byId('wifiList');
    const chart = byId('wifiChart');
    list.replaceChildren();
    chart.replaceChildren();

    ARCHIVE_PAGES.forEach((page, index) => {
        const link = document.createElement('a');
        link.className = 'wifi-item available';
        link.href = page.route;
        link.style.textDecoration = 'none';
        link.style.color = 'inherit';

        const icon = document.createElement('span');
        icon.className = 'wifi-icon';
        icon.textContent = '◈';
        const info = document.createElement('span');
        info.className = 'wifi-info';
        const title = document.createElement('span');
        title.className = 'wifi-ssid';
        title.textContent = `D${page.day} ${page.title}`;
        const meta = document.createElement('span');
        meta.className = 'wifi-meta';
        meta.textContent = 'FIXED SAME-ORIGIN ROUTE';
        info.append(title, meta);
        link.append(icon, info);
        list.append(link);

        const bar = document.createElement('div');
        bar.className = 'wifi-chart-bar strong';
        bar.style.height = `${28 + ((index * 17) % 68)}%`;
        bar.title = `Day ${page.day}`;
        chart.append(bar);
    });
}

function seedLogs() {
    const authLog = byId('authLog');
    authLog.replaceChildren();
    ['LOCAL MODEL INITIALIZED', 'PAGE FIELD LOCKED TO /365', 'EXTERNAL ACCESS DISABLED'].forEach(addLogEntry);

    const terminal = byId('terminalOutput');
    terminal.replaceChildren();
    ['MAGI local visual model online', '10 fixed archive routes indexed', 'No host telemetry requested', 'No network scan performed'].forEach((message, index) => {
        const line = document.createElement('div');
        line.className = `terminal-status-line ${index === 3 ? 'success' : ''}`;
        const dot = document.createElement('span');
        dot.className = 'status-dot';
        const text = document.createElement('span');
        text.textContent = message;
        line.append(dot, text);
        terminal.append(line);
    });
}

function addLogEntry(message) {
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    const time = document.createElement('span');
    time.className = 'log-time';
    time.textContent = new Date().toLocaleTimeString('en-US', { hour12: false });
    const text = document.createElement('span');
    text.className = 'log-msg';
    text.textContent = message;
    entry.append(time, text);
    byId('authLog').append(entry);
}

function updateChronograph(now) {
    byId('hqTime').textContent = now.toLocaleTimeString('en-US', {
        timeZone: 'America/Los_Angeles', hour12: false,
    });
    byId('localTime').textContent = now.toLocaleTimeString('en-US', { hour12: false });
    byId('syncRatio').textContent = (398.5 + Math.sin(tick / 9) * 1.4).toFixed(1);
    const second = now.getSeconds();
    document.querySelectorAll('.hex-ring-position').forEach((position) => {
        position.classList.toggle('active', Number(position.dataset.second) === second);
    });
}

function updateLoadModel() {
    const base = 42 + Math.sin(tick / 6) * 13;
    document.querySelectorAll('.cpu-hex').forEach((cell, index) => {
        const value = Math.max(4, Math.min(92, base + Math.sin((tick + index) / 3) * 24));
        cell.className = 'cpu-hex';
        cell.classList.add(value < 25 ? 'empty' : value < 45 ? 'low' : value < 70 ? 'medium' : value < 88 ? 'high' : 'critical');
        cell.textContent = value < 25 ? '⬡' : '⬢';
    });

    byId('load1').textContent = (base / 22).toFixed(2);
    byId('load5').textContent = ((base + 7) / 25).toFixed(2);
    byId('load15').textContent = ((base + 3) / 28).toFixed(2);
}

function updateMemoryModel() {
    const pressure = 48 + Math.sin(tick / 13) * 11;
    byId('lclPressure').textContent = `${pressure.toFixed(1)}%`;
    const filled = Math.round((pressure / 100) * 20);
    document.querySelectorAll('.hex-bar-cell').forEach((cell, index) => {
        cell.className = 'hex-bar-cell';
        if (index < filled) cell.classList.add(pressure > 70 ? 'warning' : 'filled');
    });
}

function updateThermalModel() {
    document.querySelectorAll('.thermal-item').forEach((item, index) => {
        const value = 31 + index * 4 + Math.sin((tick + index * 3) / 8) * 5;
        item.querySelector('.thermal-value').textContent = `${value.toFixed(1)}°`;
        item.querySelector('.thermal-bar').style.width = `${Math.min(100, value * 1.55)}%`;
    });
}

function pushHistory(history, primary, secondary) {
    history.push({ primary, secondary });
    if (history.length > 60) history.shift();
}

function drawWaveform(canvasId, history, color) {
    const canvas = byId(canvasId);
    const width = canvas.clientWidth || 300;
    const height = canvas.clientHeight || 80;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const context = canvas.getContext('2d');
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);
    context.strokeStyle = color;
    context.lineWidth = 1;
    context.beginPath();
    history.forEach((sample, index) => {
        const x = history.length <= 1 ? 0 : (index / (history.length - 1)) * width;
        const combined = (sample.primary + sample.secondary) / 2;
        const y = height - Math.min(height - 4, 8 + combined * (height - 16));
        if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
    });
    context.stroke();
}

function updateFlowModel() {
    const archive = 0.28 + (Math.sin(tick / 4) + 1) * 0.19;
    const archiveOut = 0.18 + (Math.cos(tick / 7) + 1) * 0.14;
    const render = 0.22 + (Math.cos(tick / 5) + 1) * 0.2;
    const renderOut = 0.12 + (Math.sin(tick / 9) + 1) * 0.12;
    pushHistory(archiveHistory, archive, archiveOut);
    pushHistory(renderHistory, render, renderOut);
    byId('netRx').textContent = formatRate(archive * 4096);
    byId('netTx').textContent = formatRate(archiveOut * 4096);
    byId('diskRead').textContent = formatRate(render * 6144);
    byId('diskWrite').textContent = formatRate(renderOut * 6144);
    drawWaveform('networkWaveform', archiveHistory, '#00ff41');
    drawWaveform('diskWaveform', renderHistory, '#ff6b00');
}

function updateMatrix() {
    document.querySelectorAll('.matrix-hex').forEach((hex, index) => {
        const active = (index + tick) % 7 < 2;
        const connected = (index * 3 + tick) % 11 === 0;
        hex.className = `matrix-hex${active ? ' active' : ''}${connected ? ' connected' : ''}`;
        hex.textContent = active || connected ? '⬢' : '⬡';
    });
}

function updateStatus() {
    const uptime = Math.floor((Date.now() - startedAt) / 1000);
    byId('uptimeDisplay').textContent = formatDuration(uptime);
    document.querySelectorAll('.status-hex').forEach((status, index) => {
        status.dataset.status = index === 1 && tick % 31 > 26 ? 'warning' : 'normal';
    });
    const warning = byId('warningStripes');
    warning.classList.toggle('active', tick % 43 > 39);
    if (warning.classList.contains('active')) {
        warning.querySelector('span').textContent = '⚠ LOCAL RENDER SURGE — VISUAL ONLY ⚠';
    }
}

function updateSimulation() {
    tick += 1;
    updateChronograph(new Date());
    updateLoadModel();
    updateMemoryModel();
    updateThermalModel();
    updateFlowModel();
    updateMatrix();
    updateStatus();
}

window.toggleDocumentation = function toggleDocumentation() {
    byId('docContent').classList.toggle('active');
};

function initialize() {
    createHexRing();
    createLoadGrid();
    createMemoryBar();
    createThermalModel();
    createInterfaceModel();
    createConnectionMatrix();
    createPageField();
    seedLogs();
    updateSimulation();
    byId('apiStatusBadge').textContent = 'LOCAL SIMULATION';
    byId('apiStatusBadge').className = 'api-status-badge ok';

    if (!reducedMotion) timerId = window.setInterval(updateSimulation, 1000);
}

window.addEventListener('resize', () => {
    drawWaveform('networkWaveform', archiveHistory, '#00ff41');
    drawWaveform('diskWaveform', renderHistory, '#ff6b00');
}, { passive: true });

window.addEventListener('pagehide', () => {
    if (timerId) window.clearInterval(timerId);
}, { once: true });

initialize();
