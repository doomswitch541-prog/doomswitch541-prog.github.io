/* === Shortwave — the good channels ===
   Two jobs, no dependencies:
   1) A rotating operator-log strapline (factual flavour; static, not live data).
   2) Click-to-load YouTube embeds — nothing hits YouTube until the user taps.
   Everything the page actually DOES (open a receiver) is a plain <a> in the
   markup, so the page works fully even if this script never runs. */

(function () {
  'use strict';

  // --- rotating band log (flavour, honest: these are moods, not live logs) ---
  const LOG_LINES = [
    'band open · signals travel farther after dark',
    'carrier steady on 4625 · no voice traffic logged',
    'propagation fair · lower bands quiet, upper bands lively',
    'a marker holds an empty channel so no one else can have it',
    'somewhere a number is being read to someone who is listening',
    'the buzz never stops · it has not stopped in decades',
    'receivers are up worldwide · pick one and turn the dial',
    'nightfall lifts the ionosphere · the far stations come in',
    'nothing official will tell you what these channels are for',
    'the tick you hear is a clock in Colorado, exact to the second',
  ];

  function startLog() {
    const el = document.getElementById('sw-log');
    if (!el) return;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let i = Math.floor(Math.random() * LOG_LINES.length);
    el.textContent = LOG_LINES[i];
    if (reduce) return; // one line, no cycling
    setInterval(() => {
      el.classList.add('is-fading');
      setTimeout(() => {
        i = (i + 1 + Math.floor(Math.random() * (LOG_LINES.length - 1))) % LOG_LINES.length;
        el.textContent = LOG_LINES[i];
        el.classList.remove('is-fading');
      }, 320);
    }, 7000);
  }

  // --- click-to-load listen embeds (keyless; privacy-nocookie) ---
  // Prefers data-yt-channel (comma-separated YouTube channel IDs): embeds the
  // channel's CURRENT live stream via live_stream?channel=, so it self-heals when
  // a 24/7 broadcast ends and restarts under a new video id. Falls back to a
  // single data-yt video id if that's all a card has. Nothing loads until tapped.
  function wireListen() {
    document.querySelectorAll('.sw-listen').forEach((box) => {
      const btn = box.querySelector('.sw-listen-btn');
      if (!btn) return;
      const channels = (box.getAttribute('data-yt-channel') || '')
        .split(',').map((s) => s.trim()).filter(Boolean);
      const vid = box.getAttribute('data-yt');
      if (!channels.length && !vid) return;

      const playLabel = btn.textContent;
      let playing = false;
      let idx = 0;
      let cycler = null;

      const srcFor = () =>
        channels.length
          ? 'https://www.youtube-nocookie.com/embed/live_stream?channel=' +
            encodeURIComponent(channels[idx]) + '&autoplay=1&rel=0'
          : 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(vid) +
            '?autoplay=1&rel=0';

      function buildFrame() {
        let frame = box.querySelector('.sw-listen-frame');
        if (!frame) {
          frame = document.createElement('div');
          frame.className = 'sw-listen-frame';
          box.appendChild(frame);
        }
        frame.innerHTML = '';
        const iframe = document.createElement('iframe');
        iframe.src = srcFor();
        iframe.allow = 'autoplay; encrypted-media; picture-in-picture';
        iframe.setAttribute('allowfullscreen', '');
        iframe.title = 'Live shortwave stream';
        frame.appendChild(iframe);

        if (channels.length > 1 && !cycler) {
          cycler = document.createElement('button');
          cycler.type = 'button';
          cycler.className = 'sw-listen-alt';
          cycler.textContent = '↻ Try another feed';
          cycler.addEventListener('click', (e) => {
            e.stopPropagation();
            idx = (idx + 1) % channels.length;
            buildFrame();
          });
          box.appendChild(cycler);
        }
      }

      function stop() {
        const frame = box.querySelector('.sw-listen-frame');
        if (frame) frame.remove();
        if (cycler) { cycler.remove(); cycler = null; }
        playing = false;
        btn.setAttribute('aria-expanded', 'false');
        btn.textContent = playLabel;
      }

      btn.addEventListener('click', () => {
        if (playing) { stop(); return; }
        buildFrame();
        playing = true;
        btn.setAttribute('aria-expanded', 'true');
        btn.textContent = '■ Stop';
      });
    });
  }

  // --- receiver console: a curated dial over the real sources ---
  // Sovereign + keyless: our own dial UI. Stations with a 24/7 stream play inline
  // (channel embed, self-healing); the rest hand off to a pre-tuned live receiver.
  // It is NOT a software radio — it's an honest tuner over sources that exist.
  const STATIONS = [
    { f: 3828, mode: 'USB', code: 'S32', name: 'The Squeaky Wheel', receiver: 'http://websdr.ewi.utwente.nl:8901/?tune=3828usb' },
    { f: 4625, mode: 'USB', code: 'UVB-76', name: 'The Buzzer', channels: ['UCZ3VcGJ2pKkLj-hItlzeykA', 'UCEvM5ChAueZivZUHNCZAlNg', 'UCr1d7Fk0KnlIbNXoqvy-kVw'] },
    { f: 5448, mode: 'USB', code: 'S30', name: 'The Pip', receiver: 'http://websdr.ewi.utwente.nl:8901/?tune=5448usb' },
    { f: 7850, mode: 'USB', code: 'CHU', name: 'CHU Canada — time signal', receiver: 'http://kiwisdr.com/public/' },
    { f: 8992, mode: 'USB', code: 'HF-GCS', name: 'US military — EAM', receiver: 'http://websdr.ewi.utwente.nl:8901/?tune=8992usb' },
    { f: 10000, mode: 'AM', code: 'WWV', name: 'WWV — NIST time', receiver: 'http://kiwisdr.com/public/' },
  ];

  function initConsole() {
    const root = document.getElementById('sw-console');
    if (!root) return;
    const dial = document.getElementById('swc-dial');
    const freqEl = document.getElementById('swc-freq');
    const modeEl = document.getElementById('swc-mode');
    const nameEl = document.getElementById('swc-name');
    const statusEl = document.getElementById('swc-status');
    const playerEl = document.getElementById('swc-player');
    if (!dial || !playerEl) return;

    const MIN = 3500, MAX = 10500;
    const pos = (f) => ((f - MIN) / (MAX - MIN)) * 100;

    const needle = document.createElement('div');
    needle.className = 'swc-needle';
    dial.appendChild(needle);

    STATIONS.forEach((s, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'swc-tick';
      b.style.left = pos(s.f) + '%';
      b.innerHTML = '<span class="l"></span><span class="t">' + s.f + '</span>';
      b.setAttribute('aria-label', s.name + ' ' + s.f + ' kHz');
      b.addEventListener('click', () => tune(i));
      dial.appendChild(b);
      s._tick = b;
    });

    let cur = 1; // default: the Buzzer
    let chIdx = 0;
    let embed = null, altBtn = null;

    function stopEmbed() {
      if (embed) { embed.remove(); embed = null; }
      if (altBtn) { altBtn.remove(); altBtn = null; }
    }

    function loadEmbed(s) {
      stopEmbed();
      embed = document.createElement('div');
      embed.className = 'swc-frame-embed';
      const iframe = document.createElement('iframe');
      iframe.src = 'https://www.youtube-nocookie.com/embed/live_stream?channel=' +
        encodeURIComponent(s.channels[chIdx]) + '&autoplay=1&rel=0';
      iframe.allow = 'autoplay; encrypted-media; picture-in-picture';
      iframe.setAttribute('allowfullscreen', '');
      iframe.title = 'Live shortwave stream';
      embed.appendChild(iframe);
      root.appendChild(embed);
      if (s.channels.length > 1) {
        altBtn = document.createElement('button');
        altBtn.type = 'button';
        altBtn.className = 'swc-alt swc-step';
        altBtn.textContent = '↻ Try another feed';
        altBtn.addEventListener('click', () => { chIdx = (chIdx + 1) % s.channels.length; loadEmbed(s); });
        root.appendChild(altBtn);
      }
    }

    function tune(i) {
      stopEmbed();
      cur = i; chIdx = 0;
      const s = STATIONS[i];
      freqEl.innerHTML = s.f + '<span class="swc-unit">kHz</span>';
      modeEl.textContent = s.mode;
      nameEl.textContent = s.code + ' · ' + s.name;
      needle.style.left = pos(s.f) + '%';
      STATIONS.forEach((x) => x._tick.classList.toggle('active', x === s));

      playerEl.innerHTML = '';
      if (s.channels && s.channels.length) {
        statusEl.textContent = 'live 24/7 restream · press play';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'swc-play';
        btn.textContent = '▶ Play';
        let playing = false;
        btn.addEventListener('click', () => {
          if (playing) { stopEmbed(); playing = false; btn.textContent = '▶ Play'; return; }
          loadEmbed(s); playing = true; btn.textContent = '■ Stop';
        });
        playerEl.appendChild(btn);
      } else {
        statusEl.textContent = 'opens a pre-tuned live receiver';
        const a = document.createElement('a');
        a.className = 'swc-open2';
        a.href = s.receiver;
        a.target = '_blank';
        a.rel = 'noopener';
        a.textContent = 'Open a live receiver ↗';
        playerEl.appendChild(a);
      }
    }

    const prev = document.getElementById('swc-prev');
    const next = document.getElementById('swc-next');
    if (prev) prev.addEventListener('click', () => tune((cur - 1 + STATIONS.length) % STATIONS.length));
    if (next) next.addEventListener('click', () => tune((cur + 1) % STATIONS.length));

    tune(cur);
    startFall();
  }

  // ambient band texture — decorative, not a live spectrum (honest: no RF here)
  function startFall() {
    const c = document.getElementById('swc-fall');
    if (!c || !c.getContext) return;
    const ctx = c.getContext('2d');
    const size = () => { c.width = c.clientWidth; c.height = c.clientHeight; };
    size();
    window.addEventListener('resize', size);
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

    function column() {
      const w = c.width, h = c.height;
      if (w < 2) return;
      const img = ctx.getImageData(1, 0, w - 1, h);
      ctx.putImageData(img, 0, 0);
      for (let y = 0; y < h; y++) {
        const v = Math.random();
        const a = v > 0.86 ? (v - 0.86) / 0.14 : 0.05 * v;
        ctx.fillStyle = 'rgba(127,214,162,' + a.toFixed(3) + ')';
        ctx.fillRect(w - 1, y, 1, 1);
      }
    }
    if (reduce) { ctx.fillStyle = '#05070c'; ctx.fillRect(0, 0, c.width, c.height); return; }
    let last = 0;
    (function loop(t) {
      if (t - last > 45) { column(); last = t; } // ~22fps, easy on the CPU
      requestAnimationFrame(loop);
    })(0);
  }

  document.addEventListener('DOMContentLoaded', () => { startLog(); wireListen(); initConsole(); });
})();
