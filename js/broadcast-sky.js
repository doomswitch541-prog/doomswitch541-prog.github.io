// Galaxy Radio: one optional renderer, no audio ownership and no network assets.
// The two compositions share an instrument frame, not a fabricated audio signal.
export function createBroadcastSky({getFrame, getCarMode, reduced}) {
    const THREE = window.THREE;
    const canvas = document.getElementById('broadcast-stars');
    const anchor = document.getElementById('station-beacon');
    const field = document.getElementById('station-field');
    if (!THREE || !canvas) return;
    let renderer;
    try {
        renderer = new THREE.WebGLRenderer({canvas, alpha:true, antialias:false, powerPreference:'low-power'});
    } catch { return; }
    renderer.setClearColor(0x000000, 0);
    renderer.autoClear = false;
    const background = new THREE.Scene();
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 2000);
    camera.position.z = 1000;
    const focus = new THREE.Group();
    scene.add(focus);
    let seed = 541;
    const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const uniforms = {
        clock:{value:0}, energy:{value:0}, treble:{value:0}, bass:{value:0},
        galaxy:{value:0}, pixelRatio:{value:1}, light:{value:0.7}
    };
    const vertex = `
        attribute float size;
        attribute float phase;
        attribute vec3 tint;
        uniform float pixelRatio;
        uniform float clock;
        uniform float treble;
        varying vec3 vTint;
        varying float vLight;
        void main() {
            vTint = tint;
            vLight = .78 + .22 * sin(phase + clock * .3);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
            gl_PointSize = size * pixelRatio * (1. + treble * .2);
        }
    `;
    const fragment = `
        uniform float opacity;
        varying vec3 vTint;
        varying float vLight;
        void main() {
            float d = length(gl_PointCoord - .5) * 2.;
            float core = exp(-d * d * 5.) * (1. - smoothstep(.65, 1., d));
            gl_FragColor = vec4(vTint, core * opacity * vLight);
        }
    `;
    function points(count, locate, opacity) {
        const positions = [], sizes = [], phases = [], colors = [];
        for (let i = 0; i < count; i++) {
            const p = locate(i);
            positions.push(...p.position);
            sizes.push(p.size);
            phases.push(random() * Math.PI * 2);
            colors.push(...p.color);
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1));
        geometry.setAttribute('phase', new THREE.Float32BufferAttribute(phases, 1));
        geometry.setAttribute('tint', new THREE.Float32BufferAttribute(colors, 3));
        const material = new THREE.ShaderMaterial({
            uniforms:{...uniforms, opacity:{value:opacity}}, vertexShader:vertex, fragmentShader:fragment,
            transparent:true, depthWrite:false, blending:THREE.AdditiveBlending
        });
        return new THREE.Points(geometry, material);
    }
    const stars = points(440, () => ({
        position:[(random() - .5) * 2, (random() - .5) * 2, -5 - random() * 5],
        size:random() < .035 ? 3.4 : .8 + random() * 1.5,
        color:[.64 + random() * .18, .77 + random() * .15, .84 + random() * .15]
    }), .48);
    background.add(stars);

    // Normal listening: a suspended radio source and sharply drawn orbital dust.
    const stellar = new THREE.Group();
    focus.add(stellar);
    const orbitDust = points(1600, () => {
        const a = random() * Math.PI * 2;
        const r = .68 + random() * .35;
        const jitter = (random() - .5) * .06;
        return {position:[Math.cos(a) * r, Math.sin(a) * r * .39 + jitter, Math.sin(a) * .2],
            size:.7 + random() * 1.5, color:[.54, .76 + random() * .2, .83]};
    }, .55);
    orbitDust.rotation.z = -.32;
    stellar.add(orbitDust);
    const rings = [];
    for (let i = 0; i < 2; i++) {
        const coords = [];
        for (let j = 0; j <= 160; j++) {
            const a = j / 160 * Math.PI * 2;
            coords.push(new THREE.Vector3(Math.cos(a) * (1.1 + i * .16), Math.sin(a) * (.46 + i * .08), 0));
        }
        const ring = new THREE.Line(new THREE.BufferGeometry().setFromPoints(coords),
            new THREE.LineBasicMaterial({color:0xb8d9de, transparent:true, opacity:i ? .1 : .2, depthWrite:false}));
        ring.rotation.z = i ? .7 : -.32;
        stellar.add(ring);
        rings.push(ring);
    }

    // Car listening: a broad spiral with real depth and uneven lanes of stardust.
    const galaxy = new THREE.Group();
    galaxy.rotation.set(.92, -.12, -.28);
    focus.add(galaxy);
    const galacticDust = points(14000, i => {
        const r = Math.pow(random(), .65) * 1.55;
        const arm = i % 3 * Math.PI * 2 / 3;
        const betweenArms = random() < .3;
        const angle = betweenArms ? random() * Math.PI * 2
            : arm + r * 3.8 + (random() - .5) * (.8 + r * .5);
        const spread = (random() - .5) * .18 * r;
        const central = Math.exp(-r * 3);
        return {position:[Math.cos(angle) * r + spread, Math.sin(angle) * r + spread, (random() - .5) * (.035 + central * .24)],
            size:betweenArms ? .7 + random() * 1.1 : .8 + random() * 1.65 + central,
            color:[.53 + central * .4, .7 + central * .23, .8 + central * .14]};
    }, .55);
    galaxy.add(galacticDust);

    // Local procedural light, not a screen-wide gradient or a full-screen bloom pass.
    const lightMaterial = new THREE.ShaderMaterial({
        uniforms, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending,
        vertexShader:`varying vec2 uvLocal; void main() { uvLocal=uv*2.-1.; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
        fragmentShader:`
            varying vec2 uvLocal;
            uniform float galaxy, clock, energy, bass, light;
            float hash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
            float noise(vec2 p) {
                vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
                return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);
            }
            void main() {
                vec2 p=uvLocal;
                float r=length(p);
                float center=exp(-r*r*620.) + .22*exp(-r*24.);
                float flare=exp(-abs(p.y)*180.)*exp(-abs(p.x)*7.)*.38
                    + exp(-abs(p.x)*230.)*exp(-abs(p.y)*14.)*.18;
                vec2 q=mat2(.96,-.28,.28,.96)*p;
                q.y*=2.2;
                float radius=length(q);
                float angle=atan(q.y,q.x);
                float lanes=.5+.5*sin(angle*3.-radius*20.);
                float grain=noise(q*12.+clock*.012)*.6+noise(q*29.)*.4;
                float cloud=exp(-radius*radius*3.) * (.065+.13*lanes) * grain;
                float core=exp(-radius*radius*900.)*.8+exp(-radius*radius*90.)*.55+exp(-radius*14.)*.2;
                float normal=(center+flare)*(1.+energy*.2);
                float car=cloud+core*(1.+bass*.14);
                vec3 color=mix(vec3(.65,.86,.9),vec3(.9,.93,.87),exp(-r*25.));
                float alpha=mix(normal,car,galaxy)*light*(1.-smoothstep(.8,1.,r));
                gl_FragColor=vec4(color,alpha);
            }
        `
    });
    focus.add(new THREE.Mesh(new THREE.PlaneGeometry(3.6, 3.6), lightMaterial));

    let raf = 0, last = 0, phase = 0, stopped = false, dirty = true;
    let mix = getCarMode() ? 1 : 0;
    let previousState = '';
    let bounds = null;
    function layout() {
        const rect = anchor.getBoundingClientRect();
        bounds = {x:rect.x + rect.width / 2 - innerWidth / 2,
            y:innerHeight / 2 - rect.y - rect.height / 2, size:rect.width * .47};
        focus.position.set(bounds.x, bounds.y, 0);
        focus.scale.setScalar(bounds.size);
        focus.visible = field.dataset.space !== 'none';
        dirty = true;
    }
    function resize() {
        const ratio = Math.min(devicePixelRatio || 1, 1.5);
        renderer.setPixelRatio(ratio);
        renderer.setSize(innerWidth, innerHeight, false);
        uniforms.pixelRatio.value = ratio;
        camera.left = -innerWidth / 2; camera.right = innerWidth / 2;
        camera.top = innerHeight / 2; camera.bottom = -innerHeight / 2;
        camera.updateProjectionMatrix();
        stars.scale.set(innerWidth * .65, innerHeight * .65, 1);
        layout();
    }
    // Bounds change with dock height, title wrapping and compact/full composition.
    const layoutObserver = new ResizeObserver(layout);
    layoutObserver.observe(field);
    layoutObserver.observe(anchor);
    layoutObserver.observe(document.querySelector('.field-readout'));
    const modeObserver = new MutationObserver(layout);
    modeObserver.observe(field, {attributes:true, attributeFilter:['data-space']});
    modeObserver.observe(document.body, {attributes:true, attributeFilter:['class']});
    function render(time) {
        if (stopped || document.hidden) return;
        raf = requestAnimationFrame(render);
        if (time - last < 42) return;
        const dt = Math.min(time - last, 100) / 1000;
        last = time;
        const frame = getFrame();
        const target = getCarMode() ? 1 : 0;
        const changing = Math.abs(mix - target) > .001;
        mix = reduced.matches || !changing ? target : mix + (target - mix) * Math.min(1, dt * 5);
        const playing = frame.state === 'playing';
        const moving = playing && !reduced.matches;
        if (moving) phase += dt;
        const live = moving && frame.mode === 'audio-analysis';
        uniforms.clock.value = phase;
        uniforms.galaxy.value = mix;
        uniforms.energy.value += ((live ? frame.level || 0 : 0) - uniforms.energy.value) * .15;
        uniforms.bass.value += ((live ? frame.bass || 0 : 0) - uniforms.bass.value) * .15;
        uniforms.treble.value += ((live ? frame.treble || 0 : 0) - uniforms.treble.value) * .15;
        uniforms.light.value = playing ? .95 : .7;
        orbitDust.material.uniforms.opacity.value = .6 * (1 - mix);
        rings.forEach((ring, i) => { ring.material.opacity = (i ? .1 : .2) * (1 - mix); });
        galacticDust.material.uniforms.opacity.value = .55 * mix;
        stellar.visible = mix < .999;
        galaxy.visible = mix > .001;
        // Slow bounded inclination; never rotate the whole sky or accelerate at a beat.
        galaxy.rotation.y = -.12 + Math.sin(phase * .022) * .035;
        orbitDust.rotation.y = Math.sin(phase * .035) * .06;
        const stateChanged = frame.state !== previousState;
        previousState = frame.state;
        if (moving || changing || dirty || stateChanged) {
            renderer.clear();
            renderer.render(background, camera);
            renderer.clearDepth();
            renderer.render(scene, camera);
            dirty = false;
            document.body.dataset.sky = 'ready';
            canvas.dataset.scene = target ? 'galaxy' : 'stellar';
        }
    }
    canvas.addEventListener('webglcontextlost', event => {
        event.preventDefault(); stopped = true; cancelAnimationFrame(raf);
        canvas.hidden = true; delete document.body.dataset.sky;
    });
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', () => {
        cancelAnimationFrame(raf);
        if (!document.hidden && !stopped) { last = 0; dirty = true; raf = requestAnimationFrame(render); }
    });
    reduced.addEventListener('change', () => { dirty = true; });
    resize();
    raf = requestAnimationFrame(render);
}
