// Galaxy Radio: one optional renderer, no audio ownership and no network assets.
// Extended directly from 10cef8f: original particles, seeds, formations and touch lifecycle.
// The two compositions share an instrument frame, not a fabricated audio signal.
import * as THREE from '/assets/vendor/broadcast-three-r185/three.module.min.js';
import { createTimeline } from '/echofield/vendor/animejs/anime.esm.min.js';
export function createBroadcastSky({getFrame, getCarMode, reduced}) {
    const canvas = document.getElementById('broadcast-stars');
    const anchor = document.getElementById('station-beacon');
    const field = document.getElementById('station-field');
    if (!canvas) return;
    let renderer;
    try {
        renderer = new THREE.WebGLRenderer({canvas, alpha:true, antialias:false, powerPreference:'low-power'});
    } catch { return; }
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
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
        opening:{value:1}, invocation:{value:1}, constellation:{value:0},
        cameraLocal:{value:new THREE.Vector3(0,0,8)},
        readoutBox:{value:new THREE.Vector4(-10000,-10000,0,0)},
        headerEdge:{value:10000},
        touchCeiling:{value:9},
        fieldAnchor:{value:new THREE.Vector3()},
        touches:{value:Array.from({length:6}, () => new THREE.Vector4(0,0,1,0))},
        touchFlow:{value:Array.from({length:6}, () => new THREE.Vector2())}
    };
    const textClearance=`
        uniform vec4 readoutBox;
        uniform float pixelRatio;
        uniform float headerEdge;
        float clearText(){
            vec2 q=abs(gl_FragCoord.xy/pixelRatio-readoutBox.xy)-readoutBox.zw;
            float distance=length(max(q,0.))+min(max(q.x,q.y),0.);
            float belowHeader=smoothstep(0.,24.,headerEdge-gl_FragCoord.y/pixelRatio);
            return smoothstep(0.,20.,distance)*belowHeader;
        }`;
    const vertex = `
        attribute float size;
        attribute float phase;
        attribute vec3 tint;
        uniform float pixelRatio;
        uniform float clock;
        uniform float treble;
        uniform float drift;
        uniform float touchGain;
        uniform float sizeGain;
        uniform float depthGain;
        uniform float opening;
        uniform float circulation;
        uniform float orbitShape;
        uniform float cameraDepth;
        uniform float touchCeiling;
        uniform float passage;
        uniform vec3 fieldAnchor;
        uniform vec4 touches[6];
        uniform vec2 touchFlow[6];
        varying vec3 vTint;
        varying float vLight;
        varying float vDepth;
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
            // Continuous travel in one direction: no reversing camera or repeating pose tween.
            float orbitAspect=mix(1.,.39,orbitShape);
            vec2 orbital=vec2(position.x,position.y/orbitAspect);
            float travel=clock*circulation/mix(.45+length(orbital)*.65,1.,orbitShape);
            vec2 transported=mat2(cos(travel),sin(travel),-sin(travel),cos(travel))*orbital;
            local.xy=transported*vec2(1.,orbitAspect);
            local.z+=(transported.y-orbital.y)*.2*orbitShape;
            local.xy += drift * vec2(noise(vec2(seed,clock*.58))-.5,
                noise(vec2(seed+48.3,clock*.47))-.5);
            // A gently advecting curl field connects individual drift into flowing dust lanes.
            vec2 q=local.xy*2.3+vec2(clock*.065,-clock*.043);
            vec2 curl=vec2(noise(q+vec2(0.,.12))-noise(q-vec2(0.,.12)),
                noise(q-vec2(.12,0.))-noise(q+vec2(.12,0.)));
            local.xy += curl*drift*.7;
            float arrival=1.-opening;
            float turn=arrival*(.4+phase*.07);
            local.xy=mat2(cos(turn),-sin(turn),sin(turn),cos(turn))*local.xy*(1.-arrival*.16);
            vLight *= smoothstep(phase*.045,phase*.045+.4,opening);
            local.z *= depthGain;
            vec4 view=modelViewMatrix*vec4(local,1.);
            if(passage>0.){
                // Travel through a volume around the receiver, with an unmoving observing angle.
                // Every mote has its own speed and depth; a new lane starts only while invisible.
                float journey=position.z+clock*(.018+phase*.0017);
                float cycle=floor(journey),along=fract(journey);
                float bearing=phase+hash(vec2(seed,cycle))*6.283185;
                float radius=(.2+hash(vec2(seed+17.,cycle))*.95)*fieldAnchor.z;
                float distance=cameraDepth*mix(1.85,.24,along);
                vec2 lane=vec2(cos(bearing),sin(bearing)*.8)*radius;
                lane+=vec2(noise(vec2(seed+21.,along*1.3))-.5,
                    noise(vec2(seed+57.,along*1.3))-.5)*fieldAnchor.z*.1;
                view=vec4(fieldAnchor.xy*distance/cameraDepth+lane,-distance,1.);
                vLight*=smoothstep(0.,.13,along)*(1.-smoothstep(.78,1.,along));
            }
            vDepth = -view.z / cameraDepth;
            // Atmospheric separation belongs to each particle, leaving the space between clear.
            float distanceFade = exp(-pow(max(0.,vDepth-1.)*2.8,2.));
            vLight *= distanceFade * mix(1.18,.72,smoothstep(.65,1.35,vDepth));
            vec2 push=vec2(0.);
            for (int i=0;i<6;i++) {
                if (touches[i].w>0.) {
                    float projectionScale=cameraDepth/max(1.,-view.z);
                    vec2 delta=view.xy*projectionScale-touches[i].xy;
                    float d=length(delta);
                    float reach=1.-smoothstep(0.,touches[i].z,d);
                    vec2 away=delta/max(d,2.);
                    push+=(away*8.+touchFlow[i]*4.)*reach*reach*touches[i].w;
                }
            }
            // All impulses share a displacement ceiling; repeated swipes cannot explode the disc.
            view.xy += push * min(1.,touchCeiling/max(length(push),.001)) * touchGain * max(1.,-view.z)/cameraDepth;
            gl_Position = projectionMatrix * view;
            gl_PointSize = size * sizeGain * pixelRatio * clamp(cameraDepth/max(1.,-view.z),.45,2.4) * (1. + treble * .2);
            gl_PointSize *= 1.+passage*(1.-smoothstep(.3,.75,vDepth))*.35;
        }
    `;
    const fragment = `
        ${textClearance}
        uniform float opacity;
        uniform float passage;
        varying vec3 vTint;
        varying float vLight;
        varying float vDepth;
        void main() {
            float d = length(gl_PointCoord - .5) * 2.;
            float edge = 1. - smoothstep(.65,1.,d);
            float defocus=passage*(1.-smoothstep(.3,.75,vDepth));
            float core = (exp(-d*d*mix(9.,3.8,defocus)) + .18*exp(-d*d*2.)) * edge * mix(1.,.55,defocus);
            gl_FragColor = vec4(vTint, core * opacity * vLight * clearText());
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
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
            uniforms:{...uniforms, opacity:{value:opacity}, drift:{value:drift}, touchGain:{value:1}, sizeGain:{value:1}, depthGain:{value:1}, circulation:{value:0}, orbitShape:{value:0}, passage:{value:0}}, vertexShader:vertex, fragmentShader:fragment,
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
    stars.material.uniforms.sizeGain.value = 1.65;
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
    orbitDust.material.uniforms.sizeGain.value = 2.6;
    orbitDust.material.uniforms.depthGain.value = 3.4;
    orbitDust.material.uniforms.circulation.value = .035;
    orbitDust.material.uniforms.orbitShape.value = 1;
    stellar.add(orbitDust);
    const rings = [];
    let crossingGlow;
    for (let i = 0; i < 2; i++) {
        const coords = [];
        for (let j = 0; j <= 160; j++) {
            const a = j / 160 * Math.PI * 2;
            coords.push(new THREE.Vector3(Math.cos(a) * (1.1 + i * .16), Math.sin(a) * (.46 + i * .08), 0));
        }
        const ring = new THREE.Line(new THREE.BufferGeometry().setFromPoints(coords),
            new THREE.ShaderMaterial({uniforms:{...uniforms,opacity:{value:i?.1:.2}},transparent:true,depthWrite:false,
                vertexShader:'void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
                fragmentShader:`${textClearance} uniform float opacity;void main(){gl_FragColor=vec4(.6,.78,.79,opacity*clearText());
                    #include <tonemapping_fragment>
                    #include <colorspace_fragment>
                }`}));
        ring.rotation.z = i ? .7 : -.32;
        stellar.add(ring);
        rings.push(ring);
        if(i===1){
            const path=new THREE.CatmullRomCurve3(coords.slice(0,-1),true);
            crossingGlow=new THREE.Mesh(new THREE.TubeGeometry(path,192,.008,6,true),
                new THREE.ShaderMaterial({uniforms:{...uniforms,opacity:{value:.075}},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
                    vertexShader:'void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
                    fragmentShader:`${textClearance} uniform float opacity;void main(){gl_FragColor=vec4(.57,.8,.79,opacity*clearText());
                        #include <tonemapping_fragment>
                        #include <colorspace_fragment>
                    }`}));
            crossingGlow.rotation.copy(ring.rotation);stellar.add(crossingGlow);
        }
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
    galacticDust.material.uniforms.sizeGain.value = 1.85;
    galacticDust.material.uniforms.depthGain.value = 3.1;
    galacticDust.material.uniforms.circulation.value = .012;
    galaxy.add(galacticDust);

    // Additional layers follow the original draws, preserving every original seeded particle.
    const orbitDepth = points(3200, locateOrbit, .25, .17);
    orbitDepth.rotation.copy(orbitDust.rotation);
    orbitDepth.scale.set(1.035,1.10,2.2);
    orbitDepth.material.uniforms.sizeGain.value = 1.65;
    orbitDepth.material.uniforms.circulation.value = .027;
    orbitDepth.material.uniforms.orbitShape.value = 1;
    stellar.add(orbitDepth);
    const galaxyDepth = points(8000, locateGalaxy, .24, .17);
    galaxyDepth.scale.set(1.09,1.09,3.1);
    galaxyDepth.material.uniforms.sizeGain.value = 1.35;
    galaxyDepth.material.uniforms.circulation.value = .01;
    galaxy.add(galaxyDepth);

    // A sparse volume around the original source gives the eye a foreground to travel through.
    // Generated last: none of the original formation's seeded attributes change.
    const foreground = points(260, () => {
        const a=random()*Math.PI*2, r=.8+random()*1.15;
        return {position:[Math.cos(a)*r,Math.sin(a)*r*.7,(random()-.35)*2.4],
            size:1.3+random()*2.1,color:[.63,.84+random()*.1,.88]};
    },.42,.12);
    foreground.material.uniforms.sizeGain.value=3.2;
    foreground.material.uniforms.circulation.value=.008;
    focus.add(foreground);

    // Astraea: an authored constellation emerging from the existing orbital geometry.
    // These are composition points, not a claimed historical star chart.
    const constellationVertices=[[-.96,.16,.2],[-.62,.42,-.1],[-.2,.32,.16],[.19,.48,-.15],[.6,.22,.27],[.89,-.07,.1],[.44,-.35,.26]];
    const constellationGeometry=new THREE.BufferGeometry().setFromPoints(constellationVertices.map(p=>new THREE.Vector3(...p)));
    const constellationLine=new THREE.Line(constellationGeometry,new THREE.ShaderMaterial({uniforms,transparent:true,depthWrite:false,
        vertexShader:'void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
        fragmentShader:`${textClearance} uniform float constellation;void main(){gl_FragColor=vec4(.65,.84,.74,constellation*.25*clearText());
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
        }`}));
    focus.add(constellationLine);
    const constellationStars=points(constellationVertices.length,i=>({position:constellationVertices[i],size:4.5,color:[.78,.94,.87]}),0,0);
    focus.add(constellationStars);

    // Sparse travelling dust provides the near/middle distance around the original formations.
    // Added after all existing seeded draws. Screen-space text clearance applies to this layer too.
    const passageDust=points(640,()=>({position:[random(),random(),random()],
        size:.65+random()*1.2,color:[.58+random()*.12,.8+random()*.13,.86]}),.4,0);
    passageDust.material.uniforms.passage.value=1;
    passageDust.material.uniforms.sizeGain.value=2.8;
    passageDust.material.uniforms.touchGain.value=.85;
    passageDust.frustumCulled=false;
    scene.add(passageDust);

    // Local procedural light, not a screen-wide gradient or a full-screen bloom pass.
    const lightMaterial = new THREE.ShaderMaterial({
        uniforms, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending,
        vertexShader:`varying vec2 uvLocal; varying vec3 surfacePoint; void main() { uvLocal=uv*2.-1.; surfacePoint=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
        fragmentShader:`
            ${textClearance}
            varying vec2 uvLocal;
            varying vec3 surfacePoint;
            uniform float galaxy, clock, energy, bass, light, invocation;
            uniform vec3 cameraLocal;
            float hash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
            float noise(vec2 p) {
                vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
                return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);
            }
            float fbm(vec2 p) {
                float result=0.,weight=.55;
                for(int i=0;i<3;i++){result+=noise(p)*weight;p=mat2(.8,-.6,.6,.8)*p*2.07+11.3;weight*=.48;}
                return result;
            }
            // Ray/box intersection restricts the 3D light integration to its actual volume.
            float invokedLight(vec3 origin,vec3 direction) {
                vec3 inverse=1./(direction+vec3(.00001));
                vec3 a=(vec3(-.2,-.025,-.22)-origin)*inverse;
                vec3 b=(vec3(.2,1.8,.22)-origin)*inverse;
                vec3 lo=min(a,b),hi=max(a,b);
                float near=max(max(lo.x,lo.y),lo.z),far=min(min(hi.x,hi.y),hi.z);
                if(far<=max(near,0.))return 0.;
                float stepSize=(far-max(near,0.))/16.;
                float glow=0.;
                for(int i=0;i<16;i++){
                    vec3 s=origin+direction*(max(near,0.)+(float(i)+.5)*stepSize);
                    float warp=(fbm(vec2(s.y*2.7+clock*.035,s.z*8.))-.45)*.03;
                    float radius=length(s.xz+vec2(warp,0.));
                    float density=exp(-radius*radius*3800.)+.055*exp(-radius*radius*180.);
                    float descending=smoothstep(1.8-invocation*1.84,1.9-invocation*1.84,s.y);
                    glow+=density*exp(-s.y*.75)*descending*stepSize*5.;
                }
                return glow;
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
                vec2 warp=vec2(fbm(q*2.+clock*.014),fbm(q*2.+vec2(17.,-clock*.011)))-.45;
                float grain=fbm(q*12.+warp*2.+vec2(clock*.018,0.));
                float cloud=exp(-radius*radius*3.) * (.065+.13*lanes) * grain;
                float core=exp(-radius*radius*900.)*.8+exp(-radius*radius*90.)*.55+exp(-radius*14.)*.2;
                // Keep the focal light steady; audio does not make the core breathe.
                // Each station invokes the descending light; the source itself stays steady.
                float beam=invokedLight(cameraLocal,normalize(surfacePoint-cameraLocal));
                // Astraeus / dusk: faint violet-to-sage filaments behind the icy orbital source.
                float dusk=exp(-radius*radius*2.8)*pow(grain,2.)*.18;
                float normal=center+flare+beam*2.6+dusk;
                float car=cloud+core+beam*1.8+dusk;
                vec3 color=mix(vec3(.45,.38,.65),vec3(.58,.87,.76),smoothstep(.15,.75,grain));
                color=mix(color,vec3(.8,.94,.9),clamp(center+core*galaxy+beam*2.,0.,1.));
                float alpha=mix(normal,car,galaxy)*light*(1.-smoothstep(.8,1.,r));
                gl_FragColor=vec4(color,alpha*clearText());
                #include <tonemapping_fragment>
                #include <colorspace_fragment>
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
    let dragEnergy = 0;
    const inverseFocus = new THREE.Matrix4();
    let openingTimeline, beamTimeline, openingPlayed=false, beamStarted=false, stationKey='';
    function invokeBeam(){
        beamTimeline?.cancel();beamStarted=true;
        canvas.dataset.transmission=String(Number(canvas.dataset.transmission||0)+1);
        if(reduced.matches){uniforms.invocation.value=1;canvas.dataset.beam='settled';dirty=true;return;}
        canvas.dataset.beam='descending';
        beamTimeline=createTimeline({onUpdate:()=>{dirty=true;},onComplete:()=>{canvas.dataset.beam='settled';}})
            .add(uniforms.invocation,{value:[0,1],duration:1800,ease:'out(3)'},0);
        if(document.hidden)beamTimeline.pause();
    }
    function stationChanged(){
        const next=field.dataset.station||'';
        if(!next||next===stationKey)return;
        stationKey=next;
        if(field.dataset.space==='none'){beamStarted=false;return;}
        invokeBeam();
    }
    function settleOpening() {
        openingTimeline?.cancel();
        beamTimeline?.cancel();canvas.dataset.beam='settled';
        uniforms.opening.value=uniforms.invocation.value=1;
        uniforms.constellation.value=.12;
        canvas.dataset.opening='settled';
    }
    function beginOpening() {
        if(openingPlayed || field.dataset.space!=='full')return;
        openingPlayed=true;
        if(reduced.matches){settleOpening();return;}
        uniforms.opening.value=0;
        if(!beamStarted)invokeBeam();
        openingTimeline=createTimeline({onComplete:()=>{canvas.dataset.opening='settled';}})
            .add(uniforms.opening,{value:[0,1],duration:3000,ease:'out(3)'},250)
            .add(uniforms.constellation,{value:[0,1],duration:1400,ease:'out(3)'},600)
            .add(uniforms.constellation,{value:.12,duration:1800,ease:'inOut(3)'},2600);
        canvas.dataset.opening='invoking';
    }
    const impulses = Array.from({length:6}, () => ({born:-Infinity, strength:0}));
    function clearTouch() {
        if (gesture && field.hasPointerCapture(gesture.id)) field.releasePointerCapture(gesture.id);
        gesture = null;
        dragEnergy=0;uniforms.touchCeiling.value=9;
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
            Math.min(105, Math.max(48, (bounds?.size || 70)*.65))*(1+dragEnergy*.3), 0);
        uniforms.touchFlow.value[i].set(dx/24, -dy/24).clampLength(0,1);
        impulses[i] = {born:now, strength:(getCarMode() ? .85 : 1)*(1+dragEnergy*1.8),decay:6-dragEnergy*2.7};
        dirty = true;
    }
    field.addEventListener('pointerdown', event => {
        if (reduced.matches || stopped || event.button !== 0 || !event.isPrimary
            || gesture || event.target.closest('.field-readout')) return;
        gesture = {id:event.pointerId, x:event.clientX, y:event.clientY,at:performance.now()};
        field.setPointerCapture(event.pointerId);
        addImpulse(event,0,0,true);
    });
    field.addEventListener('pointermove', event => {
        if (!gesture || event.pointerId !== gesture.id) return;
        const dx = event.clientX-gesture.x, dy = event.clientY-gesture.y;
        if (Math.hypot(dx,dy)<2) return;
        if (performance.now()-lastImpulse>=45) {
            const now=performance.now();
            dragEnergy=Math.min(1,dragEnergy+Math.min(now-gesture.at,150)/5000+Math.hypot(dx,dy)/420);
            addImpulse(event,dx,dy);
            gesture.x=event.clientX; gesture.y=event.clientY;gesture.at=now;
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
            const rate=impulse.decay||6;
            const response = Number.isFinite(age) ? impulse.strength*age*rate*Math.exp(1-age*rate) : 0;
            const strength = response>.001 ? response : 0;
            uniforms.touches.value[i].w = reduced.matches ? 0 : strength;
            if (strength>.001) active = true;
        });
        return active;
    }
    function layout() {
        const rect = anchor.getBoundingClientRect();
        bounds = {x:rect.x + rect.width / 2 - innerWidth / 2,
            y:innerHeight / 2 - rect.y - rect.height / 2, size:rect.width * (field.dataset.space === 'compact' ? .52 : .66)};
        if(getCarMode()&&field.dataset.space==='compact'){
            const room=field.getBoundingClientRect();
            bounds.x=room.x+room.width*.42-innerWidth/2;
            bounds.y=innerHeight/2-room.y-room.height/2;
            bounds.size=Math.min(room.width*.6,Math.max(rect.width*.52,room.height*.7));
        }
        const text=document.querySelector('.field-readout').getBoundingClientRect();
        uniforms.readoutBox.value.set(text.x+text.width/2,innerHeight-text.y-text.height/2,text.width/2+3,text.height/2+3);
        const header=document.querySelector('.broadcast-head');
        uniforms.headerEdge.value=header ? innerHeight-header.getBoundingClientRect().bottom : 10000;
        focus.position.set(bounds.x, bounds.y, 0);
        focus.scale.setScalar(bounds.size);
        uniforms.fieldAnchor.value.set(bounds.x,bounds.y,bounds.size);
        focus.visible = field.dataset.space !== 'none';
        passageDust.visible=focus.visible;
        passageDust.material.uniforms.opacity.value=field.dataset.space==='compact'?.2:.4;
        beginOpening();
        if(!beamStarted&&field.dataset.space!=='none')invokeBeam();
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
        stars.scale.set(innerWidth, innerHeight, camera.position.z*.055);
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
    const stationObserver=new MutationObserver(stationChanged);
    stationObserver.observe(field,{attributes:true,attributeFilter:['data-station']});
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
        // The observing angle stays fixed; only the independent crossing ring travels.
        rings[1].rotation.z=.7+phase*.008;
        crossingGlow.rotation.copy(rings[1].rotation);
        if(!gesture)dragEnergy*=Math.exp(-dt*1.4);
        uniforms.touchCeiling.value=9+dragEnergy*19;
        focus.updateMatrixWorld(true);
        uniforms.cameraLocal.value.copy(camera.position).applyMatrix4(inverseFocus.copy(focus.matrixWorld).invert());
        constellationGeometry.setDrawRange(0,Math.max(0,Math.ceil(uniforms.opening.value*constellationVertices.length)));
        constellationStars.material.uniforms.opacity.value=uniforms.constellation.value*.7;
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
        rings.forEach((ring, i) => { ring.material.uniforms.opacity.value = (i ? .42 : .24) * (1 - mix); });
        crossingGlow.material.uniforms.opacity.value=.075*(1-mix);
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
        if(event.persisted)return;cancelAnimationFrame(raf);openingTimeline?.cancel();beamTimeline?.cancel();layoutObserver.disconnect();modeObserver.disconnect();stationObserver.disconnect();
        const materials=new Set();
        for(const root of [scene,background])root.traverse(object=>{object.geometry?.dispose();if(object.material)materials.add(object.material);});
        materials.forEach(material=>material.dispose());renderer.dispose();
    });
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', () => {
        cancelAnimationFrame(raf);
        clearTouch();
        if(document.hidden){openingTimeline?.pause();beamTimeline?.pause();}
        else if(!reduced.matches){openingTimeline?.resume();beamTimeline?.resume();}
        if (!document.hidden && !stopped) { last = 0; dirty = true; raf = requestAnimationFrame(render); }
    });
    reduced.addEventListener('change', () => {clearTouch();if(reduced.matches)settleOpening();});
    stationKey=field.dataset.station||'';
    resize();
    raf = requestAnimationFrame(render);
}
