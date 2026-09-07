// Astra transmission. Optional, procedural renderer; the receiver owns all audio and UI.
export function createBroadcastSky({getFrame, getCarMode, reduced}) {
    const T = window.THREE, canvas = document.getElementById('broadcast-stars');
    const field = document.getElementById('station-field');
    const readout = document.querySelector('.field-readout');
    const dock = document.getElementById('now-playing');
    if (!T || !canvas || !field) return;
    let renderer;
    try { renderer = new T.WebGLRenderer({canvas, alpha:true, antialias:false, powerPreference:'high-performance'}); }
    catch { return; }
    renderer.autoClear = false;
    renderer.setClearColor(0x000000, 0);
    // Linear scene targets; ACES and sRGB are applied once in the final composite.
    renderer.toneMapping = T.NoToneMapping;
    renderer.outputEncoding = T.LinearEncoding;
    const quadCamera = new T.Camera(), quadScene = new T.Scene();
    const plane = new T.PlaneGeometry(2,2), quad = new T.Mesh(plane);
    quad.frustumCulled = false; quadScene.add(quad);
    const screenVertex = 'varying vec2 vUv; void main(){vUv=position.xy*.5+.5;gl_Position=vec4(position.xy,0.,1.);}';
    const noise = `
        float hash(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
        float noise3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
            return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
            mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
        float fbm(vec3 p){return .57*noise3(p)+.28*noise3(p*2.03+9.1)+.15*noise3(p*4.07+3.7);}
        vec3 potential(vec3 p){return vec3(noise3(p),noise3(p+vec3(31,17,8)),noise3(p+vec3(7,43,21)));}
        vec3 curl(vec3 p){float e=.13;vec3 dx=potential(p+vec3(e,0,0))-potential(p-vec3(e,0,0));
            vec3 dy=potential(p+vec3(0,e,0))-potential(p-vec3(0,e,0));
            vec3 dz=potential(p+vec3(0,0,e))-potential(p-vec3(0,0,e));
            return vec3(dy.z-dz.y,dz.x-dx.z,dx.y-dy.x)/(2.*e);}
    `;
    function material(fragment, uniforms={}) { return new T.ShaderMaterial({vertexShader:screenVertex,fragmentShader:fragment,uniforms,depthTest:false,depthWrite:false}); }
    function target(w,h,type=T.UnsignedByteType) { return new T.WebGLRenderTarget(w,h,{type,minFilter:type===T.UnsignedByteType?T.LinearFilter:T.NearestFilter,magFilter:type===T.UnsignedByteType?T.LinearFilter:T.NearestFilter,depthBuffer:false,stencilBuffer:false}); }
    function draw(mat,out,clear=true) {quad.material=mat;renderer.setRenderTarget(out);if(clear)renderer.clear();renderer.render(quadScene,quadCamera);}
    let floatType = null;
    // Capability is established by framebuffer completeness, not a browser-name guess.
    for (const type of [T.FloatType,T.HalfFloatType]) {
        const probe=target(2,2,type);probe.texture.minFilter=probe.texture.magFilter=T.NearestFilter;
        renderer.setRenderTarget(probe);
        const gl=renderer.getContext();
        const complete=gl.checkFramebufferStatus(gl.FRAMEBUFFER)===gl.FRAMEBUFFER_COMPLETE;
        renderer.setRenderTarget(null);probe.dispose();
        if(complete){floatType=type;break;}
    }
    const hdrType=floatType||T.UnsignedByteType;
    const sceneTarget=target(1,1,hdrType), beamTarget=target(1,1,hdrType);
    const glowA=target(1,1,hdrType),glowB=target(1,1,hdrType);
    const u={clock:{value:0},car:{value:getCarMode()?1:0},strength:{value:.65},flow:{value:.3},
        aspect:{value:1},focus:{value:new T.Vector2(0,0)},scale:{value:1},
        touches:{value:Array.from({length:6},()=>new T.Vector4(0,0,0,0))},
        touchFlow:{value:Array.from({length:6},()=>new T.Vector2())},
        readRect:{value:new T.Vector4()},dockY:{value:0},pixelRatio:{value:1},
        viewport:{value:new T.Vector2(1,1)},samples:{value:32}};
    const volume=material(`precision highp float; varying vec2 vUv;
        uniform float clock,car,strength,aspect,scale,dockY;uniform int samples;
        uniform vec2 focus,viewport;uniform vec4 readRect;
        ${noise}
        void main(){
            vec2 screen=vUv*2.-1.;vec2 p=(screen-focus)*vec2(aspect,1.)/scale;
            vec3 sum=vec3(0.);float alpha=0.;
            // A bounded ray integral through a real density field. Perspective rays diverge with depth.
            for(int i=0;i<32;i++){if(i>=samples)break;float z=-1.8+3.6*(float(i)+.5)/float(samples);
                vec3 q=vec3(p*(1.+z*.12),z);q.y+=.06;
                float warp=fbm(q*1.7+vec3(0.,clock*.028,0.));
                float shaftX=q.x+.023*sin(q.y*2.1)+.018*(warp-.5);
                float down=smoothstep(-.28,.1,q.y);
                float shaft=exp(-shaftX*shaftX*7200.)*exp(-q.z*q.z*7.)*down;
                float sheath=exp(-shaftX*shaftX*105.)*exp(-q.z*q.z*3.)*down;
                float tip=exp(-dot(q*vec3(1.,1.7,1.),q*vec3(1.,1.7,1.))*95.);
                float spike=exp(-abs(q.y)*260.-abs(q.x)*8.-q.z*q.z*25.);
                vec3 n=q*1.6+vec3(warp*1.4,clock*.018,0.);
                float fil=pow(fbm(n*2.4),3.);
                float arc=abs(q.x-(.46*sin(q.y*2.8+warp*1.6)+.38));
                float arc2=abs(q.x-(-.52*sin(q.y*1.9+1.+warp)-.43));
                float lane=(exp(-arc*arc*140.)+exp(-arc2*arc2*180.)*.65)*fil*exp(-q.z*q.z*1.8);
                vec2 disc=vec2(q.x,(q.y+.26*q.x)*2.9);
                float radius=length(disc),angle=atan(disc.y,disc.x);
                float arms=pow(.5+.5*sin(angle*3.-radius*6.+warp),3.);
                float galaxy=exp(-radius*radius*.55)*(.12+arms)*fil*exp(-q.z*q.z*2.);
                float dust=mix(lane,galaxy,car)*.75;
                float density=(shaft*1.6+sheath*.035+tip*2.6+spike*.85)*mix(1.,.75,car);
                float stepSize=3.6/float(samples);
                sum+=(1.-alpha)*(vec3(.70,.86,.80)*dust+vec3(.77,.94,.95)*density)*stepSize;
                alpha+= (1.-alpha)*min(.12,(dust+density*.035)*stepSize);
            }
            vec2 px=vec2(vUv.x*viewport.x,(1.-vUv.y)*viewport.y);
            vec2 outside=max(max(readRect.xy-px,px-readRect.zw),vec2(0.));
            float textMask=mix(.08,1.,smoothstep(0.,48.,length(outside)));
            float dockMask=smoothstep(dockY-12.,dockY+75.,px.y);
            sum*=strength*textMask*(1.-dockMask*.94);
            gl_FragColor=vec4(sum,1.);
        }`,u);
    const blur=material(`varying vec2 vUv;uniform sampler2D source;uniform vec2 direction;uniform float threshold;
        void main(){vec3 c=vec3(0.);for(int i=-4;i<=4;i++){float x=float(i);vec3 s=texture2D(source,vUv+direction*x).rgb;
            s*=smoothstep(threshold,threshold+.25,max(s.r,max(s.g,s.b)));c+=s*exp(-x*x/7.);}
            gl_FragColor=vec4(c/4.5408,1.);}`,{source:{value:null},direction:{value:new T.Vector2()},threshold:{value:.55}});
    const composite=material(`varying vec2 vUv;uniform sampler2D sceneTex,beamTex,glowTex;
        vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
        void main(){vec3 c=aces(vec3(.0024,.0027,.0027)+texture2D(sceneTex,vUv).rgb+texture2D(beamTex,vUv).rgb+texture2D(glowTex,vUv).rgb*.5);
            c=mix(c*12.92,1.055*pow(c,vec3(1./2.4))-.055,step(vec3(.0031308),c));gl_FragColor=vec4(c,1.);}`,
        {sceneTex:{value:sceneTarget.texture},beamTex:{value:beamTarget.texture},glowTex:{value:glowB.texture}});
    const scene=new T.Scene(),camera=new T.PerspectiveCamera(48,1,.1,100);
    camera.position.z=7;
    let seed=541;
    const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
    const count=65536,initial=new Float32Array(count*4),indices=new Float32Array(count*2),sizes=new Float32Array(count);
    const positions=new Float32Array(count*3);
    for(let i=0;i<count;i++){

        // Interleave layers so reducing draw count preserves the complete composition.
        const layer=i%200;
        let x,y,z;
        if(layer<140){
            y=(random()-.5)*9;const branch=i%3;
            x=Math.sin(y*.9+branch*2.1)*(.65+branch*.45)+(random()-.5)*(.09+random()*.4);
            z=Math.cos(y*.7+branch*2.1)*1.2+(random()-.5)*.4;
        } else {x=(random()-.5)*20;y=(random()-.5)*22;z=layer===199?1.8+random()*2.1:-3-random()*10;}
        initial.set([x,y,z,random()],i*4);positions.set([x,y,z],i*3);
        indices.set([(i%256+.5)/256,(Math.floor(i/256)+.5)/256],i*2);
        sizes[i]=layer===199?1.5+random()*1.7:.32+random()*.8;
    }
    const home=new T.DataTexture(initial,256,256,T.RGBAFormat,T.FloatType);home.needsUpdate=true;
    home.minFilter=home.magFilter=T.NearestFilter;
    let simA=null,simB=null,simReady=false;
    const simUniforms={source:{value:home},home:{value:home},clock:u.clock,dt:{value:0},reset:{value:1}};
    const sim=material(`varying vec2 vUv;uniform sampler2D source,home;uniform float clock,dt,reset;${noise}
        void main(){vec4 h=texture2D(home,vUv),p=texture2D(source,vUv);if(reset>.5){gl_FragColor=h;return;}
            vec3 velocity=curl(p.xyz*.46+vec3(0,clock*.045,h.w*4.))*.075+(h.xyz-p.xyz)*.14;
            p.xyz+=velocity*dt;gl_FragColor=p;}`,simUniforms);
    function resetSimulation(size=256){
        simA?.dispose();simB?.dispose();simA=simB=null;simReady=false;
        if(!floatType||!renderer.capabilities.vertexTextures)return;
        simA=target(size,size,floatType);simB=target(size,size,floatType);
        simA.texture.minFilter=simA.texture.magFilter=simB.texture.minFilter=simB.texture.magFilter=T.NearestFilter;
        simUniforms.reset.value=1;draw(sim,simA);draw(sim,simB);simUniforms.reset.value=0;simReady=true;
    }
    resetSimulation();
    const geo=new T.BufferGeometry();geo.setAttribute('position',new T.BufferAttribute(positions,3));
    geo.setAttribute('lookup',new T.BufferAttribute(indices,2));geo.setAttribute('size',new T.BufferAttribute(sizes,1));
    const particleUniforms={...u,positions:{value:simA?.texture||null},simulated:{value:simReady?1:0}};
    const particles=new T.ShaderMaterial({uniforms:particleUniforms,transparent:true,depthTest:false,depthWrite:false,blending:T.AdditiveBlending,
        vertexShader:`attribute vec2 lookup;attribute float size;uniform sampler2D positions;uniform float simulated,clock,car,scale,pixelRatio;
            uniform vec2 focus,viewport;uniform vec4 touches[6];uniform vec2 touchFlow[6];
            varying float light;varying float depth;${noise}
            void main(){vec3 p=position;if(simulated>.5)p=texture2D(positions,lookup).xyz;
                else p+=vec3(noise3(p*.5+clock*.025),noise3(p*.5+17.+clock*.031),0.)*.25;
                p.y=mix(p.y,p.y*.65-p.x*.23,car);p*=scale;
                vec4 v=modelViewMatrix*vec4(p,1.);vec4 clip=projectionMatrix*v;
                vec2 screen=clip.xy/clip.w+focus;
                vec2 px=vec2((screen.x*.5+.5)*viewport.x,(.5-screen.y*.5)*viewport.y);
                vec2 push=vec2(0.);
                for(int i=0;i<6;i++){vec2 d=px-touches[i].xy;float reach=1.-smoothstep(0.,80.,length(d));
                    push+=(d/max(length(d),2.)*18.+touchFlow[i]*9.)*reach*reach*touches[i].w;}
                push*=min(1.,24./max(length(push),.001))*mix(1.,.6,car)*clamp(5./max(2.,-v.z),.15,1.);
                screen+=vec2(push.x,-push.y)*2./viewport;
                gl_Position=vec4(screen*clip.w,clip.z,clip.w);
                depth=clamp((-v.z-2.)/15.,0.,1.);
                light=(.65+.35*noise3(position*2.+vec3(clock*.13)))*exp(-depth*2.1);
                gl_PointSize=clamp(size*pixelRatio*7./max(2.,-v.z),.6,4.2*pixelRatio);
            }`,
        fragmentShader:`uniform vec2 viewport;uniform vec4 readRect;uniform float dockY,pixelRatio;varying float light,depth;
            void main(){float d=length(gl_PointCoord-.5)*2.;float a=exp(-d*d*4.)*(1.-smoothstep(.6,1.,d));
                vec2 px=vec2(gl_FragCoord.x/pixelRatio,viewport.y-gl_FragCoord.y/pixelRatio);
                vec2 outside=max(max(readRect.xy-px,px-readRect.zw),vec2(0.));
                float mask=mix(.025,1.,smoothstep(0.,38.,length(outside)));
                mask*=1.-smoothstep(dockY-8.,dockY+25.,px.y);
                mask*=smoothstep(48.,85.,px.y);
                gl_FragColor=vec4(mix(vec3(.40,.64,.50),vec3(.65,.86,.88),depth)*light,a*.20*mask);
            }`});
    const cloud=new T.Points(geo,particles);cloud.frustumCulled=false;scene.add(cloud);
    let raf=0,last=0,clock=0,mode=u.car.value,stopped=false,tier=0,badFor=0,warmUntil=performance.now()+5000;
    let gesture=null,impulseIndex=0,lastImpulse=0,dirty=true,previousState='';
    const impulses=Array.from({length:6},()=>({born:-Infinity,strength:0}));
    const tiers=[{ratio:1.5,volume:.5,samples:32,count:65536,sim:256},{ratio:1.25,volume:.35,samples:24,count:65536,sim:256},{ratio:1,volume:.3,samples:16,count:32768,sim:128}];
    function layout(){
        const rect=field.getBoundingClientRect(),text=readout.getBoundingClientRect();
        const top=Math.max(65,rect.top),bottom=Math.max(top+80,Math.min(dock.getBoundingClientRect().top,text.top||innerHeight));
        const center=top+(bottom-top)*.45;
        u.focus.value.set(0,1-center/innerHeight*2);
        // The world occupies the viewport, independently of the former 100/220px beacon.
        u.scale.value=Math.max(.65,Math.min(1.35,innerWidth/430));
        u.readRect.value.set(text.left-12,text.top-10,text.right+12,text.bottom+10);
        u.dockY.value=dock.getBoundingClientRect().top;
        warmUntil=performance.now()+2000;dirty=true;
    }
    function resize(){
        const q=tiers[tier],ratio=Math.min(devicePixelRatio||1,q.ratio);
        renderer.setPixelRatio(ratio);renderer.setSize(innerWidth,innerHeight,false);
        u.pixelRatio.value=ratio;u.viewport.value.set(innerWidth,innerHeight);u.aspect.value=innerWidth/innerHeight;
        camera.aspect=u.aspect.value;camera.updateProjectionMatrix();
        sceneTarget.setSize(Math.round(innerWidth*ratio),Math.round(innerHeight*ratio));
        beamTarget.setSize(Math.max(1,Math.round(innerWidth*ratio*q.volume)),Math.max(1,Math.round(innerHeight*ratio*q.volume)));
        glowA.setSize(Math.max(1,Math.round(innerWidth*ratio*.5)),Math.max(1,Math.round(innerHeight*ratio*.5)));
        glowB.setSize(glowA.width,glowA.height);u.samples.value=q.samples;geo.setDrawRange(0,q.count);
        clearTouches();layout();
    }
    function clearTouches(){if(gesture&&field.hasPointerCapture(gesture))field.releasePointerCapture(gesture);gesture=null;
        impulses.forEach((x,i)=>{x.strength=0;u.touches.value[i].w=0;});dirty=true;}
    function addTouch(e,dx=0,dy=0){const now=performance.now();if(now-lastImpulse<35)return;lastImpulse=now;
        const i=impulseIndex++%6;u.touches.value[i].set(e.clientX,e.clientY,80,0);
        u.touchFlow.value[i].set(dx/20,dy/20).clampLength(0,1);impulses[i]={born:now,strength:1};dirty=true;}
    let pointerX=0,pointerY=0;
    field.addEventListener('pointerdown',e=>{if(reduced.matches||stopped||!e.isPrimary||e.button!==0||e.target.closest('.field-readout'))return;
        gesture=e.pointerId;pointerX=e.clientX;pointerY=e.clientY;field.setPointerCapture(gesture);lastImpulse=0;addTouch(e);});
    field.addEventListener('pointermove',e=>{if(gesture!==e.pointerId)return;addTouch(e,e.clientX-pointerX,e.clientY-pointerY);pointerX=e.clientX;pointerY=e.clientY;});
    const release=e=>{if(gesture!==e.pointerId)return;if(field.hasPointerCapture(gesture))field.releasePointerCapture(gesture);gesture=null;};
    field.addEventListener('pointerup',release);field.addEventListener('pointercancel',release);field.addEventListener('lostpointercapture',release);
    const observer=new ResizeObserver(layout);observer.observe(field);observer.observe(readout);observer.observe(dock);
    const mutation=new MutationObserver(layout);mutation.observe(field,{attributes:true,attributeFilter:['data-space']});
    const targets={idle:[.3,.65],loading:[.55,.8],playing:[1,1],paused:[.25,.65],error:[.15,.45]};
    function render(now){
        if(stopped||document.hidden)return;raf=requestAnimationFrame(render);
        const elapsed=last?now-last:16;last=now;const dt=Math.min(elapsed,50)/1000;
        const frame=getFrame(),values=targets[frame.state]||targets.idle;
        const smooth=reduced.matches?1:1-Math.exp(-dt*3.5);u.flow.value+=(values[0]*(getCarMode()?.6:1)-u.flow.value)*smooth;u.strength.value+=(values[1]-u.strength.value)*smooth;
        mode+=((getCarMode()?1:0)-mode)*smooth;u.car.value=mode;
        if(!reduced.matches)clock+=dt*u.flow.value*(1+(frame.mode==='audio-analysis'?Math.min(.1,(frame.level||0)*.1):0));
        u.clock.value=clock;
        let touchActive=false;impulses.forEach((x,i)=>{const age=(now-x.born)/1000;const w=age<2?x.strength*age*6*Math.exp(1-age*6):0;
            u.touches.value[i].w=w>.001&&!reduced.matches?w:0;touchActive ||= u.touches.value[i].w>0;});
        canvas.dataset.touch=touchActive?'active':'settled';
        if(reduced.matches&&!dirty&&frame.state===previousState&&canvas.dataset.scene===(getCarMode()?'galaxy':'stellar'))return;
        previousState=frame.state;dirty=false;
        if(simReady&&!reduced.matches){simUniforms.source.value=simA.texture;simUniforms.dt.value=dt*u.flow.value;
            draw(sim,simB);[simA,simB]=[simB,simA];particleUniforms.positions.value=simA.texture;}
        renderer.setRenderTarget(sceneTarget);renderer.clear();renderer.render(scene,camera);
        draw(volume,beamTarget);
        blur.uniforms.source.value=beamTarget.texture;blur.uniforms.threshold.value=.55;blur.uniforms.direction.value.set(2/glowA.width,0);draw(blur,glowA);
        blur.uniforms.source.value=glowA.texture;blur.uniforms.threshold.value=0;blur.uniforms.direction.value.set(0,2/glowA.height);draw(blur,glowB);
        draw(composite,null);
        if(renderer.info.programs.some(program=>program.diagnostics && !program.diagnostics.runnable)){stopped=true;cancelAnimationFrame(raf);canvas.hidden=true;delete document.body.dataset.sky;return;}
        document.body.dataset.sky='ready';canvas.dataset.scene=getCarMode()?'galaxy':'stellar';canvas.dataset.quality=String(tier);canvas.dataset.simulation=simReady?'gpu':'analytic';
        if(now>warmUntil&&!reduced.matches){badFor=elapsed>34?badFor+Math.min(elapsed,100):Math.max(0,badFor-elapsed*.5);
            if(badFor>5000&&tier<2){tier++;badFor=0;if(tier===2)resetSimulation(tiers[tier].sim);resize();}}
    }
    canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();stopped=true;cancelAnimationFrame(raf);clearTouches();canvas.hidden=true;delete document.body.dataset.sky;});
    canvas.addEventListener('webglcontextrestored',()=>{resetSimulation(tiers[tier].sim);particleUniforms.simulated.value=simReady?1:0;particleUniforms.positions.value=simA?.texture||null;
        stopped=false;canvas.hidden=false;last=0;resize();raf=requestAnimationFrame(render);});
    window.addEventListener('resize',resize);
    document.addEventListener('visibilitychange',()=>{cancelAnimationFrame(raf);clearTouches();if(!document.hidden&&!stopped){last=0;dirty=true;raf=requestAnimationFrame(render);}});
    reduced.addEventListener('change',()=>{clearTouches();dirty=true;});
    window.addEventListener('pagehide',event=>{if(event.persisted)return;cancelAnimationFrame(raf);observer.disconnect();mutation.disconnect();
        [sceneTarget,beamTarget,glowA,glowB,simA,simB].forEach(x=>x?.dispose());
        [volume,blur,composite,sim,particles,home,geo,plane].forEach(x=>x.dispose());renderer.dispose();});
    resize();raf=requestAnimationFrame(render);
}
