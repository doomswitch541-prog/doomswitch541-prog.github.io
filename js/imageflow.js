/* imageflow.js — manipulate the background image itself (not particles on top).
 *
 * A small WebGL layer that reads whatever background the switcher is showing and renders a
 * deformed version: a gentle FLOW warp across the upper image, and a rippling, darkened
 * WATER REFLECTION in the lower band — the void-water reel's move, on our own photos. Reads
 * the active .bg-layer's image, cover-fits it, cross-fades when the switcher changes, and
 * ripples toward a pointer / finger. Reduced-motion → one still deformed frame.
 *
 * Fails SAFE: if WebGL is unavailable or anything throws, it removes itself and the plain
 * .bg-layer photos show exactly as before. Injected by site.js on background pages.
 */
(function () {
  'use strict';
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  var VERT = 'attribute vec2 p;varying vec2 uv;void main(){uv=p*0.5+0.5;gl_Position=vec4(p,0.,1.);}';
  var FRAG = [
    'precision highp float;',
    'varying vec2 uv;',
    'uniform sampler2D t0,t1;',
    'uniform vec2 c0,c1;',           // cover-fit scale per texture
    'uniform float mix0;',           // 0..1 crossfade t0->t1
    'uniform float time;',
    'uniform float horizon;',        // reflection line (display space)
    'uniform float flowAmp;',
    'uniform vec3 touch;',           // xy in display uv, z = strength
    'vec2 cover(vec2 u,vec2 c){return (u-0.5)*c+0.5;}',
    'vec4 samp(vec2 u){',
    '  vec4 a=texture2D(t0,cover(u,c0));',
    '  vec4 b=texture2D(t1,cover(u,c1));',
    '  return mix(a,b,mix0);',
    '}',
    'void main(){',
    '  vec2 d=uv;',
    // gentle flow across the whole image (kept subtle so crisp art doesn\'t melt)
    '  vec2 flow=flowAmp*vec2(sin(uv.y*9.0+time*0.5)+0.5*sin(uv.x*6.0-time*0.4),',
    '                         cos(uv.x*8.0+time*0.45)+0.5*cos(uv.y*5.0+time*0.37));',
    // pointer ripple — a ring expanding from the touch point
    '  float td=distance(uv,touch.xy);',
    '  float ring=sin(td*42.0-time*3.2)*exp(-td*7.0)*touch.z*0.02;',
    '  vec4 col;',
    '  if(uv.y<horizon){',           // --- upper: flowed image ---
    '    col=samp(d+flow+ring);',
    '  } else {',                    // --- lower: rippling water reflection ---
    '    float depth=(uv.y-horizon)/max(0.001,1.0-horizon);',   // 0 at waterline .. 1 bottom
    '    float ry=horizon-(uv.y-horizon);',                     // mirror across the horizon
    '    float rip=sin(uv.y*70.0-time*2.1)*0.006*depth + sin(uv.x*26.0+time*1.4)*0.004*depth;',
    '    vec2 ruv=vec2(uv.x+rip+ring, ry+rip*0.4);',
    '    col=samp(ruv);',
    '    col.rgb*=mix(0.9,0.42,depth);',                         // darken with depth
    '    col.rgb=mix(col.rgb, col.rgb*vec3(0.8,0.88,1.05), 0.35*depth);', // cool water tint
    '  }',
    // a whisper of a waterline glow
    '  col.rgb+=vec3(0.5,0.6,0.9)*0.10*exp(-abs(uv.y-horizon)*60.0);',
    '  gl_FragColor=vec4(col.rgb,1.0);',
    '}',
  ].join('\n');

  function compile(gl, type, src) {
    var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }

  function setup(canvas) {
    var gl = canvas.getContext('webgl', { antialias: false, alpha: false, premultipliedAlpha: false })
          || canvas.getContext('experimental-webgl');
    if (!gl) throw new Error('no webgl');

    var prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);

    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    var pl = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(pl); gl.vertexAttribPointer(pl, 2, gl.FLOAT, false, 0, 0);

    var U = {}; ['t0', 't1', 'c0', 'c1', 'mix0', 'time', 'horizon', 'flowAmp', 'touch'].forEach(function (n) { U[n] = gl.getUniformLocation(prog, n); });

    var texA = gl.createTexture(), texB = gl.createTexture();
    [texA, texB].forEach(function (t) {
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([8, 9, 14, 255]));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    });
    var cover = { a: [1, 1], b: [1, 1] };
    var curTex = texA, nextTex = texB, curCover = 'a', nextCover = 'b';
    var mix = 0, curUrl = '', loading = false;
    var W = 0, H = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);

    function resize() {
      var b = canvas.getBoundingClientRect(); W = b.width; H = b.height;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
      recover('a'); recover('b');
    }
    function coverScale(iw, ih) {
      var cA = W / H, iA = iw / ih;
      return cA > iA ? [1, iA / cA] : [cA / iA, 1];
    }
    var lastImg = { a: null, b: null };
    function recover(slot) { var im = lastImg[slot]; if (im) cover[slot] = coverScale(im.width, im.height); }

    function activeUrl() {
      var el = document.querySelector('.bg-layer.active') || document.querySelector('.bg-layer');
      if (!el) return '';
      var bg = getComputedStyle(el).backgroundImage || '';
      var m = bg.match(/url\((['"]?)(.*?)\1\)/);
      return m ? m[2] : '';
    }
    function loadInto(tex, slot, url, cb) {
      var img = new Image(); img.crossOrigin = 'anonymous';
      img.onload = function () {
        try {
          gl.bindTexture(gl.TEXTURE_2D, tex);
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
          lastImg[slot] = img; cover[slot] = coverScale(img.width, img.height); cb && cb();
        } catch (e) { /* tainted/failed — leave the 1px fallback */ }
      };
      img.src = url;
    }
    function checkSwitch() {
      var url = activeUrl();
      if (!url || url === curUrl || loading) return;
      loading = true;
      loadInto(nextTex, nextCover, url, function () {
        curUrl = url; mix = 0;           // fade from current to next
        var step = function () {
          mix += 0.03;
          if (mix >= 1) {
            // promote next -> current
            var tt = curTex; curTex = nextTex; nextTex = tt;
            var cc = curCover; curCover = nextCover; nextCover = cc;
            mix = 0; loading = false; return;
          }
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });
    }

    var touch = [0.5, 0.5, 0];
    function onPointer(e) { var b = canvas.getBoundingClientRect(); touch = [(e.clientX - b.left) / W, (e.clientY - b.top) / H, 1]; }
    function onTouch(e) { if (!e.touches.length) return; var b = canvas.getBoundingClientRect(); touch = [(e.touches[0].clientX - b.left) / W, (e.touches[0].clientY - b.top) / H, 1]; }

    var t0 = null;
    function render(ts) {
      if (t0 == null) t0 = ts; var time = (ts - t0) / 1000;
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, curTex); gl.uniform1i(U.t0, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, nextTex); gl.uniform1i(U.t1, 1);
      gl.uniform2fv(U.c0, cover[curCover]); gl.uniform2fv(U.c1, cover[nextCover]);
      gl.uniform1f(U.mix0, mix);
      gl.uniform1f(U.time, time);
      gl.uniform1f(U.horizon, 0.66);
      gl.uniform1f(U.flowAmp, reduce ? 0.004 : 0.006);
      gl.uniform3fv(U.touch, touch);
      touch[2] *= 0.94;                  // ripple settles
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (!reduce) requestAnimationFrame(render);
    }

    resize();
    if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas);
    else window.addEventListener('resize', resize);

    // first image, then watch for switcher changes
    (function first() {
      var url = activeUrl();
      if (!url) { setTimeout(first, 120); return; }
      loadInto(curTex, curCover, url, function () {
        curUrl = url;
        requestAnimationFrame(render);
        if (reduce) requestAnimationFrame(render);
      });
    })();
    setInterval(checkSwitch, 1000);
    if (!reduce) {
      window.addEventListener('pointermove', onPointer, { passive: true });
      window.addEventListener('touchstart', onTouch, { passive: true });
      window.addEventListener('touchmove', onTouch, { passive: true });
    }
  }

  function init() {
    var canvas = document.querySelector('canvas[data-imageflow]');
    if (!canvas) return;
    try { setup(canvas); }
    catch (e) { if (canvas.parentNode) canvas.parentNode.removeChild(canvas); }   // fail safe → plain bg
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
