// ============ NERV TERMINAL v3.1 - MAGI SYSTEM INTERFACE ============
// Deep Network Surveillance with Continuous Monitoring

let commandHistory = [];
let historyIndex = -1;
let isScanning = false;
let scannedNetworks = [];
let lastScanMethod = null;
let lastScanTimestamp = null;
let collapsedPanels = new Set();

// Continuous monitoring
let continuousMode = false;
let continuousInterval = null;
const SCAN_INTERVAL = 15000; // 15 seconds between scans

// Network topology data
let networkTopology = null;
let discoveredHosts = [];
let routerInfo = null;

// DOM elements
let terminalInput = null;
let terminalBody = null;

// API endpoints
const WIFI_API = {
    scan: '/api/wifi/scan',
    status: '/api/wifi/status',
    network: '/api/wifi/network',
    router: '/api/wifi/router'
};

// Terminal line management
let totalLineCount = 0;
const MAX_VISIBLE_LINES = 100;

// Track blip angles for sweep detection
let blipAngles = [];

// NERV status messages for "alive" feel
const NERV_MESSAGES = {
    startup: [
        'MAGI SYSTEM INITIALIZING...',
        'SYNCHRONIZING WITH TERMINAL DOGMA...',
        'ESTABLISHING AT FIELD CONNECTION...',
        'NEURAL LINK CONNECTED',
        'LCL PRESSURE NOMINAL'
    ],
    scanComplete: [
        'SCAN COMPLETE - PATTERN BLUE',
        'HOSTILE SIGNALS DETECTED',
        'NETWORK PERIMETER SECURE',
        'NO ANGEL SIGNATURES FOUND',
        'SYNC RATIO STABLE'
    ],
    warnings: [
        'WARNING: SIGNAL DEGRADATION',
        'ALERT: UNKNOWN DEVICE DETECTED',
        'CAUTION: WEAK ENCRYPTION',
        'NOTICE: OPEN NETWORK IN RANGE'
    ]
};

function getTimestamp() {
    const now = new Date();
    return now.toTimeString().slice(0, 8);
}

function getNervTime() {
    // NERV-style timestamp with countdown feel
    const now = new Date();
    return `T-${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}:${now.getSeconds().toString().padStart(2,'0')}`;
}

function updateScrollbackIndicator() {
    const indicator = document.getElementById('terminalScrollback');
    if (!indicator || !terminalBody) return;
    const visible = terminalBody.children.length;
    if (totalLineCount > visible) {
        indicator.textContent = `${totalLineCount} lines | showing ${visible}`;
    } else {
        indicator.textContent = `${totalLineCount} lines`;
    }
}

function addTerminalLine(text, type = '', options = {}) {
    if (!terminalBody) return null;
    totalLineCount++;

    const line = document.createElement('div');
    line.className = `terminal-line ${type}`;
    line.dataset.type = type || 'output';

    // Timestamp
    const timestamp = document.createElement('span');
    timestamp.className = 'terminal-timestamp';
    timestamp.textContent = getTimestamp();

    // Prefix based on line type
    const prefix = document.createElement('span');
    prefix.className = 'terminal-prefix';

    if (type === 'command') {
        prefix.classList.add('cmd');
        prefix.textContent = '>';
    } else if (type === 'error') {
        prefix.classList.add('error');
        prefix.textContent = '!';
    } else if (type === 'success') {
        prefix.classList.add('success');
        prefix.textContent = '✓';
    } else if (type === 'warning') {
        prefix.classList.add('warning');
        prefix.textContent = '▲';
    } else if (type === 'info') {
        prefix.classList.add('info');
        prefix.textContent = '◆';
    } else if (type === 'system') {
        prefix.classList.add('system');
        prefix.textContent = '●';
    } else if (type === 'alert') {
        prefix.classList.add('alert');
        prefix.textContent = '⚠';
    } else if (type === 'magi') {
        prefix.classList.add('magi');
        prefix.textContent = '■';
    } else {
        prefix.classList.add('output');
        prefix.textContent = ' ';
    }

    // Content
    const content = document.createElement('span');
    content.className = 'terminal-content';
    content.textContent = text;

    line.appendChild(timestamp);
    line.appendChild(prefix);
    line.appendChild(content);

    if (options.groupStart) line.classList.add('terminal-group-start');
    if (options.groupEnd) line.classList.add('terminal-group-end');

    terminalBody.appendChild(line);
    terminalBody.scrollTop = terminalBody.scrollHeight;

    while (terminalBody.children.length > MAX_VISIBLE_LINES) {
        terminalBody.removeChild(terminalBody.firstChild);
    }

    updateScrollbackIndicator();
    return line;
}

