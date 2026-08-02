// ============================================================================
// NERV TERMINAL MONITOR - MAGI SYSTEM INTERFACE
// Real-time system data visualization with phosphor CRT aesthetic
// ============================================================================

// Configuration
const UPDATE_INTERVAL = 500; // 500ms update interval
const HISTORY_SIZE = 60;     // 30 seconds of history

// API Base URL - auto-detect based on current location
const API_BASE = window.location.origin;

console.log('API Base:', API_BASE);
console.log('Page URL:', window.location.href);

// State
let systemData = null;
let historyData = {
    cpu: [],
    memory: [],
    network: [],
    disk: []
};
let sessionStartBytes = { rx: 0, tx: 0, total: 0 };
let sessionInitialized = false;

// 7-Segment Block Character Map
const SEVEN_SEGMENT = {
    '0': '█▀█\n█▄█',
    '1': '▄█\n▄█',
    '2': '▀▀█\n█▄▄',
    '3': '▀▀█\n▄▄█',
    '4': '█▄█\n  █',
    '5': '█▀▀\n▄▄█',
    '6': '█▀▀\n█▄█',
    '7': '▀▀█\n  █',
    '8': '█▀█\n█▄█',
    '9': '█▀█\n▄▄█',
    ':': '▄\n▀',
    '.': ' \n▄',
    '%': '█ ▄\n▄ █',
    '-': ' \n▄▄',
    ' ': ' \n '
};

// Hexagon characters
const HEX_EMPTY = '⬡';
const HEX_FILL = '⬢';
const HEX_SOLID = '◉';

// Waveform characters for seismic display
const WAVE_CHARS = ['╱', '╲', '│', '─', '╳'];

// ============================================================================
// Initialization
// ============================================================================

function init() {
    createHexRing();
    createCpuHexGrid();
    createMemoryHexBar();
    createConnectionMatrix();
    initWaveforms();
    
    // Start update loops
    updateSystemData();
    setInterval(updateSystemData, UPDATE_INTERVAL);
    setInterval(updateChronograph, 1000);
    
    // Fetch syslog data
    fetchSyslog();
    setInterval(fetchSyslog, 5000); // Update syslog every 5 seconds
    
    // Fetch WiFi data
    fetchWifi();
    setInterval(fetchWifi, 10000); // Update WiFi every 10 seconds
    
    // Add initial log entry
    addLogEntry('MAGI SYSTEM INITIALIZED');
    addLogEntry(`Platform: ${navigator.platform}`);
}

// ============================================================================
// Data Fetching
// ============================================================================

async function updateSystemData() {
    try {
        console.log('Fetching system data...');
        const apiUrl = `${API_BASE}/api/system`;
        console.log('API URL:', apiUrl);
        const response = await fetch(apiUrl);
        console.log('Response status:', response.status);
        if (!response.ok) {
            const text = await response.text();
            console.error('Error response:', text);
            throw new Error(`HTTP ${response.status}`);
        }
        
        systemData = await response.json();
        console.log('System data received:', systemData);
        
        // Validate data structure
        if (!systemData || !systemData.cpu) {
            console.error('Invalid data structure:', systemData);
            throw new Error('Invalid data structure from API');
        }
        
        // Update history
        if (systemData.cpu && systemData.cpu.usage) {
            historyData.cpu.push(systemData.cpu.usage);
        }
        if (systemData.memory && systemData.memory.percent) {
            historyData.memory.push(parseFloat(systemData.memory.percent));
        }
        if (systemData.network && systemData.network.delta) {
            historyData.network.push(systemData.network.delta);
        }
        if (systemData.disk && systemData.disk.delta) {
            historyData.disk.push(systemData.disk.delta);
        }
        
        if (historyData.cpu.length > HISTORY_SIZE) {
            historyData.cpu.shift();
            historyData.memory.shift();
            historyData.network.shift();
            historyData.disk.shift();
        }
        
        // Update all displays
        updateCpuDisplay();
        updateMemoryDisplay();
        updateNetworkDisplay();
        updateDiskDisplay();
        updateThermalDisplay();
        updateLoadDisplay();
        updateInterfaceDisplay();
        updateStatusDisplay();
        updateWaveforms();
        
        // Check for warnings
        checkWarnings();
        
    } catch (err) {
        console.error('System data fetch failed:', err);
        addLogEntry(`DATA SYNC ERROR: ${err.message}`);
        // Log more details for debugging
        console.log('Fetch attempted to: /api/system');
        console.log('Current location:', window.location.href);
    }
}

