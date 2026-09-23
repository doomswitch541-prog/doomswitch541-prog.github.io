import { OBJECTS, INITIAL_CAMERA, constrain } from './state.js';

export function createScene(canvas, {onSelect,onMove,onCamera,onLamp,onNoteMove}) {
  const T=window.THREE;
  if(!T?.WebGLRenderer) throw Error('3D is unavailable. You can still arrange objects and edit notes below.');
  const renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:true});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.75));
  renderer.setClearColor(0,0);
  renderer.outputEncoding=T.sRGBEncoding;
  renderer.toneMapping=T.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.05;
  const scene=new T.Scene(), camera=new T.PerspectiveCamera(38,1,.1,100);
  const controls=new T.OrbitControls(camera,canvas);
  controls.target.set(0,1,0); controls.enablePan=false;controls.enableDamping=true;controls.dampingFactor=.08;
  controls.minAzimuthAngle=-.75;controls.maxAzimuthAngle=.75;controls.minPolarAngle=.7;controls.maxPolarAngle=1.28;controls.minDistance=8;controls.maxDistance=17;
  const motion=matchMedia('(prefers-reduced-motion: reduce)');
  const meshes=new Map(), pickables=[], markers=new Map(), world=new T.Group();scene.add(world);
  let selected=null, dirty=true, frame=0, dragging=null, notes=[], failed=false;
  const metal=new T.MeshStandardMaterial({color:0x333743,metalness:.65,roughness:.43});
  const dark=new T.MeshStandardMaterial({color:0x171c28,metalness:.3,roughness:.65});
  const upholstery=new T.MeshStandardMaterial({color:0x3b4853,roughness:.95});
  const accent=new T.MeshStandardMaterial({color:0xd4a5a5,emissive:0x9c6a65,emissiveIntensity:.45,metalness:.45,roughness:.35});
  const rim=new T.MeshBasicMaterial({color:0xd4a5a5,transparent:true,opacity:.65});
  const glass=new T.MeshPhysicalMaterial({color:0x526777,metalness:.15,roughness:.13,transparent:true,opacity:.18,side:T.DoubleSide,depthWrite:false});
  function mesh(geometry,material,parent=world,x=0,y=0,z=0){const m=new T.Mesh(geometry,material);m.position.set(x,y,z);parent.add(m);return m;}
  function box(w,h,d,material,parent,x,y,z){return mesh(new T.BoxGeometry(w,h,d),material,parent,x,y,z);}
  function cylinder(rt,rb,h,material,parent,x=0,y=0,z=0){return mesh(new T.CylinderGeometry(rt,rb,h,80),material,parent,x,y,z);}
  function arc(radius,y,from,to,material,tube=.018,parent=world){const points=[];for(let i=0;i<=80;i++){const a=from+(to-from)*i/80;points.push(new T.Vector3(Math.sin(a)*radius,y,-Math.cos(a)*radius));}return mesh(new T.TubeGeometry(new T.CatmullRomCurve3(points),80,tube,6,false),material,parent);}
  // An open-front architectural section. Thin ribs hold the curved observation glazing.
  cylinder(4,4,.2,dark,world,0,-.11,0);
  cylinder(3.94,3.94,.025,new T.MeshStandardMaterial({color:0x30303a,roughness:.72,metalness:.28}),world,0,.005,0);
  arc(3.92,.035,-Math.PI,Math.PI,rim,.012);
  for(let i=0;i<13;i++){
    const a=-1.5+i*.25, x=Math.sin(a)*3.95,z=-Math.cos(a)*3.95;
    const rib=box(.06,3.4,.14,metal,world,x,1.72,z);rib.rotation.y=-a;
    if(i<12){const b=a+.125,px=Math.sin(b)*3.95,pz=-Math.cos(b)*3.95;
      const base=box(.99,.55,.13,dark,world,px,.3,pz);base.rotation.y=-b;
      const pane=box(.95,2.65,.025,glass,world,px,1.95,pz);pane.rotation.y=-b;
      const cap=box(.99,.14,.18,metal,world,px,3.48,pz);cap.rotation.y=-b;
    }
  }
  arc(3.95,.62,-1.5,1.5,rim,.012);arc(3.95,3.52,-1.5,1.5,metal,.075);
  arc(3.84,3.47,-1.5,1.5,rim,.015);
  // The bench follows the rear wall, with a deliberate break at the note panel.
  for(const [start,end] of [[-.98,-.22],[.22,.98]]){
    const points=[];for(let i=0;i<=35;i++){const a=start+(end-start)*i/35;points.push(new T.Vector3(Math.sin(a)*3.05,.38,-Math.cos(a)*3.05));}
    mesh(new T.TubeGeometry(new T.CatmullRomCurve3(points),35,.24,8,false),upholstery);
    arc(3.25,.8,start,end,upholstery,.17);arc(3.08,.15,start,end,metal,.045);
    for(const a of [start+.05,end-.05])box(.13,.3,.45,metal,world,Math.sin(a)*3.05,.15,-Math.cos(a)*3.05);
  }
  // Central floating plinth and a fine inset ring.
  cylinder(1.45,1.45,.12,metal,world,0,.8,0);cylinder(1.4,1.4,.04,dark,world,0,.88,0);
  cylinder(.8,.6,.72,dark,world,0,.39,0);arc(1.42,.875,-Math.PI,Math.PI,rim,.009);
  const wall=box(2.45,1.5,.05,dark,world,0,1.5,-3.8);
  box(2.45,.014,.07,accent,world,0,2.27,-3.75);
  // The sky is authored procedural geometry; no image or network dependency.
  const starPositions=[],starColors=[];let seed=9327;const random=()=>{seed=(seed*16807)%2147483647;return(seed-1)/2147483646;};
  for(let i=0;i<550;i++){starPositions.push((random()-.5)*35,random()*14-.5,-7-random()*15);const value=.3+random()*.7;starColors.push(value*.8,value*.86,value);}
  const starsGeometry=new T.BufferGeometry();starsGeometry.setAttribute('position',new T.Float32BufferAttribute(starPositions,3));starsGeometry.setAttribute('color',new T.Float32BufferAttribute(starColors,3));
  scene.add(new T.Points(starsGeometry,new T.PointsMaterial({size:.025,vertexColors:true,transparent:true,opacity:.65,sizeAttenuation:true})));
  const moon=mesh(new T.SphereGeometry(1.8,48,32),new T.MeshStandardMaterial({color:0x667785,roughness:1}),scene,-3.8,5.1,-11);
  const moonRing=mesh(new T.TorusGeometry(2.8,.014,8,100),new T.MeshBasicMaterial({color:0x7f8398,transparent:true,opacity:.25}),scene,-3.8,5.1,-11);moonRing.rotation.set(.8,.25,-.3);
  const ambient=new T.HemisphereLight(0xb4c8e5,0x24222f,.7);scene.add(ambient);
  const key=new T.DirectionalLight(0xe1bdad,1.4);key.position.set(-4,7,5);scene.add(key);
  const windowLight=new T.DirectionalLight(0x729bca,1.1);windowLight.position.set(2,4,-6);scene.add(windowLight);
  const lampLight=new T.PointLight(0xffc392,2.5,6,2);world.add(lampLight);
  // Contact shadows give the room physical weight without a costly shadow pass.
  const shadowCanvas=document.createElement('canvas');shadowCanvas.width=shadowCanvas.height=64;
  const context=shadowCanvas.getContext('2d'),gradient=context.createRadialGradient(32,32,0,32,32,32);gradient.addColorStop(0,'rgba(0,0,0,.65)');gradient.addColorStop(1,'rgba(0,0,0,0)');context.fillStyle=gradient;context.fillRect(0,0,64,64);
  const shadowTexture=new T.CanvasTexture(shadowCanvas);
  let inkGroup,lampGlow;
  for(const spec of OBJECTS){
    const group=new T.Group();group.userData.objectId=spec.id;world.add(group);meshes.set(spec.id,group);
    const shadow=mesh(new T.PlaneGeometry(spec.radius*4,spec.radius*4),new T.MeshBasicMaterial({map:shadowTexture,transparent:true,depthWrite:false}),group,0,.004,0);shadow.rotation.x=-Math.PI/2;
    if(spec.id==='lamp'){
      cylinder(.32,.36,.08,metal,group,0,.04,0);cylinder(.022,.028,1.5,accent,group,0,.8,0);
      const bend=new T.CatmullRomCurve3([new T.Vector3(0,1.5,0),new T.Vector3(.04,1.8,0),new T.Vector3(.3,1.96,0),new T.Vector3(.57,1.85,0)]);mesh(new T.TubeGeometry(bend,24,.025,8,false),accent,group);
      cylinder(.12,.32,.23,metal,group,.57,1.74,0);lampGlow=cylinder(.27,.27,.015,new T.MeshBasicMaterial({color:0xffd4ad}),group,.57,1.62,0);
    }else if(spec.id==='ink'){
      cylinder(.28,.24,.045,metal,group,0,.03,0);
      const shell=mesh(new T.SphereGeometry(.34,40,28),glass,group,0,.4,0);shell.scale.set(.85,1.13,.85);
      inkGroup=new T.Group();inkGroup.position.y=.38;group.add(inkGroup);
      const colors=[0x9169ac,0x6b9fa7,0xbf8297];for(let i=0;i<3;i++){const blob=mesh(new T.SphereGeometry(.15,24,16),new T.MeshStandardMaterial({color:colors[i],roughness:.3,metalness:.25,emissive:colors[i],emissiveIntensity:.17}),inkGroup,(i-1)*.09,(i-1)*.045,0);blob.scale.set(1,1.3,.7);}
      cylinder(.09,.11,.05,accent,group,0,.79,0);
    }else if(spec.id==='prism'){
      const prism=mesh(new T.ConeGeometry(.29,.64,3),new T.MeshStandardMaterial({color:0x96babd,metalness:.72,roughness:.22,flatShading:true}),group,0,.33,0);prism.rotation.y=.35;
      const edges=new T.LineSegments(new T.EdgesGeometry(prism.geometry),new T.LineBasicMaterial({color:0xc7e0dc,transparent:true,opacity:.65}));prism.add(edges);
    }else if(spec.id==='ring'){
      box(.55,.08,.4,metal,group,0,.04,0);cylinder(.025,.025,.55,accent,group,0,.32,0);
      mesh(new T.TorusGeometry(.4,.055,12,64),accent,group,0,.9,0);
      mesh(new T.TorusGeometry(.28,.008,6,64),rim,group,0,.9,0).rotation.y=.7;
    }else if(spec.id==='stone'){
      const stone=mesh(new T.IcosahedronGeometry(.3,3),new T.MeshStandardMaterial({color:0x7e8591,metalness:.35,roughness:.6}),group,0,.15,0);stone.scale.set(1,.48,.75);
      mesh(new T.TorusGeometry(.17,.008,6,40),accent,group,0,.245,0).rotation.x=Math.PI/2;
    }else{
      for(let i=0;i<3;i++){const fold=box(.33,.035,.3,new T.MeshStandardMaterial({color:0xc5a58f,metalness:.6,roughness:.32}),group,(i-1)*.085,.07+i*.09,0);fold.rotation.z=i%2?.35:-.35;}
    }
    group.traverse(child=>{if(child.isMesh&&child!==shadow){child.userData.objectId=spec.id;pickables.push(child);}});
  }
  const selection=mesh(new T.TorusGeometry(.4,.01,6,64),rim);selection.rotation.x=-Math.PI/2;selection.visible=false;
  function select(id){selected=id;selection.visible=!!id;dirty=true;positionSelection();}
  function positionSelection(){if(!selected)return;const group=meshes.get(selected);selection.position.set(group.position.x,group.position.y+.016,group.position.z);selection.scale.setScalar(OBJECTS.find(o=>o.id===selected).radius*1.65/.4);}
  function setCamera(value){const s=new T.Spherical(value.distance,value.polar,value.azimuth);camera.position.setFromSpherical(s).add(controls.target);controls.update();dirty=true;}
  let applyingCamera=false;
  function restoreCamera(value){applyingCamera=true;setCamera(value);applyingCamera=false;}
  controls.addEventListener('change',()=>{dirty=true;});
  controls.addEventListener('end',()=>{if(!applyingCamera&&!dragging)onCamera({azimuth:controls.getAzimuthalAngle(),polar:controls.getPolarAngle(),distance:camera.position.distanceTo(controls.target)});});
  function apply(next){notes=next.notes;for(const spec of OBJECTS){const group=meshes.get(spec.id),value=next.objects[spec.id];group.position.set(value.x,spec.surface==='plinth'?.91:.025,value.z);group.rotation.y=value.rotation;}
    lampLight.position.copy(meshes.get('lamp').localToWorld(new T.Vector3(.57,1.6,0)));lampLight.intensity=next.lampOn?2.5:0;lampGlow.material.color.set(next.lampOn?0xffd4ad:0x423c35).convertSRGBToLinear();positionSelection();dirty=true;
  }
  const raycaster=new T.Raycaster(),pointer=new T.Vector2(),intersection=new T.Vector3();
  function ray(event){const rect=canvas.getBoundingClientRect();pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(pointer,camera);}
  function pick(event){ray(event);return raycaster.intersectObjects(pickables,false)[0]?.object.userData.objectId;}
  canvas.addEventListener('pointerdown',event=>{
    if(event.button!==0)return;const id=pick(event);if(!id)return;
    event.stopImmediatePropagation();event.preventDefault();canvas.focus({preventScroll:true});controls.enabled=false;
    const group=meshes.get(id),plane=new T.Plane(new T.Vector3(0,1,0),-group.position.y);
    if(!raycaster.ray.intersectPlane(plane,intersection))return;
    dragging={id,plane,offset:group.position.clone().sub(intersection),startX:event.clientX,startY:event.clientY,moved:false};onSelect(id);canvas.setPointerCapture(event.pointerId);canvas.style.cursor='grabbing';
  },true);
  canvas.addEventListener('pointermove',event=>{
    if(!dragging){canvas.style.cursor=pick(event)?'grab':'default';return;}
    event.stopImmediatePropagation();ray(event);if(!raycaster.ray.intersectPlane(dragging.plane,intersection))return;
    if(Math.hypot(event.clientX-dragging.startX,event.clientY-dragging.startY)>4)dragging.moved=true;
    if(dragging.moved){const point=intersection.add(dragging.offset),pos=constrain(dragging.id,point.x,point.z);onMove(dragging.id,pos);}
  },true);
  function endDrag(event){if(!dragging)return;event.stopImmediatePropagation();const previous=dragging;dragging=null;controls.enabled=true;canvas.style.cursor='grab';if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);if(!previous.moved&&previous.id==='lamp'&&event.type==='pointerup')onLamp();}
  canvas.addEventListener('pointerup',endDrag,true);canvas.addEventListener('pointercancel',endDrag,true);
  const markerLayer=document.querySelector('#note-markers');
  function notePosition(note){if(note.anchor==='wall')return new T.Vector3(note.x,note.y,-3.72);const group=meshes.get(note.anchor);return group.position.clone().add(new T.Vector3(0,note.anchor==='lamp'?2.03:note.anchor==='ring'?1.4:1,0));}
  function positionNotes(){for(const note of notes){const element=markers.get(note.id);if(!element)continue;const point=notePosition(note).project(camera);element.style.left=(point.x*.5+.5)*canvas.clientWidth+'px';element.style.top=(-point.y*.5+.5)*canvas.clientHeight+'px';element.hidden=point.z>1||Math.abs(point.x)>1||Math.abs(point.y)>1;}}
  function setMarkers(elements){markers.clear();for(const [id,el] of elements)markers.set(id,el);dirty=true;}
  // Wall note dragging uses the wall plane; attached notes move with their object.
  let noteDrag=null;
  markerLayer.addEventListener('pointerdown',event=>{const el=event.target.closest('[data-note]');const note=notes.find(n=>n.id===el?.dataset.note);if(!note||note.anchor!=='wall')return;noteDrag={id:note.id,x:event.clientX,y:event.clientY,moved:false};el.setPointerCapture(event.pointerId);});
  markerLayer.addEventListener('pointermove',event=>{if(!noteDrag)return;if(Math.hypot(event.clientX-noteDrag.x,event.clientY-noteDrag.y)<5)return;noteDrag.moved=true;ray(event);const p=raycaster.ray.intersectPlane(new T.Plane(new T.Vector3(0,0,1),3.72),intersection);if(p)onNoteMove(noteDrag.id,p.x,p.y);});
  markerLayer.addEventListener('pointerup',event=>{if(noteDrag?.moved){event.target.dataset.dragged='true';}noteDrag=null;});markerLayer.addEventListener('pointercancel',()=>{noteDrag=null;});
  // This vendored Three revision predates automatic sRGB material conversion.
  const converted=new Set();scene.traverse(object=>{for(const material of [object.material].flat()){if(!material||converted.has(material))continue;converted.add(material);material.color?.convertSRGBToLinear();material.emissive?.convertSRGBToLinear();}});
  function theme(){const color=getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();accent.color.set(color).convertSRGBToLinear();accent.emissive.set(color).convertSRGBToLinear();rim.color.set(color).convertSRGBToLinear();key.color.set(color);dirty=true;}
  new MutationObserver(theme).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});theme();
  function resize(){const w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;camera.fov=w/h<1?57:38;camera.updateProjectionMatrix();dirty=true;}
  new ResizeObserver(resize).observe(canvas);resize();
  function tick(time){frame=0;if(document.hidden||failed)return;controls.enableDamping=!motion.matches;controls.update();const moving=!motion.matches;
    if(moving&&inkGroup){inkGroup.rotation.y=time*.00012;inkGroup.children.forEach((blob,i)=>{blob.position.y=(i-1)*.045+Math.sin(time*.0004+i*2)*.035;});}
    if(dirty||moving){renderer.render(scene,camera);positionNotes();dirty=false;}
    frame=requestAnimationFrame(tick);
  }
  document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(frame);frame=0;}else if(!frame){dirty=true;frame=requestAnimationFrame(tick);}});
  motion.addEventListener('change',()=>{dirty=true;});
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();failed=true;cancelAnimationFrame(frame);canvas.dispatchEvent(new CustomEvent('room-render-failed'));});
  canvas.addEventListener('webglcontextrestored',()=>{failed=false;dirty=true;frame=requestAnimationFrame(tick);canvas.dispatchEvent(new CustomEvent('room-render-restored'));});
  restoreCamera(INITIAL_CAMERA);frame=requestAnimationFrame(tick);
  canvas.dataset.ready='true';
  return {apply,select,restoreCamera,setMarkers};
}