function addTerminalTable(headers, rows, options = {}) {
    if (!terminalBody) return null;
    const container = document.createElement('div');
    container.className = 'terminal-line';
    container.dataset.type = 'table';

    const timestamp = document.createElement('span');
    timestamp.className = 'terminal-timestamp';
    timestamp.textContent = getTimestamp();

    const prefix = document.createElement('span');
    prefix.className = 'terminal-prefix output';
    prefix.textContent = ' ';

    const content = document.createElement('span');
    content.className = 'terminal-content';

    const table = document.createElement('table');
    table.className = 'terminal-table';

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    headers.forEach((h) => {
        const th = document.createElement('th');
        th.textContent = h.text;
        if (h.class) th.className = h.class;
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    rows.forEach(rowData => {
        const tr = document.createElement('tr');
        rowData.forEach((cell) => {
            const td = document.createElement('td');
            if (typeof cell === 'object') {
                td.textContent = cell.text;
                if (cell.class) td.className = cell.class;
            } else {
                td.textContent = cell;
            }
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    content.appendChild(table);
    container.appendChild(timestamp);
    container.appendChild(prefix);
    container.appendChild(content);

    if (options.groupStart) container.classList.add('terminal-group-start');
    if (options.groupEnd) container.classList.add('terminal-group-end');

    terminalBody.appendChild(container);
    terminalBody.scrollTop = terminalBody.scrollHeight;

    totalLineCount++;
    while (terminalBody.children.length > MAX_VISIBLE_LINES) {
        terminalBody.removeChild(terminalBody.firstChild);
    }
    updateScrollbackIndicator();
    return container;
}

// MAGI System status update
function updateMagiStatus(message, level = 'info') {
    const magiDisplay = document.getElementById('magiStatus');
    if (magiDisplay) {
        magiDisplay.textContent = message;
        magiDisplay.className = `magi-status ${level}`;
    }
}

// Make execCommand globally accessible
window.execCommand = async function(cmd) {
    if (!terminalBody) return;
    const args = cmd.trim().split(' ');
    const command = args[0].toLowerCase();

    addTerminalLine(cmd, 'command', { groupStart: true });

    switch (command) {
        case 'help':
            addTerminalLine('MAGI SYSTEM COMMANDS', 'magi');
            addTerminalLine('');
            addTerminalLine('  help        Show this help');
            addTerminalLine('  wifi        Display WiFi networks');
            addTerminalLine('  scan        Perform surveillance scan');
            addTerminalLine('  status      Show connection status');
            addTerminalLine('  topology    Display network topology');
            addTerminalLine('  hosts       List discovered hosts');
            addTerminalLine('  router      Show router intelligence');
            addTerminalLine('  continuous  Toggle auto-scan mode');
            addTerminalLine('  clear       Clear terminal', '', { groupEnd: true });
            break;

        case 'wifi':
        case 'network':
            if (scannedNetworks.length === 0) {
                addTerminalLine('NO SCAN DATA AVAILABLE', 'warning');
                addTerminalLine('Execute "scan" to detect networks.', 'info', { groupEnd: true });
            } else {
                addTerminalLine(`NETWORKS: ${scannedNetworks.length} | METHOD: ${lastScanMethod || 'unknown'}`, 'info');
                if (lastScanTimestamp) {
                    const age = Math.floor((Date.now() - new Date(lastScanTimestamp).getTime()) / 1000);
                    addTerminalLine(`DATA AGE: ${age}s`, 'info');
                }
                addTerminalLine('');
                
                const headers = [
                    { text: '#', class: 'col-num' },
                    { text: 'SSID', class: 'col-ssid' },
                    { text: 'SECURITY', class: 'col-sec' },
                    { text: 'SIGNAL', class: 'col-sig' }
                ];
                
                const rows = scannedNetworks.map((net, i) => {
                    const secType = net.open ? 'OPEN' : (net.security?.includes('WEP') ? 'WEP' : 'SEC');
                    const secClass = net.open ? 'open' : (net.security?.includes('WEP') ? 'wep' : 'secure');
                    const ssid = (net.ssid || 'HIDDEN').substring(0, 20);
                    const prefix = net.inUse ? '● ' : '';
                    const ssidClass = net.inUse ? 'connected' : '';
                    
                    return [
                        { text: `${prefix}${i + 1}`.trim(), class: 'col-num' },
                        { text: ssid, class: `col-ssid ${ssidClass}` },
                        { text: secType, class: `col-sec ${secClass}` },
                        { text: `${Math.round(net.signal)}%`, class: 'col-sig' }
                    ];
                });
                
                addTerminalTable(headers, rows);
                addTerminalLine('');
                addTerminalLine('● = CURRENT SYNC TARGET', 'info', { groupEnd: true });
            }
            break;

        case 'scan':
            addTerminalLine('INITIATING DEEP SURVEILLANCE SCAN...', 'magi');
            await scanWifiNetworks();
            break;

        case 'status':
            addTerminalLine('FETCHING CONNECTION STATUS...', 'info');
            await fetchWifiStatus();
            break;

        case 'topology':
        case 'net':
            addTerminalLine('MAPPING NETWORK TOPOLOGY...', 'magi');
            await fetchNetworkTopology(true);
            break;

        case 'hosts':
        case 'devices':
            await displayDiscoveredHosts();
            break;

        case 'router':
        case 'gateway':
            await displayRouterInfo();
            break;

        case 'continuous':
        case 'auto':
            toggleContinuousMode();
            break;

        case 'clear':
            terminalBody.innerHTML = '';
            totalLineCount = 0;
            updateScrollbackIndicator();
            break;

        default:
            addTerminalLine(`COMMAND NOT RECOGNIZED: ${command}`, 'error');
            addTerminalLine(`TYPE 'help' FOR AVAILABLE COMMANDS.`, 'info');
    }

    if (cmd.trim()) {
        commandHistory.push(cmd);
        historyIndex = commandHistory.length;
    }
};

function toggleContinuousMode() {
    continuousMode = !continuousMode;
    
    if (continuousMode) {
        addTerminalLine('CONTINUOUS SURVEILLANCE MODE: ACTIVATED', 'alert');
        addTerminalLine(`Auto-scan every ${SCAN_INTERVAL/1000}s`, 'info');
        updateMagiStatus('CONTINUOUS MONITORING ACTIVE', 'warning');
        
        // Start immediately
        scanWifiNetworks();
        
        // Set up interval
        continuousInterval = setInterval(() => {
            if (!isScanning) {
                scanWifiNetworks();
            }
        }, SCAN_INTERVAL);
    } else {
        addTerminalLine('CONTINUOUS SURVEILLANCE MODE: DEACTIVATED', 'info');
        updateMagiStatus('STANDBY MODE', 'info');
        
        if (continuousInterval) {
            clearInterval(continuousInterval);
            continuousInterval = null;
        }
    }
}

async function displayDiscoveredHosts() {
    if (!discoveredHosts || discoveredHosts.length === 0) {
        await fetchNetworkTopology(false);
    }
    
    if (discoveredHosts.length === 0) {
        addTerminalLine('NO HOSTS DISCOVERED', 'warning');
        addTerminalLine('Execute "topology" to scan network.', 'info', { groupEnd: true });
        return;
    }
    
    addTerminalLine(`DISCOVERED HOSTS: ${discoveredHosts.length}`, 'success');
    addTerminalLine('');
    
    const headers = [
        { text: 'IP', class: 'col-ssid' },
        { text: 'MAC', class: 'col-sec' },
        { text: 'VENDOR', class: 'col-ssid' },
        { text: 'TYPE', class: 'col-sig' }
    ];
    
    const rows = discoveredHosts.map(host => {
        let type = 'HOST';
        let typeClass = '';
        if (host.is_router) { type = 'ROUTER'; typeClass = 'warning'; }
        else if (host.is_local) { type = 'LOCAL'; typeClass = 'success'; }
        
        return [
            host.ip || '-',
            (host.mac || '-').substring(0, 17),
            (host.vendor || 'Unknown').substring(0, 15),
            { text: type, class: typeClass }
        ];
    });
    
    addTerminalTable(headers, rows, { groupEnd: true });
}

async function displayRouterInfo() {
    if (!routerInfo) {
        addTerminalLine('ANALYZING ROUTER...', 'info');
        try {
            const response = await fetch(WIFI_API.router);
            if (response.ok) {
                routerInfo = await response.json();
            }
        } catch (e) {
            addTerminalLine('ROUTER ANALYSIS FAILED', 'error');
            return;
        }
    }
    
    if (!routerInfo || !routerInfo.found) {
        addTerminalLine('NO ROUTER DETECTED', 'warning');
        addTerminalLine('Check network connectivity.', 'info', { groupEnd: true });
        return;
    }
    
    addTerminalLine('ROUTER INTELLIGENCE REPORT', 'magi');
    addTerminalLine('');
    
    const headers = [
        { text: 'PARAM', class: 'col-ssid' },
        { text: 'VALUE', class: 'col-ssid' }
    ];
    
    const rows = [
        ['IP Address', routerInfo.ip || '-'],
        ['MAC Address', routerInfo.mac || '-'],
        ['Manufacturer', routerInfo.vendor || '-'],
        ['Hostname', routerInfo.hostname || '-']
    ];
    
    addTerminalTable(headers, rows, { groupEnd: true });
}

async function fetchNetworkTopology(verbose = true) {
    try {
        const response = await fetch(WIFI_API.network);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        networkTopology = data;
        discoveredHosts = data.hosts || [];
        routerInfo = data.router;
        
        if (verbose) {
            addTerminalLine('TOPOLOGY MAPPING COMPLETE', 'success');
            addTerminalLine(`Gateway: ${data.gateway?.gateway || 'unknown'}`, 'info');
            addTerminalLine(`Interface: ${data.gateway?.interface || 'unknown'}`, 'info');
            addTerminalLine(`Discovered Hosts: ${discoveredHosts.length}`, 'info');
            
            if (data.router?.found) {
                addTerminalLine(`Router: ${data.router.vendor || 'unknown'} (${data.router.ip})`, 'info');
            }
            
            if (data.statistics) {
                addTerminalLine('');
                addTerminalLine('INTERFACE STATISTICS:', 'info');
                const rxMB = (data.statistics.rx_bytes / 1048576).toFixed(2);
                const txMB = (data.statistics.tx_bytes / 1048576).toFixed(2);
                addTerminalLine(`RX: ${rxMB} MB | TX: ${txMB} MB`, '');
            }
            
            addTerminalLine('', '', { groupEnd: true });
            
            // Update router panel if exists
            updateRouterPanel(data.router);
            updateHostsPanel(discoveredHosts);
        }
        
    } catch (err) {
        if (verbose) {
            addTerminalLine(`TOPOLOGY MAPPING FAILED: ${err.message}`, 'error');
        }
    }
}

function updateRouterPanel(router) {
    const panel = document.getElementById('routerPanel');
    if (!panel) return;
    
    if (router && router.found) {
        document.getElementById('routerIp').textContent = router.ip || '-';
        document.getElementById('routerMac').textContent = router.mac || '-';
        document.getElementById('routerVendor').textContent = router.vendor || '-';
        panel.classList.add('active');
    } else {
        panel.classList.remove('active');
    }
}

function updateHostsPanel(hosts) {
    const container = document.getElementById('hostsPanel');
    if (!container) return;
    
    const list = document.getElementById('hostsList');
    if (!list) return;
    
    list.innerHTML = '';
    
    hosts.slice(0, 10).forEach(host => {
        const item = document.createElement('div');
        item.className = 'host-item';
        if (host.is_router) item.classList.add('router');
        if (host.is_local) item.classList.add('local');
        
        item.innerHTML = `
            <span class="host-ip">${host.ip}</span>
            <span class="host-vendor">${(host.vendor || 'Unknown').substring(0, 12)}</span>
        `;
        list.appendChild(item);
    });
    
    document.getElementById('hostsCount').textContent = hosts.length;
    container.classList.add('active');
}

function initTerminalInput() {
    if (!terminalInput) return;

    terminalInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            window.execCommand(terminalInput.value);
            terminalInput.value = '';
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (historyIndex > 0) {
                historyIndex--;
                terminalInput.value = commandHistory[historyIndex] || '';
            }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (historyIndex < commandHistory.length - 1) {
                historyIndex++;
                terminalInput.value = commandHistory[historyIndex] || '';
            } else {
                historyIndex = commandHistory.length;
                terminalInput.value = '';
            }
        } else if (e.key === 'Tab') {
            e.preventDefault();
            const commands = ['help', 'wifi', 'scan', 'status', 'topology', 'hosts', 'router', 'continuous', 'clear'];
            const input = terminalInput.value.toLowerCase();
            const match = commands.find(c => c.startsWith(input));
            if (match) terminalInput.value = match;
        }
    });
}

// ============ WiFi RADAR ============
async function fetchWifiStatus() {
    if (!terminalBody) return;
    try {
        const response = await fetch(WIFI_API.status);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const status = await response.json();

        if (status.connected && status.details) {
            const d = status.details;
            updateConnectionStatus(true, d.ssid);

            addTerminalLine('CONNECTION STATUS: SYNCHRONIZED', 'success');
            addTerminalLine('');

            const headers = [
                { text: 'PARAM', class: 'col-ssid' },
                { text: 'VALUE', class: 'col-ssid' }
            ];
            const rows = [
                ['SSID', d.ssid || '-'],
                ['BSSID', d.bssid || '-'],
                ['Signal', `${d.signal_percent}% (${d.signal_dbm} dBm)`],
                ['SNR', `${d.snr_db} dB`],
                ['Frequency', d.frequency || '-'],
                ['Channel', d.channel || '-'],
                ['Bit Rate', d.bitrate || '-'],
                ['Security', d.security || '-'],
                ['Quality', (d.quality || 'unknown').toUpperCase()]
            ];
            addTerminalTable(headers, rows, { groupEnd: true });
        } else {
            updateConnectionStatus(false);
            addTerminalLine('CONNECTION STATUS: OFFLINE', 'warning');
            addTerminalLine('');
            addTerminalLine('NO ACTIVE SYNC TARGET DETECTED.', '', { groupEnd: true });
        }
    } catch (err) {
        addTerminalLine(`STATUS FETCH FAILED: ${err.message}`, 'error');
        addTerminalLine('CHECK MAGI CONNECTION.', 'info', { groupEnd: true });
    }
}

window.scanWifiNetworks = async function() {
    if (isScanning) return;

    isScanning = true;
    const btn = document.getElementById('wifiScanBtn');
    const status = document.getElementById('wifiStatusText');
    const header = document.querySelector('.header');
    const radarContainer = document.getElementById('wifiRadarContainer');

    if (btn) {
        btn.disabled = true;
        btn.classList.add('scanning');
    }
    if (header) header.classList.add('scanning');

    // MAGI-style progress steps
    const steps = [
        { btn: 'MELCHIOR', status: 'MELCHIOR → BALTHASAR → CASPER', delay: 100 },
        { btn: 'BALTHASAR', status: 'melchior → BALTHASAR → casper', delay: 400 },
        { btn: 'CASPER', status: 'melchior → balthasar → CASPER', delay: 400 }
    ];

    for (const step of steps) {
        if (btn) btn.textContent = step.btn;
        if (status) status.textContent = step.status;
        await new Promise(r => setTimeout(r, step.delay));
    }

    // Clear previous scan
    document.querySelectorAll('.wifi-radar-blip').forEach(b => b.remove());
    document.querySelectorAll('.wifi-radar-trail').forEach(t => t.remove());
    const networkList = document.getElementById('wifiNetworkList');
    if (networkList) networkList.innerHTML = '';
    blipAngles = [];
    if (radarContainer) radarContainer.classList.remove('empty');
    closeWifiDetails();

    try {
        const response = await fetch(WIFI_API.scan);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Scan failed');
        }

        const networks = data.networks || [];
        lastScanMethod = data.method;
        lastScanTimestamp = data.timestamp;

        if (networks.length === 0) {
            if (status) {
                status.textContent = 'NO SIGNALS IN RANGE';
                status.className = 'wifi-status-text warning';
            }
            if (radarContainer) radarContainer.classList.add('empty');
            addTerminalLine('NO WiFi SIGNALS DETECTED IN RANGE.', 'warning');
            addTerminalLine('CHECK ANTENNA ALIGNMENT.', 'info', { groupEnd: true });
            
            isScanning = false;
            if (btn) {
                btn.disabled = false;
                btn.classList.remove('scanning');
                btn.textContent = continuousMode ? 'AUTO-SCAN ACTIVE' : 'INITIATE SCAN';
            }
            if (header) header.classList.remove('scanning');
            return;
        }

        if (btn) btn.textContent = 'ANALYZE';
        await new Promise(r => setTimeout(r, 200));

        scannedNetworks = networks;
        updateNetCount(networks.length);

        // Check for threats (open networks, weak security)
        const openNetworks = networks.filter(n => n.open);
        const wepNetworks = networks.filter(n => n.security?.includes('WEP'));
        
        if (openNetworks.length > 0) {
            addTerminalLine(`⚠ WARNING: ${openNetworks.length} OPEN NETWORKS DETECTED`, 'alert');
        }
        if (wepNetworks.length > 0) {
            addTerminalLine(`⚠ ALERT: ${wepNetworks.length} WEP NETWORKS (WEAK SECURITY)`, 'alert');
        }

        const connectedNet = networks.find(n => n.inUse);
        const connectedStatus = document.getElementById('wifiConnectedStatus');
        const connectedText = document.getElementById('wifiConnectedText');

        if (connectedNet) {
            if (connectedText) connectedText.textContent = `SYNC: ${connectedNet.ssid || 'HIDDEN'} @ ${Math.round(connectedNet.signal)}%`;
            if (connectedStatus) connectedStatus.style.display = 'flex';
            updateConnectionStatus(true, connectedNet.ssid || 'HIDDEN');
        } else {
            if (connectedStatus) connectedStatus.style.display = 'none';
            updateConnectionStatus(false);
        }

        networks.forEach((net, i) => {
            addRadarBlip(net, i);
        });

        updateNetworkList(networks);

        if (status) {
            status.textContent = 'MAGI CONSENSUS ACHIEVED';
            status.className = 'wifi-status-text success';
        }

        // Random NERV message for "alive" feel
        const randomMsg = NERV_MESSAGES.scanComplete[Math.floor(Math.random() * NERV_MESSAGES.scanComplete.length)];
        addTerminalLine(randomMsg, 'magi');
        addTerminalLine(`Method: ${data.method || 'system'} | Networks: ${networks.length}`, 'info');
        addTerminalLine('');

        // Summary table
        const headers = [
            { text: '#', class: 'col-num' },
            { text: 'SSID', class: 'col-ssid' },
            { text: 'SEC', class: 'col-sec' },
            { text: 'SIG', class: 'col-sig' }
        ];
        const rows = networks.slice(0, 10).map((net, i) => {
            const secType = net.open ? 'OPEN' : (net.security?.includes('WEP') ? 'WEP' : 'SEC');
            const secClass = net.open ? 'open' : (net.security?.includes('WEP') ? 'wep' : 'secure');
            const ssid = (net.ssid || 'HIDDEN').substring(0, 16);
            return [
                { text: i + 1, class: 'col-num' },
                { text: ssid, class: 'col-ssid' },
                { text: secType, class: `col-sec ${secClass}` },
                { text: `${Math.round(net.signal)}%`, class: 'col-sig' }
            ];
        });
        addTerminalTable(headers, rows);

        // SNR analysis
        const networksWithSnr = networks.filter(n => n.snr);
        if (networksWithSnr.length > 0) {
            addTerminalLine('');
            addTerminalLine('SIGNAL QUALITY ANALYSIS:', 'info');

            const snrHeaders = [
                { text: 'SSID', class: 'col-ssid' },
                { text: 'SNR', class: 'col-sig' },
                { text: 'QUALITY', class: 'col-sec' }
            ];
            const snrRows = networksWithSnr.slice(0, 5).map(net => {
                let quality = 'POOR';
                let qualityClass = 'open';
                if (net.snr >= 40) { quality = 'EXCELLENT'; qualityClass = 'secure'; }
                else if (net.snr >= 25) { quality = 'GOOD'; qualityClass = 'secure'; }
                else if (net.snr >= 15) { quality = 'FAIR'; qualityClass = 'wep'; }
                return [
                    { text: (net.ssid || 'HIDDEN').substring(0, 14), class: 'col-ssid' },
                    { text: `${net.snr} dB`, class: 'col-sig' },
                    { text: quality, class: `col-sec ${qualityClass}` }
                ];
            });
            addTerminalTable(snrHeaders, snrRows, { groupEnd: true });
        } else {
            addTerminalLine('', '', { groupEnd: true });
        }

        // Fetch topology in background
        fetchNetworkTopology(false);

    } catch (error) {
        console.error('WiFi scan error:', error);
        if (status) {
            status.textContent = 'SCAN FAILED — SEE TERMINAL';
            status.className = 'wifi-status-text error';
        }
        addTerminalLine(`SURVEILLANCE FAILURE: ${error.message}`, 'error');
        addTerminalLine('CHECK MAGI SYSTEM STATUS.', 'info', { groupEnd: true });
    } finally {
        isScanning = false;
        if (btn) {
            btn.disabled = false;
            btn.classList.remove('scanning');
            btn.textContent = continuousMode ? 'AUTO-SCAN ACTIVE' : 'INITIATE SCAN';
        }
        if (header) header.classList.remove('scanning');
    }
};

function addRadarBlip(network, index) {
    const container = document.getElementById('wifiRadarContainer');
    if (!container) return;
    const blip = document.createElement('div');

    let secClass = 'secure';
    if (network.open) secClass = 'open';
    else if (network.security?.includes('WEP')) secClass = 'wep';

    if (network.inUse) {
        blip.className = `wifi-radar-blip connected`;
        blip.style.zIndex = '15';
    } else {
        blip.className = `wifi-radar-blip ${secClass}`;
    }
    
    // Store all network data for tooltip
    blip.dataset.signal = `${Math.round(network.signal)}%`;
    blip.dataset.ssid = network.ssid || 'HIDDEN';
    blip.dataset.security = network.security || 'Unknown';
    blip.dataset.frequency = network.frequency || network.freq || '2.4 GHz';
    blip.dataset.channel = network.channel || '?';
    blip.dataset.bssid = network.bssid || 'Unknown';
    blip.dataset.index = index;

    const normalizedSignal = Math.max(0, Math.min(100, network.signal || 0));
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    const angle = index * goldenAngle;

    const maxRadius = 42;
    const minRadius = 8;
    const radius = maxRadius - ((maxRadius - minRadius) * (normalizedSignal / 100));

    const x = 50 + radius * Math.cos(angle);
    const y = 50 + radius * Math.sin(angle);

    let normalizedAngle = angle % (Math.PI * 2);
    if (normalizedAngle < 0) normalizedAngle += Math.PI * 2;
    blip.dataset.angle = normalizedAngle;
    blipAngles.push({ element: blip, angle: normalizedAngle, detected: false, x: x, y: y });

    const minSize = 6;
    const maxSize = 12;
    const size = minSize + ((maxSize - minSize) * (normalizedSignal / 100));
    const finalSize = network.inUse ? size + 2 : size;

    blip.style.width = `${finalSize}px`;
    blip.style.height = `${finalSize}px`;
    blip.style.left = `calc(${x}% - ${finalSize / 2}px)`;
    blip.style.top = `calc(${y}% - ${finalSize / 2}px)`;

    blip.addEventListener('click', () => showWifiDetails(network));
    blip.addEventListener('touchend', (e) => {
        e.preventDefault();
        showWifiDetails(network);
    });

    // Create enhanced tooltip bubble
    const tooltip = document.createElement('div');
    tooltip.className = 'blip-tooltip';
    
    const tipSecType = network.open ? 'OPEN' : (network.security?.includes('WEP') ? 'WEP' : 'SEC');
    const tipSecClass = network.open ? 'open' : (network.security?.includes('WEP') ? 'wep' : 'secure');
    const connectedBadge = network.inUse ? '<span style="color: var(--nerv-green);">● CONNECTED</span>' : '';
    
    tooltip.innerHTML = `
        <div class="blip-tooltip-header">${network.ssid || 'HIDDEN'} ${connectedBadge}</div>
        <div class="blip-tooltip-row">
            <span class="blip-tooltip-label">SIGNAL</span>
            <span class="blip-tooltip-value">${Math.round(network.signal)}%</span>
        </div>
        <div class="blip-tooltip-row">
            <span class="blip-tooltip-label">SECURITY</span>
            <span class="blip-tooltip-value ${tipSecClass}">${tipSecType}</span>
        </div>
        <div class="blip-tooltip-row">
            <span class="blip-tooltip-label">FREQ</span>
            <span class="blip-tooltip-value">${network.frequency || network.freq || '2.4 GHz'}</span>
        </div>
        <div class="blip-tooltip-row">
            <span class="blip-tooltip-label">CHANNEL</span>
            <span class="blip-tooltip-value">${network.channel || '?'}</span>
        </div>
        <div class="blip-tooltip-row">
            <span class="blip-tooltip-label">BSSID</span>
            <span class="blip-tooltip-value">${(network.bssid || 'Unknown').substring(0, 17)}</span>
        </div>
    `;
    
    blip.appendChild(tooltip);
    container.appendChild(blip);
}

function createDetectionTrail(x, y) {
    const container = document.getElementById('wifiRadarContainer');
    if (!container) return;
    const trail = document.createElement('div');
    trail.className = 'wifi-radar-trail';

    const centerX = 50;
    const centerY = 50;
    const dx = x - centerX;
    const dy = y - centerY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;

    trail.style.width = `${distance}%`;
    trail.style.transform = `rotate(${angle}deg)`;

    container.appendChild(trail);

    requestAnimationFrame(() => {
        trail.classList.add('active');
    });

    setTimeout(() => trail.remove(), 800);
}

function initSweepDetection() {
    const sweep = document.querySelector('.wifi-radar-sweep');
    if (!sweep) return;

    const detectionThreshold = 0.25;

    setInterval(() => {
        const style = window.getComputedStyle(sweep);
        const transform = style.transform;
        let currentAngle = 0;

        if (transform && transform !== 'none') {
            const values = transform.match(/matrix\(([^,]+),\s*([^,]+)/);
            if (values) {
                const a = parseFloat(values[1]);
                const b = parseFloat(values[2]);
                currentAngle = Math.atan2(b, a);
            }
        }

        let normalizedSweep = currentAngle;
        if (normalizedSweep < 0) normalizedSweep += Math.PI * 2;

        blipAngles.forEach(blipData => {
            const diff = Math.abs(normalizedSweep - blipData.angle);
            const minDiff = Math.min(diff, Math.PI * 2 - diff);

            if (minDiff < detectionThreshold && !blipData.detected) {
                blipData.element.classList.add('detected');
                blipData.detected = true;
                createDetectionTrail(blipData.x, blipData.y);

                setTimeout(() => {
                    blipData.element.classList.remove('detected');
                    blipData.detected = false;
                }, 600);
            }
        });
    }, 50);
}

window.closeWifiDetails = function() {
    const details = document.getElementById('wifiDetails');
    if (details) details.classList.remove('active');
};

function showWifiDetails(network) {
    const details = document.getElementById('wifiDetails');
    if (!details) return;

    const detailName = document.getElementById('wifiDetailName');
    const detailSSID = document.getElementById('wifiDetailSSID');
    const detailSecurity = document.getElementById('wifiDetailSecurity');
    const detailFreq = document.getElementById('wifiDetailFreq');
    const detailChannel = document.getElementById('wifiDetailChannel');

    if (detailName) detailName.textContent = network.ssid || 'HIDDEN';
    if (detailSSID) detailSSID.textContent = network.ssid || 'HIDDEN';
    if (detailSecurity) detailSecurity.textContent = network.security || 'unknown';
    if (detailFreq) detailFreq.textContent = network.frequency || network.freq || 'unknown';
    if (detailChannel) detailChannel.textContent = network.channel || 'unknown';

    const segments = document.querySelectorAll('.wifi-signal-segment');
    const activeSegments = Math.ceil((network.signal || 0) / 25);
    segments.forEach((seg, i) => {
        seg.classList.toggle('active', i < activeSegments);
        seg.classList.remove('weak', 'medium');
        if (i < activeSegments) {
            if (network.signal < 40) seg.classList.add('weak');
            else if (network.signal < 70) seg.classList.add('medium');
        }
    });

    details.classList.add('active');
}

function updateNetworkList(networks) {
    const list = document.getElementById('wifiNetworkList');
    if (!list) return;
    list.innerHTML = '';

    const sortedNetworks = [...networks].sort((a, b) => {
        if (a.inUse && !b.inUse) return -1;
        if (!a.inUse && b.inUse) return 1;
        return (b.signal || 0) - (a.signal || 0);
    });

    sortedNetworks.forEach(net => {
        const item = document.createElement('div');
        if (net.inUse) {
            item.className = 'wifi-network-item connected';
            item.style.borderLeft = '3px solid var(--nerv-green-bright)';
            item.style.background = 'rgba(34, 197, 94, 0.1)';
        } else {
            item.className = 'wifi-network-item';
        }

        const typeClass = net.open ? 'open' : 'secure';
        const typeText = net.open ? 'OPEN' : (net.security?.includes('WEP') ? 'WEP' : 'SEC');
        const connectedBadge = net.inUse ? '<span style="color: var(--nerv-green); font-size: 0.6rem; margin-right: 6px;">●</span>' : '';

        item.innerHTML = `
            <span class="wifi-network-name">${connectedBadge}${net.ssid || 'HIDDEN'}</span>
            <div class="wifi-network-meta">
                <span class="wifi-network-type ${typeClass}">${typeText}</span>
                <span style="color: var(--nerv-gray-300); font-size: 0.65rem;">${Math.round(net.signal || 0)}%</span>
            </div>
        `;

        item.addEventListener('click', () => showWifiDetails(net));
        item.addEventListener('touchend', (e) => {
            e.preventDefault();
            showWifiDetails(net);
        });

        list.appendChild(item);
    });
}

function initPanelCollapse() {
    document.querySelectorAll('.panel-title').forEach(title => {
        title.addEventListener('click', function() {
            const panel = this.closest('.panel');
            const content = panel.querySelector('.panel-content');
            const panelId = panel.id || Math.random().toString(36).substr(2, 9);
            panel.id = panelId;

            if (collapsedPanels.has(panelId)) {
                collapsedPanels.delete(panelId);
                panel.classList.remove('collapsed');
                content.style.display = '';
            } else {
                collapsedPanels.add(panelId);
                panel.classList.add('collapsed');
                content.style.display = 'none';
            }
        });
    });
}

function updateStatusBar() {
    const now = new Date();
    const timeEl = document.getElementById('termTime');
    if (timeEl) timeEl.textContent = getNervTime();

    const netCount = document.getElementById('netCount');
    if (netCount) netCount.textContent = `${scannedNetworks.length} NET${scannedNetworks.length !== 1 ? 'S' : ''}`;

    const connStatus = document.getElementById('connStatus');
    const connectedNet = scannedNetworks.find(n => n.inUse);
    if (connStatus) {
        if (connectedNet) {
            connStatus.textContent = 'SYNC ACTIVE';
            connStatus.style.background = 'rgba(34, 197, 94, 0.15)';
            connStatus.style.borderColor = 'rgba(34, 197, 94, 0.4)';
            connStatus.style.color = 'var(--nerv-green-bright)';
        } else {
            connStatus.textContent = 'STANDBY';
            connStatus.style.background = 'rgba(234, 179, 8, 0.15)';
            connStatus.style.borderColor = 'rgba(234, 179, 8, 0.3)';
            connStatus.style.color = 'var(--nerv-yellow)';
        }
    }
}

function updateScrollHint() {
    const hint = document.getElementById('scrollHint');
    const body = document.getElementById('terminalBody');
    if (!hint || !body) return;

    const isScrollable = body.scrollHeight > body.clientHeight;
    const isAtBottom = body.scrollTop + body.clientHeight >= body.scrollHeight - 20;

    if (isScrollable && !isAtBottom) {
        hint.classList.add('visible');
    } else {
        hint.classList.remove('visible');
    }
}

function updateStatusTime() {
    const timeEl = document.getElementById('termTime');
    if (timeEl) timeEl.textContent = getNervTime();
}

function updateConnectionStatus(connected, ssid = '') {
    const indicator = document.getElementById('statusIndicator');
    const ssidEl = document.getElementById('statusSsid');
    const connStatus = document.getElementById('connStatus');

    if (indicator) {
        indicator.className = 'status-indicator ' + (connected ? 'online' : 'offline');
    }
    if (ssidEl) {
        ssidEl.textContent = connected ? (ssid || 'SYNCHRONIZED') : 'NO SYNC';
    }
    if (connStatus) {
        connStatus.textContent = connected ? 'ONLINE' : 'STANDBY';
        connStatus.className = 'conn-status' + (connected ? '' : ' offline');
    }
}

function updateNetCount(count) {
    const el = document.getElementById('netCount');
    if (el) el.textContent = `${count} NETS`;
}

// Activity heartbeat for "alive" feel
function startActivityHeartbeat() {
    const indicators = document.querySelectorAll('.activity-indicator');
    
    setInterval(() => {
        indicators.forEach(ind => {
            ind.classList.add('pulse');
            setTimeout(() => ind.classList.remove('pulse'), 500);
        });
    }, 3000);
}

// Initialize everything when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
    terminalInput = document.getElementById('terminalInput');
    terminalBody = document.getElementById('terminalBody');

    initPanelCollapse();
    initTerminalInput();

    if (terminalInput) {
        terminalInput.focus();
    }

    const radarContainer = document.getElementById('wifiRadarContainer');
    if (radarContainer) {
        radarContainer.classList.add('empty');
    }

    if (terminalBody) {
        terminalBody.addEventListener('scroll', updateScrollHint);
    }

    // MAGI startup sequence
    NERV_MESSAGES.startup.forEach((msg, i) => {
        setTimeout(() => addTerminalLine(msg, 'magi'), i * 200);
    });

    setTimeout(() => {
        addTerminalLine('');
        addTerminalLine('MAGI SYSTEM READY');
        addTerminalLine('TYPE "help" FOR COMMANDS');
        addTerminalLine('');
    }, NERV_MESSAGES.startup.length * 200 + 100);

    initSweepDetection();
    updateStatusBar();
    startActivityHeartbeat();

    setInterval(updateStatusBar, 1000);
    setInterval(updateStatusTime, 1000);
    updateStatusTime();

    const status = document.getElementById('wifiStatusText');
    if (status) {
        status.className = 'wifi-status-text ready';
    }
    
    updateMagiStatus('SYSTEM READY', 'info');
});
