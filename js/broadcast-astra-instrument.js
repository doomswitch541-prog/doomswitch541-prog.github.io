// Optional third dock motif. No audio graph, controls, storage or independent animation loop.
import * as THREE from '/assets/vendor/broadcast-three-r185/three.module.min.js';

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
        uniforms:{clock,density},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
        vertexShader:`
            attribute float phase;
            uniform float clock,density;
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
                gl_Position=projectionMatrix*view;
                gl_PointSize=(.55+position.z*1.2)*density*4.5/-view.z;
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
        transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
        vertexShader:`varying vec2 p;void main(){p=uv*2.-1.;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
        fragmentShader:`varying vec2 p;void main(){
            float shaft=exp(-p.y*p.y*1800.)*exp(-abs(p.x)*2.2)*.32;
            float source=exp(-dot(p,p)*1800.);
            gl_FragColor=vec4(.72,.93,.85,shaft+source);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
        }`
    });
    const source=new THREE.Mesh(new THREE.PlaneGeometry(7,1.6),sourceMaterial);
    scene.add(source);
    const star=new THREE.Mesh(new THREE.SphereGeometry(.085,12,8),new THREE.MeshBasicMaterial({color:0xdcffe9}));
    scene.add(star);
    let lost=false,disposed=false,lastWidth=0,lastHeight=0;
    canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();lost=true;});
    canvas.addEventListener('webglcontextrestored',()=>{lost=false;lastWidth=lastHeight=0;});
    const dispose=()=>{
        if(disposed)return;disposed=true;
        geometry.dispose();material.dispose();source.geometry.dispose();sourceMaterial.dispose();
        star.geometry.dispose();star.material.dispose();renderer.dispose();
    };
    window.addEventListener('pagehide',event=>{if(!event.persisted)dispose();});
    return {
        draw(context,width,height,time,pixelRatio){
            if(lost||disposed)return false;
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
