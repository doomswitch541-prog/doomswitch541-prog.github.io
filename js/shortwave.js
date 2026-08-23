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
  function wireListen() {
    document.querySelectorAll('.sw-listen').forEach((box) => {
      const btn = box.querySelector('.sw-listen-btn');
      const id = box.getAttribute('data-yt');
      if (!btn || !id) return;
      btn.addEventListener('click', () => {
        if (box.querySelector('.sw-listen-frame')) return; // already loaded
        const frame = document.createElement('div');
        frame.className = 'sw-listen-frame';
        const iframe = document.createElement('iframe');
        iframe.src = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(id) +
          '?autoplay=1&rel=0';
        iframe.allow = 'autoplay; encrypted-media; picture-in-picture';
        iframe.setAttribute('allowfullscreen', '');
        iframe.title = 'Live shortwave restream';
        frame.appendChild(iframe);
        box.appendChild(frame);
        btn.setAttribute('aria-expanded', 'true');
        btn.textContent = '■ Stop';
        btn.addEventListener('click', function stop() {
          frame.remove();
          btn.setAttribute('aria-expanded', 'false');
          btn.textContent = '▶ Listen here — 24/7 restream';
          btn.removeEventListener('click', stop);
        }, { once: true });
      });
    });
  }

  document.addEventListener('DOMContentLoaded', () => { startLog(); wireListen(); });
})();
