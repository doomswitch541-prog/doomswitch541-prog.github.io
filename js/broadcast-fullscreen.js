// Fullscreen changes the browser surface only; the receiver and its audio stay put.
import {setConsoleView} from './broadcast-console.js?v=20260924-2';
const button = document.getElementById('fullscreen-toggle');
const modeButton = document.getElementById('fullscreen-mode-toggle');
const toggles = [button, modeButton];
const root = document.documentElement;
const dock = document.getElementById('now-playing');
let immersive = false, previousView;
const status = document.createElement('span');
status.className = 'sr-only';
status.setAttribute('role', 'status');
button.after(status);
const browserButton = document.createElement('button');
browserButton.id = 'browser-fullscreen-toggle';
browserButton.type = 'button';
browserButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4H4v4m12-4h4v4M4 16v4h4m12-4v4h-4"/></svg>';
document.querySelector('.head-controls').append(browserButton);
function syncFullscreen() {
    const active = immersive;
    for (const toggle of toggles) {
        toggle.setAttribute('aria-pressed', String(active));
        toggle.setAttribute('aria-label', active ? 'Exit Fullscreen mode' : 'Enter Fullscreen mode');
        toggle.title = active ? 'Exit Fullscreen' : 'Fullscreen';
        toggle.querySelector('path').setAttribute('d', active
            ? 'M4 8h4V4m8 0v4h4M8 20v-4H4m16 0h-4v4'
            : 'M8 4H4v4m12-4h4v4M4 16v4h4m12-4v4h-4');
    }
    modeButton.querySelector('span').textContent = active ? 'Exit Fullscreen' : 'Fullscreen';
    browserButton.hidden = !immersive || !document.fullscreenEnabled || !root.requestFullscreen;
    browserButton.title = document.fullscreenElement === root ? 'Exit browser fullscreen' : 'Browser fullscreen';
    browserButton.setAttribute('aria-label', browserButton.title);
    browserButton.setAttribute('aria-pressed', String(document.fullscreenElement === root));
}

function setImmersive(active) {
    if (active === immersive) return;
    if (active) previousView = {view:dock.dataset.view, expanded:dock.dataset.expanded === 'true'};
    immersive = active;
    document.body.classList.toggle('broadcast-immersive', active);
    setConsoleView(active ? dock.dataset.view : previousView.view, active ? false : previousView.expanded);
    syncFullscreen();
}

async function toggleFullscreen() {
    toggles.forEach(toggle => { toggle.disabled = true; });
    status.textContent = '';
    const menu = document.getElementById('broadcast-site-menu');
    if (!menu.hidden) document.getElementById('site-menu-toggle').click();
    try {
        if (immersive) {
            if (document.fullscreenElement === root) await document.exitFullscreen();
            setImmersive(false);
        } else {
            setImmersive(true);
        }
    } catch {
        status.textContent = 'Compact galaxy view is open. Browser fullscreen is unavailable.';
    } finally {
        toggles.forEach(toggle => { toggle.disabled = false; });
        syncFullscreen();
    }
}

button.addEventListener('click', toggleFullscreen);
modeButton.addEventListener('click', toggleFullscreen);
browserButton.addEventListener('click', async () => {
    browserButton.disabled = true;
    try {
        if (document.fullscreenElement === root) await document.exitFullscreen();
        else await root.requestFullscreen({navigationUI:'hide'});
    } catch { status.textContent = 'Browser fullscreen is unavailable. Galaxy view stays open.'; }
    finally { browserButton.disabled = false; syncFullscreen(); }
});
document.addEventListener('fullscreenchange', syncFullscreen);
// Escape exits fullscreen without also collapsing the console or changing Car Mode.
document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !immersive
        || document.querySelector('dialog[open]')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void toggleFullscreen();
}, true);
syncFullscreen();
