/* pyreflies.js — a resonant, pointer/touch-reactive light-field.
 *
 * Drifting "pyreflies" (dotted light-trails) rise over a dark sky; moving a pointer or
 * dragging a finger spawns a brighter burst that trails your path and fades. Touch-first
 * (built for mobile), no visible cursor of its own (the host page hides that), ambient even
 * at rest, reduced-motion safe. Vanilla, no deps, no build step.
 *
 * Drop a transparent <canvas data-pyreflies> inside a positioned container, load this script.
 * The canvas paints only the flies (it clears each frame), so it overlays ANY background.
 *   data-colors   comma-separated hex list   (default cyan / violet / gold / pink)
 *   data-stars    "1" to add a faint twinkling starfield   (default off)
 *   data-max      particle cap               (default auto by width)
 *   data-ambient  ambient flies per second   (default 7)
 */
(function () {
  'use strict';
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var rnd = function (a, b) { return a + Math.random() * (b - a); };
  var pick = function (a) { return a[(Math.random() * a.length) | 0]; };

  function setup(canvas) {
    var ctx = canvas.getContext('2d');
    if (!canvas.style.width) canvas.style.width = '100%';
    if (!canvas.style.height) canvas.style.height = '100%';
    var d = canvas.dataset;
    var palette = (d.colors || '#8fe9ff,#b79bff,#ffd98a,#ff9bd0').split(',').map(function (s) { return s.trim(); });
    var wantStars = d.stars === '1';
    var ambientRate = parseFloat(d.ambient || '7');

    var W = 0, H = 0, dpr = Math.min(window.devicePixelRatio || 1, 2), mobile = false, cap = 140;
    var flies = [], stars = [];
    var ptr = { x: 0, y: 0, px: 0, py: 0, has: false };

    function resize() {
      var b = canvas.getBoundingClientRect();
      W = b.width; H = b.height;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      mobile = W < 560;
      cap = parseInt(d.max || '0', 10) || (mobile ? 70 : 150);
      // static starfield (its twinkle is cheap per-frame alpha, positions fixed)
      stars = [];
      if (wantStars) {
        var n = Math.round((W * H) / (mobile ? 9000 : 7000));
        for (var i = 0; i < n; i++) stars.push({ x: Math.random() * W, y: Math.random() * H, r: rnd(0.3, 1.1), ph: rnd(0, 6.283), sp: rnd(0.4, 1.3) });
      }
    }

    // a pyrefly: a glowing head with a short dotted trail, rising + wobbling, fading over life
    function makeFly(x, y, vx, vy, strong) {
      if (flies.length >= cap) flies.shift();
      flies.push({
        x: x, y: y, vx: vx, vy: vy,
        life: 0, max: rnd(1.8, 3.8),
        col: pick(palette),
        r: strong ? rnd(1.6, 2.9) : rnd(0.7, 1.7),
        wob: rnd(0, 6.283), wobs: rnd(0.5, 1.4), wamp: rnd(6, 20),
        trail: [],
      });
    }

    function hexA(hex, a) {
      var h = hex.replace('#', '');
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      var n = parseInt(h, 16);
      return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
    }

    var last = 0;
    function frame(ts) {
      var dt = last ? Math.min((ts - last) / 1000, 0.05) : 0.016;
      last = ts;
      ctx.clearRect(0, 0, W, H);

      // starfield twinkle
      if (wantStars) {
        for (var s = 0; s < stars.length; s++) {
          var st = stars[s];
          var tw = 0.35 + 0.35 * Math.sin(ts / 1000 * st.sp + st.ph);
          ctx.globalAlpha = tw; ctx.fillStyle = '#cfe3ff';
          ctx.beginPath(); ctx.arc(st.x, st.y, st.r, 0, 6.283); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }

      // ambient spawns — a few flies drifting up from the lower field
      var want = ambientRate * dt;
      while (Math.random() < want) { makeFly(rnd(0, W), rnd(H * 0.55, H * 1.02), rnd(-8, 8), rnd(-26, -12), false); want -= 1; }

      ctx.globalCompositeOperation = 'lighter';
      for (var i = flies.length - 1; i >= 0; i--) {
        var f = flies[i];
        f.life += dt;
        if (f.life >= f.max || f.y < -20) { flies.splice(i, 1); continue; }
        // motion: rise with buoyancy + horizontal wobble + drag
        f.wob += f.wobs * dt;
        f.vy += -6 * dt;            // buoyancy
        f.vx *= (1 - 0.6 * dt); f.vy *= (1 - 0.3 * dt);
        f.x += (f.vx + Math.sin(f.wob) * f.wamp) * dt;
        f.y += f.vy * dt;
        f.trail.push(f.x); f.trail.push(f.y);
        if (f.trail.length > 20) { f.trail.splice(0, 2); }     // ~10 points
        // fade: quick in, slow out
        var p = f.life / f.max;
        var a = Math.min(1, f.life / 0.25) * (1 - p) * (1 - p);
        // dotted trail, tapering + dimming toward the tail
        var pts = f.trail.length / 2;
        for (var k = 0; k < pts; k++) {
          var tf = k / Math.max(1, pts - 1);          // 0 tail → 1 head
          var tx = f.trail[k * 2], ty = f.trail[k * 2 + 1];
          var rr = f.r * (0.3 + 0.7 * tf);
          ctx.globalAlpha = a * tf * tf;
          ctx.shadowColor = f.col; ctx.shadowBlur = (mobile ? 5 : 9) * tf;
          ctx.fillStyle = f.col;
          ctx.beginPath(); ctx.arc(tx, ty, rr, 0, 6.283); ctx.fill();
        }
        // bright head
        ctx.globalAlpha = a;
        ctx.shadowBlur = mobile ? 8 : 14;
        ctx.fillStyle = hexA('#ffffff', 0.9);
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r * 0.6, 0, 6.283); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1; ctx.shadowBlur = 0;
      requestAnimationFrame(frame);
    }

    function drawStatic() {           // reduced motion: a calm held field, no animation
      ctx.clearRect(0, 0, W, H);
      if (wantStars) { ctx.fillStyle = '#cfe3ff'; for (var s = 0; s < stars.length; s++) { ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.arc(stars[s].x, stars[s].y, stars[s].r, 0, 6.283); ctx.fill(); } }
      ctx.globalCompositeOperation = 'lighter';
      for (var i = 0; i < (mobile ? 24 : 48); i++) {
        ctx.globalAlpha = rnd(0.2, 0.6); var c = pick(palette); ctx.fillStyle = c; ctx.shadowColor = c; ctx.shadowBlur = 8;
        ctx.beginPath(); ctx.arc(rnd(0, W), rnd(0, H), rnd(0.8, 2), 0, 6.283); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    }

    // pointer / touch: spawn a brighter burst trailing the path (canvas stays pointer-transparent
    // so the host UI still works; we read positions from window events)
    function emit(cx, cy) {
      var b = canvas.getBoundingClientRect();
      ptr.px = ptr.has ? ptr.x : cx - b.left; ptr.py = ptr.has ? ptr.y : cy - b.top;
      ptr.x = cx - b.left; ptr.y = cy - b.top; ptr.has = true;
      var dx = ptr.x - ptr.px, dy = ptr.y - ptr.py;
      var dist = Math.hypot(dx, dy);
      if (dist < 2) return;
      var n = Math.min(4, 1 + (dist / 24) | 0);
      for (var i = 0; i < n; i++) {
        var t = i / n;
        makeFly(ptr.px + dx * t, ptr.py + dy * t, dx * rnd(1, 2.4) + rnd(-10, 10), dy * rnd(0.6, 1.4) + rnd(-26, -8), true);
      }
    }
    function onPointer(e) { emit(e.clientX, e.clientY); }
    function onTouch(e) { for (var i = 0; i < e.touches.length; i++) emit(e.touches[i].clientX, e.touches[i].clientY); }

    resize();
    if (window.ResizeObserver) new ResizeObserver(function () { resize(); if (reduce) drawStatic(); }).observe(canvas);
    else window.addEventListener('resize', function () { resize(); if (reduce) drawStatic(); });

    if (reduce) { drawStatic(); return; }
    window.addEventListener('pointermove', onPointer, { passive: true });
    window.addEventListener('touchstart', onTouch, { passive: true });
    window.addEventListener('touchmove', onTouch, { passive: true });
    requestAnimationFrame(frame);
  }

  function init() {
    var nodes = document.querySelectorAll('canvas[data-pyreflies]');
    for (var i = 0; i < nodes.length; i++) setup(nodes[i]);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
