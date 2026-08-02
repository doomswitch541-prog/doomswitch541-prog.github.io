// NERV Archive Terminal
// A theatrical, local-only page index. It does not inspect the device,
// enumerate networks, request permissions, or contact an API.

const PAGE_FIELD = [
    { day: 1, title: 'Paradise Motel', file: 'motel.html', date: 'JAN 02 2026', phase: 'STATIC / ORIGIN 2024' },
    { day: 2, title: 'Luxury Tier Homelessness', file: 'luxurytierhomeless.html', date: 'JAN 02–10', phase: 'STATIC' },
    { day: 3, title: 'Urban Resonance', file: 'resonance.html', date: 'JAN 02–10', phase: 'STATIC' },
    { day: 4, title: 'Raccoon Gang', file: 'raccoongang.html', date: 'JAN 02–10', phase: 'STATIC' },
    { day: 5, title: 'RE-IND Homeland', file: 'day5.html', date: 'JAN 02–10', phase: 'STATIC' },
    { day: 6, title: 'Celestial Drift', file: 'day6.html', date: 'JAN 02–10', phase: 'STATIC' },
    { day: 7, title: 'Raccoons of Chongqing', file: 'day7.html', date: 'JAN 10 2026', phase: 'STATIC / FINAL' },
    { day: 8, title: 'SolarFlare', file: 'solarflare-about.html', date: 'AFTER JAN 10', phase: 'PLANNING' },
    { day: 9, title: 'NERV Terminal', file: 'day9.html', date: 'DATE UNRESOLVED', phase: 'SECOND MACHINE' },
    { day: 10, title: 'NERV System Monitor', file: 'day10.html', date: 'DATE UNRESOLVED', phase: 'SECOND MACHINE' },
].map((page) => ({ ...page, route: `/365/${page.file}` }));

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const terminalBody = document.getElementById('terminalBody');
const terminalInput = document.getElementById('terminalInput');
const terminalScrollback = document.getElementById('terminalScrollback');
const pageList = document.getElementById('wifiNetworkList');
const hostsList = document.getElementById('hostsList');
const hostsPanel = document.getElementById('hostsPanel');
const hostsCount = document.getElementById('hostsCount');
const radar = document.getElementById('wifiRadarContainer');
const scanButton = document.getElementById('wifiScanBtn');
const scanStatus = document.getElementById('wifiStatusText');
const magiStatus = document.getElementById('magiStatus');
const localIndicator = document.getElementById('continuousIndicator');

let visiblePages = [];
let scanGeneration = 0;

terminalBody.setAttribute('aria-live', 'polite');
document.getElementById('routerPanel')?.classList.add('active');

function updateScrollback() {
    const count = terminalBody.querySelectorAll('.terminal-line').length;
    terminalScrollback.textContent = `${count} line${count === 1 ? '' : 's'}`;
    terminalBody.scrollTop = terminalBody.scrollHeight;
}

function addTerminalLine(text, type = 'output') {
    const line = document.createElement('div');
    line.className = `terminal-line ${type}`;
    line.textContent = text;
    terminalBody.append(line);
    updateScrollback();
}

function clearTerminal() {
    terminalBody.replaceChildren();
    updateScrollback();
}

function setDetail(page) {
    document.getElementById('wifiDetailName').textContent = `DAY ${String(page.day).padStart(2, '0')}`;
    document.getElementById('wifiDetailSSID').textContent = page.title;
    document.getElementById('wifiDetailSecurity').textContent = page.phase;
    document.getElementById('wifiDetailFreq').textContent = page.date;
    document.getElementById('wifiDetailChannel').textContent = page.route;

    document.querySelectorAll('.wifi-signal-segment').forEach((segment, index) => {
        segment.classList.toggle('active', index < Math.min(4, Math.ceil(page.day / 3)));
    });

    document.getElementById('wifiDetails').classList.add('active');
}

window.closeWifiDetails = function closeWifiDetails() {
    document.getElementById('wifiDetails').classList.remove('active');
};

function createRadarBlip(page, index) {
    const angle = ((index * 137.5) - 90) * (Math.PI / 180);
    const radius = 22 + (index % 4) * 13;
    const blip = document.createElement('button');
    blip.type = 'button';
    blip.className = `wifi-radar-blip detected ${page.phase.startsWith('STATIC') ? 'secure' : 'connected'}`;
    blip.style.left = `${50 + Math.cos(angle) * radius}%`;
    blip.style.top = `${50 + Math.sin(angle) * radius}%`;
    blip.style.border = '0';
    blip.style.padding = '0';
    blip.dataset.signal = `D${String(page.day).padStart(2, '0')}`;
    blip.setAttribute('aria-label', `Open details for Day ${page.day}, ${page.title}`);
    blip.addEventListener('click', () => setDetail(page));
    radar.append(blip);
}

