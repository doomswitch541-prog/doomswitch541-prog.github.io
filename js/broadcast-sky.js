// Galaxy Radio: one optional renderer, no audio ownership and no network assets.
// Extended directly from 10cef8f: original particles, seeds, formations and touch lifecycle.
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
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 4000);
    camera.position.z = 1000;
    const focus = new THREE.Group();
    scene.add(focus);
    let seed = 541;
    const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const uniforms = {
        clock:{value:0}, energy:{value:0}, treble:{value:0}, bass:{value:0},
        galaxy:{value:0}, pixelRatio:{value:1}, light:{value:0.7}, cameraDepth:{value:1000},
        touches:{value:Array.from({length:6}, () => new THREE.Vector4(0,0,1,0))},
        touchFlow:{value:Array.from({length:6}, () => new THREE.Vector2())}
    };
    const vertex = `
        attribute float size;
        attribute float phase;
        attribute vec3 tint;
        uniform float pixelRatio;
        uniform float clock;
        uniform float treble;
        uniform float drift;
        uniform float touchGain;
        uniform float cameraDepth;
        uniform vec4 touches[6];
        uniform vec2 touchFlow[6];
        varying vec3 vTint;
        varying float vLight;
        float hash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
        float noise(vec2 p) {
            vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
            return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);
        }
        void main() {
            vTint = tint;
            // Independent smooth noise: no common pulse, reset or repeating timeline.
            float seed=phase*91.7;
            vLight = .73 + .27 * noise(vec2(seed, clock * .38));
            vec3 local=position;
            local.xy += drift * vec2(noise(vec2(seed,clock*.58))-.5,
                noise(vec2(seed+48.3,clock*.47))-.5);
            vec4 view=modelViewMatrix*vec4(local,1.);
            vec2 push=vec2(0.);
            for (int i=0;i<6;i++) {
                if (touches[i].w>0.) {
                    float projectionScale=cameraDepth/max(1.,-view.z);
                    vec2 delta=view.xy*projectionScale-touches[i].xy;
                    float d=length(delta);
                    float reach=1.-smoothstep(0.,touches[i].z,d);
                    vec2 away=delta/max(d,2.);
                    push+=(away*14.+touchFlow[i]*7.)*reach*reach*touches[i].w;
                }
            }
            // All impulses share a displacement ceiling; repeated swipes cannot explode the disc.
            view.xy += push * min(1.,24./max(length(push),.001)) * touchGain * max(1.,-view.z)/cameraDepth;
            gl_Position = projectionMatrix * view;
            gl_PointSize = size * pixelRatio * clamp(cameraDepth/max(1.,-view.z),.6,1.6) * (1. + treble * .2);
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
    function points(count, locate, opacity, drift = .11) {
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
            uniforms:{...uniforms, opacity:{value:opacity}, drift:{value:drift}, touchGain:{value:1}}, vertexShader:vertex, fragmentShader:fragment,
            transparent:true, depthWrite:false, blending:THREE.AdditiveBlending
        });
        return new THREE.Points(geometry, material);
    }
    const stars = points(440, () => ({
        position:[(random() - .5) * 2, (random() - .5) * 2, -5 - random() * 5],
        size:random() < .035 ? 3.4 : .8 + random() * 1.5,
        color:[.64 + random() * .18, .77 + random() * .15, .84 + random() * .15]
    }), .48, .008);
    stars.material.uniforms.touchGain.value = .3;
    background.add(stars);

    // Normal listening: a suspended radio source and sharply drawn orbital dust.
    const stellar = new THREE.Group();
    focus.add(stellar);
    const locateOrbit = () => {
        const a = random() * Math.PI * 2;
        const r = .68 + random() * .35;
        const jitter = (random() - .5) * .06;
        return {position:[Math.cos(a) * r, Math.sin(a) * r * .39 + jitter, Math.sin(a) * .2],
            size:.7 + random() * 1.5, color:[.54, .76 + random() * .2, .83]};
    };
    const orbitDust = points(1600, locateOrbit, .55);
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
    const locateGalaxy = i => {
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
    };
    const galacticDust = points(14000, locateGalaxy, .55);
    galaxy.add(galacticDust);

    // Additional layers follow the original draws, preserving every original seeded particle.
    const orbitDepth = points(3200, locateOrbit, .25, .17);
    orbitDepth.rotation.copy(orbitDust.rotation);
    orbitDepth.scale.set(1.035,1.10,2.2);
    stellar.add(orbitDepth);
    const galaxyDepth = points(8000, locateGalaxy, .24, .17);
    galaxyDepth.scale.set(1.025,1.025,2.5);
    galaxy.add(galaxyDepth);

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
                // Keep the focal light steady; audio does not make the core breathe.
                // A narrow descending transmission accumulates depth around the existing source.
                float beam=0.;
                for(int i=0;i<12;i++) {
                    float z=(float(i)+.5)/12.-.5;
                    float offset=(noise(vec2(p.y*5.+z,clock*.035))-.5)*.004;
                    beam+=exp(-pow(p.x+offset,2.)*95000.-z*z*28.)/12.;
                }
                beam*=smoothstep(-.015,.04,p.y)*(.035+.025*noise(vec2(p.y*7.,clock*.025)));
                float normal=center+flare+beam;
                float car=cloud+core+beam*.65;
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
    let gesture = null;
    let impulseIndex = 0;
    let lastImpulse = -Infinity;
    let touchWasActive = false;
    const impulses = Array.from({length:6}, () => ({born:-Infinity, strength:0}));
    function clearTouch() {
        if (gesture && field.hasPointerCapture(gesture.id)) field.releasePointerCapture(gesture.id);
        gesture = null;
        impulses.forEach((impulse, i) => {
            impulse.strength = 0; uniforms.touches.value[i].w = 0;
        });
        dirty = true;
    }
    function addImpulse(event, dx = 0, dy = 0, force = false) {
        const now = performance.now();
        if (!force && now - lastImpulse < 45) return;
        lastImpulse = now;
        const i = impulseIndex++ % impulses.length;
        // Coordinates are camera-plane CSS pixels, so touch reach is consistent at every DPR.
        uniforms.touches.value[i].set(event.clientX-innerWidth/2, innerHeight/2-event.clientY,
            Math.min(72, Math.max(40, (bounds?.size || 70)*.55)), 0);
        uniforms.touchFlow.value[i].set(dx/24, -dy/24).clampLength(0,1);
        impulses[i] = {born:now, strength:getCarMode() ? .65 : 1};
        dirty = true;
    }
    field.addEventListener('pointerdown', event => {
        if (reduced.matches || stopped || event.button !== 0 || !event.isPrimary
            || gesture || event.target.closest('.field-readout')) return;
        gesture = {id:event.pointerId, x:event.clientX, y:event.clientY};
        field.setPointerCapture(event.pointerId);
        addImpulse(event,0,0,true);
    });
    field.addEventListener('pointermove', event => {
        if (!gesture || event.pointerId !== gesture.id) return;
        const dx = event.clientX-gesture.x, dy = event.clientY-gesture.y;
        if (Math.hypot(dx,dy)<2) return;
        if (performance.now()-lastImpulse>=45) {
            addImpulse(event,dx,dy);
            gesture.x=event.clientX; gesture.y=event.clientY;
        }
    });
    const releaseGesture = event => {
        if (event.pointerId !== gesture?.id) return;
        gesture = null;
        if (field.hasPointerCapture(event.pointerId)) field.releasePointerCapture(event.pointerId);
    };
    field.addEventListener('pointerup', releaseGesture);
    field.addEventListener('pointercancel', releaseGesture);
    field.addEventListener('lostpointercapture', releaseGesture);
    function advanceTouches(now) {
        let active = false;
        impulses.forEach((impulse,i) => {
            const age = Math.max(0,(now-impulse.born)/1000);
            // Critically damped impulse response t*exp(-w*t): one yield, then rest, no bounce.
            const response = age<1.8 ? impulse.strength*age*6*Math.exp(1-age*6) : 0;
            const strength = response>.001 ? response : 0;
            uniforms.touches.value[i].w = reduced.matches ? 0 : strength;
            if (strength>.001) active = true;
        });
        return active;
    }
    function layout() {
        const rect = anchor.getBoundingClientRect();
        bounds = {x:rect.x + rect.width / 2 - innerWidth / 2,
            y:innerHeight / 2 - rect.y - rect.height / 2, size:rect.width * (field.dataset.space === 'compact' ? .52 : .61)};
        focus.position.set(bounds.x, bounds.y, 0);
        focus.scale.setScalar(bounds.size);
        focus.visible = field.dataset.space !== 'none';
        dirty = true;
    }
    function resize() {
        clearTouch();
        const ratio = Math.min(devicePixelRatio || 1, 1.5);
        renderer.setPixelRatio(ratio);
        renderer.setSize(innerWidth, innerHeight, false);
        uniforms.pixelRatio.value = ratio;
        camera.aspect=innerWidth/innerHeight;
        camera.position.z=innerHeight/(2*Math.tan(38*Math.PI/360));
        uniforms.cameraDepth.value=camera.position.z;
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
        if (time - last < 16 && !dirty) return;
        const dt = Math.min(time - last, 100) / 1000;
        last = time;
        const frame = getFrame();
        const target = getCarMode() ? 1 : 0;
        const changing = Math.abs(mix - target) > .001;
        mix = reduced.matches || !changing ? target : mix + (target - mix) * Math.min(1, dt * 5);
        const playing = frame.state === 'playing';
        const moving = !reduced.matches;
        const flow = ({idle:.65,loading:.85,playing:1,paused:.35,error:.2})[frame.state] ?? .65;
        if (moving) phase += dt*flow;
        const live = playing && !reduced.matches && frame.mode === 'audio-analysis';
        uniforms.clock.value = phase;
        uniforms.galaxy.value = mix;
        uniforms.energy.value += ((live ? frame.level || 0 : 0) - uniforms.energy.value) * .15;
        uniforms.bass.value += ((live ? frame.bass || 0 : 0) - uniforms.bass.value) * .15;
        uniforms.treble.value += ((live ? frame.treble || 0 : 0) - uniforms.treble.value) * .15;
        const targetLight=({idle:.7,loading:.8,playing:.95,paused:.65,error:.45})[frame.state] ?? .7;
        uniforms.light.value += (targetLight-uniforms.light.value)*(reduced.matches?1:Math.min(1,dt*4));
        // Spectral energy only nudges local travel, never camera motion or core glow.
        orbitDust.material.uniforms.drift.value = .19 + uniforms.energy.value*.025;
        galacticDust.material.uniforms.drift.value = .17 + uniforms.bass.value*.02;
        orbitDust.material.uniforms.opacity.value = .6 * (1 - mix);
        orbitDepth.material.uniforms.opacity.value = .25 * (1 - mix);
        galaxyDepth.material.uniforms.opacity.value = .24 * mix;
        rings.forEach((ring, i) => { ring.material.opacity = (i ? .1 : .2) * (1 - mix); });
        galacticDust.material.uniforms.opacity.value = .55 * mix;
        stellar.visible = mix < .999;
        galaxy.visible = mix > .001;
        const touching = advanceTouches(time);
        const settled = touchWasActive && !touching;
        touchWasActive = touching;
        canvas.dataset.touch=touching?'active':'settled';
        const stateChanged = frame.state !== previousState;
        previousState = frame.state;
        if (moving || touching || settled || changing || dirty || stateChanged) {
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
        clearTouch();
        canvas.hidden = true; delete document.body.dataset.sky;
    });
    canvas.addEventListener('webglcontextrestored', () => {
        stopped=false;canvas.hidden=false;last=0;dirty=true;resize();raf=requestAnimationFrame(render);
    });
    window.addEventListener('pagehide', event => {
        if(event.persisted)return;cancelAnimationFrame(raf);layoutObserver.disconnect();modeObserver.disconnect();
        const materials=new Set();
        for(const root of [scene,background])root.traverse(object=>{object.geometry?.dispose();if(object.material)materials.add(object.material);});
        materials.forEach(material=>material.dispose());renderer.dispose();
    });
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', () => {
        cancelAnimationFrame(raf);
        clearTouch();
        if (!document.hidden && !stopped) { last = 0; dirty = true; raf = requestAnimationFrame(render); }
    });
    reduced.addEventListener('change', clearTouch);
    resize();
    raf = requestAnimationFrame(render);
}
