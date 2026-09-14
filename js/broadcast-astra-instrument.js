// Optional third dock motif. No audio graph, controls, storage or independent animation loop.
import * as THREE from '/assets/vendor/broadcast-three-r185/three.module.min.js';
import { createTimeline } from '/echofield/vendor/animejs/anime.esm.min.js';

export function createAstraInstrument() {
    const canvas=document.createElement('canvas');
    let renderer;
    try { renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:false,powerPreference:'low-power'}); }
    catch { return null; }
    renderer.setClearColor(0,0);
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;
    const scene=new THREE.Scene();
    const camera=new THREE.PerspectiveCamera(32,3,.1,20);
    camera.position.z=4.5;
    const clock={value:0},density={value:1};
    const reception={value:1},strength={value:0},receptionSeed={value:0};
    const descent={value:1},arrow={value:0};
    const positions=[],phases=[];
    let seed=541;
    const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
    for(let i=0;i<360;i++){
        positions.push(random(),random(),random());phases.push(random()*Math.PI*2);
    }
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geometry.setAttribute('phase',new THREE.Float32BufferAttribute(phases,1));
    const material=new THREE.ShaderMaterial({
        uniforms:{clock,density,reception,strength,receptionSeed},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
        vertexShader:`
            attribute float phase;
            uniform float clock,density;
            uniform float reception,strength,receptionSeed;
            varying float glow,depth;
            void main(){
                // A continuous stream arrives along one axis; particles wrap only while invisible.
                float travel=fract(position.x+clock*.022);
                float x=(travel-.5)*7.;
                float radius=(.16+position.y*.65)*(.5+.5*exp(-x*x*.24));
                float turn=phase+x*1.7-clock*.12;
                vec3 point=vec3(x,cos(turn)*radius,sin(turn)*radius);
                vec4 view=modelViewMatrix*vec4(point,1.);
                depth=clamp((point.z+.5),0.,1.);
                glow=smoothstep(0.,.1,travel)*(1.-smoothstep(.9,1.,travel))*(.35+position.z*.6);
                // The signal is received by the existing grains, without moving their paths.
                float grain=fract(sin(phase*91.7+receptionSeed)*43758.5453);
                float arrival=abs(x)*.055+grain*.15;
                float caught=smoothstep(arrival,arrival+.045,reception)
                    *(1.-smoothstep(arrival+.10,arrival+.38+grain*.16,reception));
                float received=caught*strength*(.65+grain*.8);
                glow*=1.+received*5.5;
                gl_Position=projectionMatrix*view;
                gl_PointSize=(.55+position.z*1.2)*density*4.5/-view.z;
                gl_PointSize*=1.+received*.22;
            }`,
        fragmentShader:`
            varying float glow,depth;
            void main(){
                float r=length(gl_PointCoord-.5)*2.;
                float alpha=exp(-r*r*5.)*(1.-smoothstep(.7,1.,r))*glow;
                gl_FragColor=vec4(mix(vec3(.34,.46,.65),vec3(.68,.94,.8),depth),alpha);
                #include <tonemapping_fragment>
                #include <colorspace_fragment>
            }`
    });
    const dust=new THREE.Points(geometry,material);
    // Positions are generated in the shader outside the seed geometry's bounds.
    dust.frustumCulled=false;
    scene.add(dust);
    const sourceMaterial=new THREE.ShaderMaterial({
        uniforms:{descent,arrow},
        transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
        vertexShader:`varying vec2 p;void main(){p=uv*2.-1.;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
        fragmentShader:`
        varying vec2 p;uniform float descent,arrow;
        float segment(vec2 p,vec2 a,vec2 b){
            vec2 ab=b-a;return length(p-a-ab*clamp(dot(p-a,ab)/dot(ab,ab),0.,1.));
        }
        void main(){
            // Keep the original horizontal source at its original world-space size.
            vec2 q=p*vec2(1.,1.625);
            float shaft=exp(-q.y*q.y*1800.)*exp(-abs(q.x)*2.2)*.32;
            float source=exp(-dot(q,q)*1800.);
            float tip=(1.-descent)*.96;
            float stroke=max(.004,fwidth(p.x)*.55);
            float descending=exp(-pow(p.x/stroke,2.))*smoothstep(tip-.015,tip+.02,p.y)
                *(1.-smoothstep(tip+.28,tip+.7,p.y));
            float edge=min(segment(p,vec2(-.05,tip+.14),vec2(0.,tip)),
                segment(p,vec2(.05,tip+.14),vec2(0.,tip)));
            float head=exp(-pow(edge/stroke,2.));
            gl_FragColor=vec4(.72,.93,.85,shaft+source+(descending+head)*arrow*1.6);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
        }`
    });
    const source=new THREE.Mesh(new THREE.PlaneGeometry(7,2.6),sourceMaterial);
    scene.add(source);
    const star=new THREE.Mesh(new THREE.SphereGeometry(.085,12,8),new THREE.MeshBasicMaterial({color:0xdcffe9}));
    scene.add(star);
    let lost=false,disposed=false,lastWidth=0,lastHeight=0;
    let timeline,age=0,lastDrawAt=0,lastArrivalAt=-Infinity,seenTransmission='',introduced=false,wasVisible=false;
    function settleReception(){
        timeline?.cancel();timeline=null;
        descent.value=reception.value=1;arrow.value=strength.value=0;
    }
    function receive(amount,now){
        settleReception();introduced=true;lastArrivalAt=now;age=0;
        strength.value=amount;receptionSeed.value=Math.random()*1000;
        // Seek from the receiver's existing draw loop: no second animation clock.
        timeline=createTimeline({autoplay:false})
            .add(descent,{value:[0,1],duration:900,ease:'in(1.6)'},0)
            .add(arrow,{value:[0,amount],duration:180,ease:'out(2)'},0)
            .add(arrow,{value:0,duration:380,ease:'out(2)'},900)
            .add(reception,{value:[0,1],duration:3600,ease:'linear'},900);
        timeline.seek(0);
    }
    function suspend(){settleReception();lastDrawAt=0;wasVisible=false;}
    const onVisibility=()=>{if(document.hidden)suspend();};
    document.addEventListener('visibilitychange',onVisibility);
    canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();lost=true;suspend();});
    canvas.addEventListener('webglcontextrestored',()=>{lost=false;lastWidth=lastHeight=0;});
    const dispose=()=>{
        if(disposed)return;disposed=true;
        settleReception();
        document.removeEventListener('visibilitychange',onVisibility);
        geometry.dispose();material.dispose();source.geometry.dispose();sourceMaterial.dispose();
        star.geometry.dispose();star.material.dispose();renderer.dispose();
    };
    window.addEventListener('pagehide',event=>{if(!event.persisted)dispose();});
    return {
        suspend,
        draw(context,width,height,time,pixelRatio,{now,playing,weight,transmission,beamStrength}={}){
            if(lost||disposed)return false;
            const gap=lastDrawAt?now-lastDrawAt:0;
            // Chapters, hidden tabs and live analysis never queue an old arrival for later.
            const fresh=String(transmission||'')!==seenTransmission;
            seenTransmission=String(transmission||'');lastDrawAt=now;
            if(playing&&weight>.85&&(!introduced||(fresh&&wasVisible&&now-lastArrivalAt>=18000))){
                receive(introduced?Math.max(.35,Math.min(1,Number(beamStrength)||.65)):.95,now);
            }
            wasVisible=true;
            if(timeline&&playing){
                age+=Math.min(100,Math.max(0,gap));
                timeline.seek(Math.min(age,timeline.duration));
                if(age>=timeline.duration)settleReception();
            }
            if(width!==lastWidth||height!==lastHeight){
                renderer.setSize(width,height,false);camera.aspect=width/height;
                camera.updateProjectionMatrix();lastWidth=width;lastHeight=height;
            }
            clock.value=time;density.value=pixelRatio;
            renderer.render(scene,camera);
            context.drawImage(canvas,0,0,width,height);
            return true;
        }
    };
}