function createPageLink(page) {
    const link = document.createElement('a');
    link.className = 'wifi-network-item';
    link.href = page.route;
    link.style.textDecoration = 'none';

    const name = document.createElement('span');
    name.className = 'wifi-network-name';
    name.textContent = `D${String(page.day).padStart(2, '0')}  ${page.title}`;

    const meta = document.createElement('span');
    meta.className = 'wifi-network-meta';
    const type = document.createElement('span');
    type.className = 'wifi-network-type secure';
    type.textContent = page.phase;
    meta.append(type);

    link.append(name, meta);
    link.addEventListener('mouseenter', () => setDetail(page));
    link.addEventListener('focus', () => setDetail(page));
    pageList.append(link);
}

function createHostRow(page) {
    const row = document.createElement('a');
    row.className = 'host-item';
    row.href = page.route;
    row.style.textDecoration = 'none';
    row.style.color = 'inherit';

    const identity = document.createElement('span');
    identity.textContent = `${String(page.day).padStart(2, '0')} / ${page.title}`;
    const state = document.createElement('span');
    state.textContent = page.date;
    row.append(identity, state);
    hostsList.append(row);
}

function revealPage(page, index) {
    visiblePages.push(page);
    createRadarBlip(page, index);
    createPageLink(page);
    createHostRow(page);
    hostsCount.textContent = String(visiblePages.length);
    addTerminalLine(`D${String(page.day).padStart(2, '0')}  ${page.title}  [${page.phase}]`, 'info');
}

function resetField() {
    visiblePages = [];
    pageList.replaceChildren();
    hostsList.replaceChildren();
    hostsCount.textContent = '0';
    hostsPanel.classList.remove('active');
    document.querySelectorAll('.wifi-radar-blip').forEach((blip) => blip.remove());
    window.closeWifiDetails();
}

window.scanArchivePages = function scanArchivePages() {
    const generation = ++scanGeneration;
    resetField();
    clearTerminal();
    scanButton.disabled = true;
    scanButton.textContent = 'SCANNING PAGE FIELD...';
    scanStatus.textContent = 'LOCAL INDEX SWEEP ACTIVE';
    scanStatus.className = 'wifi-status-text warning';
    magiStatus.textContent = 'NO EXTERNAL ACCESS / STATIC MANIFEST ONLY';
    localIndicator.classList.add('active');
    addTerminalLine('MAGI ARCHIVE SCAN', 'command');
    addTerminalLine('Scope locked to the local /365 manifest.', 'info');

    const interval = reducedMotion ? 0 : 150;
    PAGE_FIELD.forEach((page, index) => {
        window.setTimeout(() => {
            if (generation !== scanGeneration) return;
            revealPage(page, index);

            if (index === PAGE_FIELD.length - 1) {
                hostsPanel.classList.add('active');
                scanButton.disabled = false;
                scanButton.textContent = 'RESCAN PAGE FIELD';
                scanStatus.textContent = `${PAGE_FIELD.length} PAGES INDEXED`;
                scanStatus.className = 'wifi-status-text success';
                magiStatus.textContent = 'ARCHIVE CONSENSUS: COMPLETE';
                addTerminalLine('SCAN COMPLETE — FIXED SAME-ORIGIN ROUTES ONLY', 'success');
            }
        }, interval * index);
    });
};

function listPages() {
    if (visiblePages.length === 0) {
        addTerminalLine('PAGE FIELD EMPTY. Execute "scan".', 'warning');
        return;
    }
    visiblePages.forEach((page) => {
        addTerminalLine(`${String(page.day).padStart(2, '0')}  ${page.title}  ${page.route}`, 'output');
    });
}

window.execCommand = function executeArchiveCommand(rawCommand) {
    const command = String(rawCommand || '').trim();
    if (!command) return;
    addTerminalLine(command, 'command');

    const [name, argument] = command.toLowerCase().split(/\s+/, 2);
    switch (name) {
        case 'help':
            addTerminalLine('scan      reveal the fixed 365 page manifest', 'info');
            addTerminalLine('pages     list discovered pages', 'info');
            addTerminalLine('open N    open a discovered day number', 'info');
            addTerminalLine('clear     clear terminal output', 'info');
            addTerminalLine('home      return to the 365 calendar', 'info');
            break;
        case 'scan':
            window.scanArchivePages();
            break;
        case 'pages':
        case 'hosts':
            listPages();
            break;
        case 'open': {
            const day = Number(argument);
            const page = PAGE_FIELD.find((candidate) => candidate.day === day);
            if (!page) {
                addTerminalLine('UNKNOWN DAY. Use open 1 through open 10.', 'error');
                break;
            }
            window.location.assign(page.route);
            break;
        }
        case 'clear':
            clearTerminal();
            break;
        case 'home':
            window.location.assign('/365/');
            break;
        default:
            addTerminalLine(`UNKNOWN COMMAND: ${name}. Type help.`, 'error');
    }
};

terminalInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    const command = terminalInput.value;
    terminalInput.value = '';
    window.execCommand(command);
});

// Intentionally leave the terminal and radar empty until the visitor scans.
updateScrollback();
