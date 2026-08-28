const installButton = document.getElementById('install-app');
const installSheet = document.getElementById('install-sheet');
const installClose = installSheet?.querySelector('[data-install-close]');
const connectionStatus = document.getElementById('connection-status');
const nowPlaying = document.getElementById('now-playing');
const currentName = document.getElementById('current-name');
const currentProgram = document.getElementById('current-program');
const dockCurrentName = document.getElementById('dock-current-name');
const dockCurrentProgram = document.getElementById('dock-current-program');
const searchQuery = document.getElementById('search-query');

const standaloneQuery = window.matchMedia('(display-mode: standalone)');
const isIOS = /iPad|iPhone|iPod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
let deferredInstallPrompt = null;

function isStandalone() {
    return standaloneQuery.matches || navigator.standalone === true;
}

function setInstallVisible(visible) {
    if (!installButton) return;
    installButton.hidden = !visible;
    document.body.classList.toggle('install-available', visible);
}

function updateInstallAvailability() {
    setInstallVisible(!isStandalone() && (isIOS || Boolean(deferredInstallPrompt)));
}

function openInstallSheet() {
    if (!installSheet?.showModal) return;
    installSheet.showModal();
    document.body.classList.add('install-sheet-open');
}

function closeInstallSheet() {
    if (!installSheet?.open) return;
    installSheet.close();
}

window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    updateInstallAvailability();
});

window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    setInstallVisible(false);
});

if (typeof standaloneQuery.addEventListener === 'function') {
    standaloneQuery.addEventListener('change', updateInstallAvailability);
}

installButton?.addEventListener('click', async () => {
    if (isIOS) {
        openInstallSheet();
        return;
    }
    if (!deferredInstallPrompt) return;
    const prompt = deferredInstallPrompt;
    deferredInstallPrompt = null;
    await prompt.prompt();
    await prompt.userChoice.catch(() => null);
    updateInstallAvailability();
});

installClose?.addEventListener('click', closeInstallSheet);
installSheet?.addEventListener('click', event => {
    if (event.target === installSheet) closeInstallSheet();
});
installSheet?.addEventListener('close', () => {
    document.body.classList.remove('install-sheet-open');
    installButton?.focus({ preventScroll: true });
});

function updateConnectionStatus() {
    const offline = navigator.onLine === false;
    if (connectionStatus) connectionStatus.hidden = !offline;
    document.body.classList.toggle('is-offline', offline);
}

window.addEventListener('online', updateConnectionStatus);
window.addEventListener('offline', updateConnectionStatus);
updateConnectionStatus();

function syncMiniPlayer() {
    if (dockCurrentName && currentName) dockCurrentName.textContent = currentName.textContent;
    if (dockCurrentProgram && currentProgram) dockCurrentProgram.textContent = currentProgram.textContent;
}

if ('MutationObserver' in window) {
    const miniPlayerObserver = new MutationObserver(syncMiniPlayer);
    [currentName, currentProgram].filter(Boolean).forEach(node => {
        miniPlayerObserver.observe(node, { childList: true, characterData: true, subtree: true });
    });
    if (nowPlaying) miniPlayerObserver.observe(nowPlaying, { attributes: true, attributeFilter: ['data-state'] });
}
syncMiniPlayer();

searchQuery?.addEventListener('focus', () => document.body.classList.add('search-active'));
searchQuery?.addEventListener('blur', () => {
    window.setTimeout(() => {
        if (document.activeElement !== searchQuery) document.body.classList.remove('search-active');
    }, 80);
});

updateInstallAvailability();

async function retireBroadcastWorker() {
    if ('serviceWorker' in navigator) {
        try {
            const registrations = await navigator.serviceWorker.getRegistrations();
            await Promise.all(registrations
                .filter(registration => new URL(registration.scope).pathname.startsWith('/music/broadcast/'))
                .map(registration => registration.unregister()));
        } catch {
            // The online receiver does not depend on worker cleanup.
        }
    }

    if ('caches' in window) {
        try {
            const keys = await caches.keys();
            await Promise.all(keys
                .filter(key => key.startsWith('rg-broadcast-shell-'))
                .map(key => caches.delete(key)));
        } catch {
            // Cache cleanup must never interrupt the receiver.
        }
    }
}

window.addEventListener('load', retireBroadcastWorker, { once: true });
