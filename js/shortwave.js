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

  document.addEventListener('DOMContentLoaded', () => { startLog(); wireListen(); });
})();