// ============================================================================
// Hex Ring Chronograph (HQ Time - Pacific)
// ============================================================================

function createHexRing() {
    const ring = document.getElementById('hqHexRing');
    if (!ring) return;
    
    const radius = 50;
    const centerX = 60;
    const centerY = 60;
    
    for (let i = 0; i < 60; i++) {
        const angle = (i * 6 - 90) * (Math.PI / 180);
        const x = centerX + radius * Math.cos(angle);
        const y = centerY + radius * Math.sin(angle);
        
        const pos = document.createElement('div');
        pos.className = 'hex-ring-position';
        pos.textContent = i % 5 === 0 ? '◆' : '·';
        pos.style.left = `${x - 4}px`;
        pos.style.top = `${y - 4}px`;
        pos.dataset.second = i;
        ring.appendChild(pos);
    }
}

function updateChronograph() {
    // HQ Time (Pacific)
    const hqTime = new Date().toLocaleTimeString('en-US', {
        timeZone: 'America/Los_Angeles',
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
    
    document.getElementById('hqTime').textContent = hqTime;
    
    // Update hex ring
    const seconds = new Date().getSeconds();
    document.querySelectorAll('.hex-ring-position').forEach(pos => {
        const posSec = parseInt(pos.dataset.second);
        if (posSec === seconds) {
            pos.classList.add('active');
            pos.textContent = HEX_SOLID;
        } else if (posSec % 5 === 0) {
            pos.classList.remove('active');
            pos.textContent = '◆';
        } else {
            pos.classList.remove('active');
            pos.textContent = '·';
        }
    });
    
    // Local Time (Central) - 7 Segment
    const localTime = new Date().toLocaleTimeString('en-US', {
        timeZone: 'America/Chicago',
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
    
    document.getElementById('localTime').innerHTML = renderSevenSegment(localTime);
    
    // Update sync ratio (simulated based on seconds)
    const ms = new Date().getMilliseconds();
    const syncRatio = (400 + Math.sin(Date.now() / 1000) * 0.5).toFixed(1);
    document.getElementById('syncRatio').textContent = syncRatio;
}

// ============================================================================
// 7-Segment Display Renderer
// ============================================================================

function renderSevenSegment(text) {
    // Use block characters to simulate 7-segment display
    const segmentMap = {
        '0': '▀▀▀\n█ █\n▄▄▄',
        '1': '  ▀\n  █\n  ▄',
        '2': '▀▀▀\n  █\n▄▄▄',
        '3': '▀▀▀\n  █\n▄▄▄',
        '4': '█ █\n▄▄█\n  █',
        '5': '▀▀▀\n█  \n▄▄▄',
        '6': '▀▀▀\n█  \n▄▄▄',
        '7': '▀▀▀\n  █\n  █',
        '8': '▀▀▀\n█ █\n▄▄▄',
        '9': '▀▀▀\n█ █\n▄▄▄',
        ':': '▄\n \n▀',
        '-': '  \n▄▄\n  '
    };
    
    // Simplified block representation
    return text.split('').map(char => {
        const upper = document.createElement('span');
        upper.style.display = 'inline-block';
        upper.style.width = '0.6em';
        upper.style.textAlign = 'center';
        upper.textContent = char === ':' ? '◉' : '▌';
        return upper.outerHTML;
    }).join('');
}

// ============================================================================
// CPU Hexagonal Grid
// ============================================================================

function createCpuHexGrid() {
    const grid = document.getElementById('cpuHexGrid');
    if (!grid) return;
    
    // Assume up to 16 cores for the grid
    for (let i = 0; i < 16; i++) {
        const hex = document.createElement('div');
        hex.className = 'cpu-hex empty';
        hex.textContent = HEX_EMPTY;
        hex.title = `CPU Core ${i}`;
        hex.dataset.core = i;
        grid.appendChild(hex);
    }
}

function updateCpuDisplay() {
    if (!systemData || !systemData.cpu) return;
    
    const { usage, count } = systemData.cpu;
    
    usage.forEach((pct, i) => {
        const hex = document.querySelector(`.cpu-hex[data-core="${i}"]`);
        if (!hex) return;
        
        hex.className = 'cpu-hex';
        
        if (pct < 20) {
            hex.classList.add('empty');
            hex.textContent = HEX_EMPTY;
        } else if (pct < 40) {
            hex.classList.add('low');
            hex.textContent = HEX_FILL;
        } else if (pct < 70) {
            hex.classList.add('medium');
            hex.textContent = HEX_FILL;
        } else if (pct < 90) {
            hex.classList.add('high');
            hex.textContent = HEX_FILL;
        } else {
            hex.classList.add('critical');
            hex.textContent = HEX_SOLID;
        }
    });
}

function updateLoadDisplay() {
    if (!systemData || !systemData.load) return;
    
    const { one, five, fifteen } = systemData.load;
    
    document.getElementById('load1').textContent = one.toFixed(2);
    document.getElementById('load5').textContent = five.toFixed(2);
    document.getElementById('load15').textContent = fifteen.toFixed(2);
}

// ============================================================================
// Memory Hex Bar (LCL Pressure)
// ============================================================================

function createMemoryHexBar() {
    const bar = document.getElementById('memoryHexBar');
    if (!bar) return;
    
    for (let i = 0; i < 20; i++) {
        const cell = document.createElement('span');
        cell.className = 'hex-bar-cell';
        cell.textContent = HEX_FILL;
        bar.appendChild(cell);
    }
}

function updateMemoryDisplay() {
    if (!systemData || !systemData.memory) return;
    
    const { percent } = systemData.memory;
    const cells = document.querySelectorAll('.hex-bar-cell');
    const filledCount = Math.round((parseFloat(percent) / 100) * cells.length);
    
    document.getElementById('lclPressure').textContent = `${percent}%`;
    
    cells.forEach((cell, i) => {
        cell.className = 'hex-bar-cell';
        
        if (i < filledCount) {
            if (parseFloat(percent) > 90) {
                cell.classList.add('critical');
            } else if (parseFloat(percent) > 70) {
                cell.classList.add('warning');
            } else {
                cell.classList.add('filled');
            }
        }
    });
}

// ============================================================================
// Thermal Display
// ============================================================================

function updateThermalDisplay() {
    if (!systemData || !systemData.thermal) return;
    
    const grid = document.getElementById('thermalGrid');
    if (!grid) return;
    
    const existingItems = grid.querySelectorAll('.thermal-item');
    
    systemData.thermal.forEach((zone, i) => {
        let item = existingItems[i];
        
        // Calculate temperature percentage for bar
        const critical = zone.critical || 100;
        const tempPercent = Math.min(100, (zone.temperature / critical) * 100);
        const tempColor = zone.critical_state ? '#ff0040' : 
                         zone.throttling ? '#ff6b00' : 
                         tempPercent > 70 ? '#ff8c00' : '#00ff41';
        
        if (!item) {
            item = document.createElement('div');
            item.className = 'thermal-item';
            item.innerHTML = `
                <div class="thermal-info">
                    <span class="thermal-name"></span>
                    <div class="thermal-bar-container">
                        <div class="thermal-bar"></div>
                    </div>
                    <div class="thermal-meta">
                        <span class="thermal-threshold"></span>
                    </div>
                </div>
                <div class="thermal-values">
                    <span class="thermal-value"></span>
                    <span class="thermal-status"></span>
                </div>
            `;
            grid.appendChild(item);
        }
        
        item.className = 'thermal-item';
        if (zone.critical_state) {
            item.classList.add('critical');
        } else if (zone.throttling) {
            item.classList.add('throttling');
        }
        
        // Update name
        const nameEl = item.querySelector('.thermal-name');
        if (nameEl) {
            nameEl.textContent = zone.name.replace(/thermal_zone|hwmon|_/g, ' ').trim().substring(0, 20);
        }
        
        // Update temperature value
        const valueEl = item.querySelector('.thermal-value');
        if (valueEl) {
            valueEl.textContent = `${zone.temperature.toFixed(1)}°C`;
            valueEl.style.color = tempColor;
        }
        
        // Update temperature bar
        const barEl = item.querySelector('.thermal-bar');
        if (barEl) {
            barEl.style.width = `${tempPercent}%`;
            barEl.style.background = tempColor;
        }
        
        // Update threshold info
        const thresholdEl = item.querySelector('.thermal-threshold');
        if (thresholdEl) {
            thresholdEl.textContent = `CRIT: ${critical}°C`;
        }
        
        // Update status indicator
        const statusEl = item.querySelector('.thermal-status');
        if (statusEl) {
            if (zone.critical_state) {
                statusEl.textContent = 'CRITICAL';
                statusEl.style.color = '#ff0040';
            } else if (zone.throttling) {
                statusEl.textContent = 'THROTTLING';
                statusEl.style.color = '#ff6b00';
            } else if (tempPercent > 70) {
                statusEl.textContent = 'WARNING';
                statusEl.style.color = '#ff8c00';
            } else {
                statusEl.textContent = 'NORMAL';
                statusEl.style.color = '#00ff41';
            }
        }
    });
    
    // Remove extra items
    while (existingItems.length > systemData.thermal.length) {
        grid.removeChild(grid.lastChild);
    }
}

// ============================================================================
// Network Display
// ============================================================================

function updateNetworkDisplay() {
    if (!systemData || !systemData.network) return;
    
    const { delta, interfaces } = systemData.network;
    
    // Update throughput rates
    document.getElementById('netRx').textContent = formatBytes(delta.rx) + '/s';
    document.getElementById('netTx').textContent = formatBytes(delta.tx) + '/s';
    
    // Calculate total bytes and packets
    let totalRx = 0, totalTx = 0, totalRxPackets = 0, totalTxPackets = 0;
    interfaces.forEach(iface => {
        totalRx += iface.rx_bytes || 0;
        totalTx += iface.tx_bytes || 0;
        totalRxPackets += iface.rx_packets || 0;
        totalTxPackets += iface.tx_packets || 0;
    });
    
    // Initialize session tracking on first call
    if (!sessionInitialized && totalRx > 0) {
        sessionStartBytes.rx = totalRx;
        sessionStartBytes.tx = totalTx;
        sessionStartBytes.total = totalRx + totalTx;
        sessionInitialized = true;
    }
    
    // Calculate session deltas (traffic since page load)
    const sessionRx = totalRx - sessionStartBytes.rx;
    const sessionTx = totalTx - sessionStartBytes.tx;
    const sessionTotal = sessionRx + sessionTx;
    
    // Update or create total stats display
    let totalStats = document.getElementById('netTotalStats');
    if (!totalStats) {
        const container = document.querySelector('.balthasar .network-stats');
        if (container) {
            totalStats = document.createElement('div');
            totalStats.id = 'netTotalStats';
            totalStats.className = 'net-total-stats';
            container.parentNode.insertBefore(totalStats, container.nextSibling);
        }
    }
    
    if (totalStats) {
        const totalBytes = totalRx + totalTx;
        const totalPackets = totalRxPackets + totalTxPackets;
        totalStats.innerHTML = `
            <div class="net-total-header">AGGREGATE STATISTICS</div>
            
            <div class="net-total-section">
                <div class="section-label">SESSION (SINCE PAGE LOAD)</div>
                <div class="net-total-row session">
                    <span class="net-total-label">SESSION TOTAL</span>
                    <span class="seven-segment-small" style="color: var(--phosphor-orange)">${formatBytes(sessionTotal)}</span>
                </div>
                <div class="net-total-row">
                    <span class="net-total-label">SESS RX</span>
                    <span class="seven-segment-small" style="color: var(--phosphor-green)">+${formatBytes(sessionRx)}</span>
                </div>
                <div class="net-total-row">
                    <span class="net-total-label">SESS TX</span>
                    <span class="seven-segment-small" style="color: var(--phosphor-orange-bright)">+${formatBytes(sessionTx)}</span>
                </div>
            </div>
            
            <div class="net-total-section">
                <div class="section-label">LIFETIME (SINCE BOOT)</div>
                <div class="net-total-row lifetime">
                    <span class="net-total-label">LIFETIME TOTAL</span>
                    <span class="seven-segment-small" style="color: var(--sage)">${formatBytes(totalBytes)}</span>
                </div>
                <div class="net-total-row">
                    <span class="net-total-label">TOTAL RX</span>
                    <span class="seven-segment-small" style="color: var(--phosphor-green)">${formatBytes(totalRx)}</span>
                </div>
                <div class="net-total-row">
                    <span class="net-total-label">TOTAL TX</span>
                    <span class="seven-segment-small" style="color: var(--phosphor-orange-bright)">${formatBytes(totalTx)}</span>
                </div>
            </div>
            
            <div class="net-total-row packets">
                <span class="net-total-label">PACKETS RX/TX</span>
                <span class="seven-segment-small">${formatNumber(totalRxPackets)} / ${formatNumber(totalTxPackets)}</span>
            </div>
            <div class="net-total-row packets">
                <span class="net-total-label">TOTAL PACKETS</span>
                <span class="seven-segment-small" style="color: var(--sage)">${formatNumber(totalPackets)}</span>
            </div>
        `;
    }
}

function updateInterfaceDisplay() {
    if (!systemData || !systemData.network) return;
    
    const grid = document.getElementById('interfaceGrid');
    if (!grid) return;
    
    const { interfaces, delta } = systemData.network;
    
    // Get interface rates from delta
    const interfaceRates = {};
    if (delta && delta.interfaces) {
        delta.interfaces.forEach(rate => {
            interfaceRates[rate.name] = rate;
        });
    }
    
    // Group interfaces by status
    const activeInterfaces = interfaces.filter(i => i.carrier);
    const inactiveInterfaces = interfaces.filter(i => !i.carrier);
    
    let html = '';
    
    // Active interfaces with detailed info
    if (activeInterfaces.length > 0) {
        html += '<div class="interface-section active">';
        html += '<div class="interface-section-title">ACTIVE INTERFACES</div>';
        html += activeInterfaces.map(iface => {
            const rates = interfaceRates[iface.name] || {};
            const rxRate = formatBytes(rates.rx_rate || 0) + '/s';
            const txRate = formatBytes(rates.tx_rate || 0) + '/s';
            return `
                <div class="interface-item detailed ${iface.carrier ? 'active' : 'inactive'}">
                    <div class="interface-main">
                        <div class="interface-name">${iface.name}</div>
                        <div class="interface-status">● LINK UP</div>
                    </div>
                    <div class="interface-stats">
                        <div class="interface-stat">
                            <span class="stat-label">RX TOTAL</span>
                            <span class="stat-value">${formatBytes(iface.rx_bytes || 0)}</span>
                        </div>
                        <div class="interface-stat">
                            <span class="stat-label">TX TOTAL</span>
                            <span class="stat-value">${formatBytes(iface.tx_bytes || 0)}</span>
                        </div>
                        <div class="interface-stat">
                            <span class="stat-label">RX RATE</span>
                            <span class="stat-value" style="color: var(--phosphor-green)">${rxRate}</span>
                        </div>
                        <div class="interface-stat">
                            <span class="stat-label">TX RATE</span>
                            <span class="stat-value" style="color: var(--phosphor-orange)">${txRate}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        html += '</div>';
    }
    
    // Inactive interfaces (compact)
    if (inactiveInterfaces.length > 0) {
        html += '<div class="interface-section inactive">';
        html += '<div class="interface-section-title">INACTIVE</div>';
        html += inactiveInterfaces.map(iface => `
            <div class="interface-item compact inactive">
                <div class="interface-name">${iface.name}</div>
                <div class="interface-status">DOWN</div>
            </div>
        `).join('');
        html += '</div>';
    }
    
    grid.innerHTML = html;
}

function formatNumber(num) {
    if (num >= 1000000000) return (num / 1000000000).toFixed(1) + 'G';
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
}

// ============================================================================
// Disk Display
// ============================================================================

function updateDiskDisplay() {
    if (!systemData || !systemData.disk) return;
    
    const { delta } = systemData.disk;
    
    document.getElementById('diskRead').textContent = formatBytes(delta.read) + '/s';
    document.getElementById('diskWrite').textContent = formatBytes(delta.write) + '/s';
}

// ============================================================================
// Seismic Waveform Canvas
// ============================================================================

function initWaveforms() {
    // Initialize canvas contexts
    const netCanvas = document.getElementById('networkWaveform');
    const diskCanvas = document.getElementById('diskWaveform');
    
    if (netCanvas) {
        netCanvas.width = netCanvas.offsetWidth || 300;
        netCanvas.height = 80;
    }
    if (diskCanvas) {
        diskCanvas.width = diskCanvas.offsetWidth || 300;
        diskCanvas.height = 80;
    }
}

function updateWaveforms() {
    drawWaveform('networkWaveform', historyData.network, 'rx', 'tx', '--phosphor-green');
    drawWaveform('diskWaveform', historyData.disk, 'read', 'write', '--phosphor-orange');
}

function drawWaveform(canvasId, data, key1, key2, colorVar) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    // Clear with fade effect
    ctx.fillStyle = 'rgba(15, 5, 5, 0.3)';
    ctx.fillRect(0, 0, width, height);
    
    if (data.length < 2) return;
    
    // Get color
    const color = getComputedStyle(document.documentElement).getPropertyValue(colorVar).trim() || '#00ff41';
    
    // Calculate max for normalization
    const maxVal = Math.max(
        ...data.map(d => Math.max(d[key1] || 0, d[key2] || 0)),
        1
    );
    
    // Draw jagged seismic waveform
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    
    const stepX = width / (HISTORY_SIZE - 1);
    
    for (let i = 0; i < data.length; i++) {
        const x = i * stepX;
        const val = data[i][key1] || 0;
        const normalized = val / maxVal;
        const y = height / 2 - (normalized * height / 2);
        
        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            // Jagged line
            const prevX = (i - 1) * stepX;
            const midX = (prevX + x) / 2;
            ctx.lineTo(midX, y > height/2 ? y - 5 : y + 5);
            ctx.lineTo(x, y);
        }
    }
    
    ctx.stroke();
    
    // Draw second line (TX/Write) in different color
    ctx.strokeStyle = color === '#00ff41' ? '#ff6b00' : '#00ff41';
    ctx.beginPath();
    
    for (let i = 0; i < data.length; i++) {
        const x = i * stepX;
        const val = data[i][key2] || 0;
        const normalized = val / maxVal;
        const y = height / 2 + (normalized * height / 2);
        
        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            const prevX = (i - 1) * stepX;
            const midX = (prevX + x) / 2;
            ctx.lineTo(midX, y > height/2 ? y - 3 : y + 3);
            ctx.lineTo(x, y);
        }
    }
    
    ctx.stroke();
    
    // Draw center line
    ctx.strokeStyle = 'rgba(0, 255, 65, 0.2)';
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();
    ctx.setLineDash([]);
}

// ============================================================================
// Connection Matrix
// ============================================================================

function createConnectionMatrix() {
    const matrix = document.getElementById('connectionMatrix');
    if (!matrix) return;
    
    for (let i = 0; i < 32; i++) {
        const hex = document.createElement('div');
        hex.className = 'matrix-hex';
        hex.textContent = HEX_EMPTY;
        matrix.appendChild(hex);
    }
}

async function fetchSyslog() {
    try {
        const response = await fetch(`${API_BASE}/api/system/syslog?lines=8`);
        if (!response.ok) throw new Error('Failed to fetch syslog');
        
        const data = await response.json();
        updateTerminalWidget(data);
    } catch (err) {
        console.error('Syslog fetch failed:', err);
    }
}

function updateTerminalWidget(syslogData) {
    const output = document.getElementById('terminalOutput');
    const source = document.getElementById('syslogSource');
    
    if (!output) return;
    
    // Update source label
    if (source && syslogData.source) {
        source.textContent = syslogData.source;
    }
    
    // Clear loading message
    output.innerHTML = '';
    
    // Add syslog entries
    if (syslogData.entries && syslogData.entries.length > 0) {
        syslogData.entries.forEach(entry => {
            const line = document.createElement('div');
            line.className = 'terminal-status-line';
            
            // Color-code by message content
            let msgClass = '';
            const msg = entry.message.toLowerCase();
            if (msg.includes('error') || msg.includes('failed') || msg.includes('critical')) {
                msgClass = 'term-red';
            } else if (msg.includes('warn')) {
                msgClass = 'term-orange';
            } else if (msg.includes('success') || msg.includes('started') || msg.includes('active')) {
                msgClass = 'term-green';
            }
            
            // Format: timestamp process: message
            const shortTime = entry.timestamp ? entry.timestamp.split(' ').slice(1, 3).join(' ') : '';
            const displayMsg = msgClass ? `<span class="${msgClass}">${escapeHtml(entry.message)}</span>` : escapeHtml(entry.message);
            
            line.innerHTML = `<span class="log-timestamp">${shortTime}</span> ${displayMsg}`;
            output.appendChild(line);
        });
    } else {
        output.innerHTML = '<div class="terminal-status-line">No log entries available</div>';
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function updateStatusDisplay() {
    if (!systemData) return;
    
    // Update terminal widget
    updateTerminalWidget();
    
    // Update uptime
    const uptime = systemData.uptime || 0;
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);
    
    document.getElementById('uptimeDisplay').textContent = 
        `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    
    // Update connection matrix with random activity for visual effect
    const matrixHexes = document.querySelectorAll('.matrix-hex');
    matrixHexes.forEach(hex => {
        const rand = Math.random();
        if (rand > 0.95) {
            hex.classList.add('active');
            hex.textContent = HEX_FILL;
            setTimeout(() => {
                hex.classList.remove('active');
                hex.textContent = HEX_EMPTY;
            }, 200);
        }
    });
    
    // Update status hexes based on system state
    const statusHexes = document.querySelectorAll('.status-hex');
    
    // SYNC status
    if (statusHexes[0]) {
        statusHexes[0].dataset.status = 'normal';
    }
    
    // LCL status (memory)
    if (statusHexes[1] && systemData.memory) {
        const memPercent = parseFloat(systemData.memory.percent);
        statusHexes[1].dataset.status = memPercent > 90 ? 'alert' : memPercent > 70 ? 'warning' : 'normal';
    }
    
    // AT Field status (thermal)
    if (statusHexes[2] && systemData.thermal) {
        const hasCritical = systemData.thermal.some(t => t.critical_state);
        const hasThrottling = systemData.thermal.some(t => t.throttling);
        statusHexes[2].dataset.status = hasCritical ? 'alert' : hasThrottling ? 'warning' : 'normal';
    }
}

// ============================================================================
// Warning System
// ============================================================================

function checkWarnings() {
    if (!systemData) return;
    
    const warningStripes = document.getElementById('warningStripes');
    let showWarning = false;
    let warningMsg = '';
    
    // Check load
    const coreCount = systemData.cpu.count || 1;
    if (systemData.load.one > coreCount) {
        showWarning = true;
        warningMsg = 'HIGH LOAD DETECTED';
    }
    
    // Check thermal
    if (systemData.thermal.some(t => t.is_throttling || t.critical_state)) {
        showWarning = true;
        warningMsg = 'THERMAL THROTTLING';
    }
    
    // Check memory
    if (parseFloat(systemData.memory.percent) > 90) {
        showWarning = true;
        warningMsg = 'CRITICAL MEMORY PRESSURE';
    }
    
    if (showWarning) {
        warningStripes.classList.add('active');
        warningStripes.querySelector('span').textContent = `⚠ ${warningMsg} ⚠`;
    } else {
        warningStripes.classList.remove('active');
    }
}

// ============================================================================
// Auth Log
// ============================================================================

function addLogEntry(message) {
    const log = document.getElementById('authLog');
    if (!log) return;
    
    const time = new Date().toLocaleTimeString('en-US', { hour12: false });
    
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.innerHTML = `
        <span class="log-time">${time}</span>
        <span class="log-msg">${message}</span>
    `;
    
    log.insertBefore(entry, log.firstChild);
    
    // Keep only last 20 entries
    while (log.children.length > 20) {
        log.removeChild(log.lastChild);
    }
}

// ============================================================================
// Documentation Toggle
// ============================================================================

function toggleDocumentation() {
    const content = document.getElementById('docContent');
    content.classList.toggle('active');
}

// ============================================================================
// Utilities
// ============================================================================

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// ============================================================================
// Start
// ============================================================================

async function fetchWifi() {
    try {
        const response = await fetch(`${API_BASE}/api/system/wifi`);
        if (!response.ok) throw new Error('Failed to fetch WiFi');
        
        const data = await response.json();
        updateWifiDisplay(data);
    } catch (err) {
        console.error('WiFi fetch failed:', err);
    }
}

function updateWifiDisplay(wifiData) {
    const list = document.getElementById('wifiList');
    const chart = document.getElementById('wifiChart');
    
    if (!list) return;
    
    // Clear scanning state
    list.innerHTML = '';
    
    if (!wifiData.networks || wifiData.networks.length === 0) {
        list.innerHTML = `
            <div class="wifi-item">
                <span class="wifi-icon">📡</span>
                <span class="wifi-status">No wireless interfaces detected</span>
            </div>
        `;
        return;
    }
    
    // Sort by signal strength (connected first, then by signal)
    const sorted = [...wifiData.networks].sort((a, b) => {
        if (a.connected && !b.connected) return -1;
        if (!a.connected && b.connected) return 1;
        return b.signal - a.signal;
    });
    
    // Limit to 5 networks
    const displayNetworks = sorted.slice(0, 5);
    
    displayNetworks.forEach(network => {
        const item = document.createElement('div');
        item.className = `wifi-item ${network.connected ? 'connected' : 'available'}`;
        
        // Calculate signal bars (0-4)
        const signalDbm = network.signal || -70;
        let bars = 0;
        if (signalDbm > -50) bars = 4;
        else if (signalDbm > -60) bars = 3;
        else if (signalDbm > -70) bars = 2;
        else if (signalDbm > -80) bars = 1;
        
        const barHtml = [1, 2, 3, 4].map(i => {
            let barClass = '';
            if (i <= bars) {
                if (signalDbm > -60) barClass = 'strong';
                else if (signalDbm > -70) barClass = 'medium';
                else barClass = 'weak';
            }
            return `<div class="wifi-bar ${barClass}"></div>`;
        }).join('');
        
        const metaText = network.connected 
            ? `Connected · ${network.frequency || '2.4 GHz'} · Ch ${network.channel || '?'}`
            : `${network.frequency || ''} ${network.mac ? '· ' + network.mac.substring(0, 8) + '...' : ''}`;
        
        item.innerHTML = `
            <span class="wifi-icon">${network.connected ? '📶' : '◉'}</span>
            <div class="wifi-info">
                <span class="wifi-ssid">${escapeHtml(network.ssid)}</span>
                <span class="wifi-meta">${metaText}</span>
            </div>
            <div class="wifi-signal">
                <div class="wifi-bars">${barHtml}</div>
                <span class="wifi-signal-db">${signalDbm} dBm</span>
            </div>
        `;
        
        list.appendChild(item);
    });
    
    // Update chart
    if (chart) {
        chart.innerHTML = '';
        displayNetworks.forEach((network, i) => {
            const bar = document.createElement('div');
            bar.className = 'wifi-chart-bar';
            bar.style.left = `${i * 20 + 5}%`;
            bar.style.height = `${Math.min(100, Math.max(10, (network.signal + 100) * 2))}%`;
            
            const signalDbm = network.signal || -70;
            if (signalDbm > -60) bar.classList.add('strong');
            else if (signalDbm > -70) bar.classList.add('medium');
            else bar.classList.add('weak');
            
            chart.appendChild(bar);
        });
    }
}

window.addEventListener('DOMContentLoaded', init);
window.toggleDocumentation = toggleDocumentation;
