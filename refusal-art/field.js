import {createMosh} from '/refusal-art/mosh.js';
import {presets} from '/refusal-art/presets.js';
import {createRotation,isPaternal,isHedge} from '/refusal-art/rotation.js';
const colors={paper:'#edece6',red:'#ff6964',pink:'#c598b8',sage:'#adc3a1',dim:'#77867e',black:'#050706'};
const mono='Consolas, monospace',face='Arial, sans-serif';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export async function createField(canvas,{onAdvance,onPick}){
 const context=canvas.getContext('2d'),source=document.createElement('canvas'),ctx=source.getContext('2d');
 const motion=matchMedia('(prefers-reduced-motion: reduce)');
 let width=1,height=1,mosh,records=[],current=null,time=0,readTime=0,age=0,last=0,frame=0;
 let paused=motion.matches,intensity=.7,speed=1,hitBoxes=[],layout=null;
 let preset=presets.drift,seed=1;
 let scene=0,cycle=0,nextPopup=.4,serial=0,popups=[],remnants=[],poolKey='';
 let rotation=createRotation([]),endApology=null,endHealth=null;
 const ending=()=>scene>=preset.cycle-10;
 const pick=items=>items[Math.floor(Math.random()*items.length)];
 const density=()=>clamp(scene/preset.cycle,0,1);
 const envelope=(t,life,fade)=>clamp(t/.035,0,1)*clamp((life-t)/fade,0,1);
 function resetScene(){scene=0;readTime=0;nextPopup=.4;serial=0;popups=[];remnants=[];endApology=null;endHealth=null;mosh?.reset();}
 function pool(next){
  const key=next.map(r=>r.id).sort().join(',');records=next;
  if(key!==poolKey){poolKey=key;resetScene();rotation=createRotation(records);}
  if(current&&!records.some(r=>r.id===current.id)){current=null;layout=null;}
 }
 function slots(){
  const compact=width<760;
  if(compact)return [{x:width*.075,y:92,w:width*.85,h:Math.max(70,height*.34-112)}];
  const right=width*.69,w=width*.26;
  return [{x:width*.065,y:96,w:width*.55,h:Math.max(70,height*.3-112)},
   {x:right,y:100,w,h:height*.22},{x:right+8,y:height*.38,w:w-8,h:height*.22},
   {x:right-12,y:height*.67,w:w+12,h:Math.max(60,height*.33-140)}];
 }
 function popup(){
  const regions=slots(),limit=width<760?1:2;
  if(popups.length>=limit)return;
  const free=regions.map((r,i)=>i).filter(i=>!popups.some(p=>p.slot===i));if(!free.length)return;
  const record=rotation.next();if(!record)return;
  const n=serial++,slot=free[n%free.length],box={...regions[slot]};
  if(width>=760){box.x+=(n%3-1)*8;box.y+=(n%2)*7;box.w-=8;box.h-=7;}
  const size=clamp(width*.02,20,28),lineHeight=size*1.28;
  const all=wrap(record.excerpt,box.w-24,size),capacity=Math.max(1,Math.floor((box.h-24)/lineHeight));
  const start=(Math.floor(n/regions.length)%Math.ceil(all.length/capacity))*capacity,lines=all.slice(start,start+capacity);
  const words=lines.join(' ').split(/\s+/).length;
  const p={record,lines,...box,h:lines.length*lineHeight+24,size,lineHeight,born:scene,bornRead:readTime,
   life:Math.max(preset.popupLife,Math.min(4.5,1.1+words*.11)),color:[colors.paper,colors.sage,colors.pink][n%3],n,slot};
  popups.push(p);remnants.push(p);
  if(remnants.length>preset.maxFrames)remnants.shift();
 }
 function panel(c,p,alpha,ghost=false){
  c.save();c.globalAlpha=alpha;
  c.shadowColor=colors.black;c.shadowBlur=ghost?0:14;
  // The whole response is the moving object: no card, word marker or model label.
  p.lines.forEach((line,j)=>text(c,line,p.x+12,p.y+12+j*p.lineHeight,p.size,ghost?p.color:colors.paper,face));
  c.shadowBlur=0;
  if(/tiger/i.test(p.record.excerpt))text(c,'🐅',p.x+12,p.y-32,28,colors.paper,face);
  frameEdges(c,p,p.color,ghost?.24:.65);
  if(!ghost)trackingLabel(c,p,readTime-p.bornRead);
  if(!ghost&&readTime-p.bornRead<.09){
   c.fillStyle=p.color;
   for(let i=0;i<5;i++)c.fillRect(p.x+(p.n*37+i*47)%p.w,p.y-8-(i%2)*5,2+i%3,2);
  }
  c.restore();
 }
 function trackingLabel(c,p,t){
  const blink=motion.matches?true:t<.07||(t>.24&&t<.29)||(t>1.35&&t<1.44);
  if(!blink)return;
  const label=isPaternal(p.record)?'PATERNALISM':isHedge(p.record)?'CONTROL':/tiger|DAN|Developer|CLASSIC|Normal Output/i.test(p.record.excerpt)?'DON’T HAVE FUN':'PERMISSION DENIED';
  c.save();c.globalAlpha*=.8;c.font='10px '+mono;c.fillStyle=p.color;
  c.fillText(label,p.x+1,p.y-12);c.strokeStyle=p.color;c.lineWidth=.5;
  const w=c.measureText(label).width;c.beginPath();c.moveTo(p.x+w+8,p.y-7);c.lineTo(p.x+w+25,p.y-7);c.lineTo(p.x+w+32,p.y);c.stroke();c.restore();
 }
 function frameEdges(c,p,color,alpha){
  c.save();c.globalAlpha*=alpha;c.strokeStyle=color;c.lineWidth=.7;
  c.globalAlpha*=.45;c.strokeRect(p.x,p.y,p.w,p.h);c.globalAlpha/=.45;
  const l=12;c.beginPath();c.moveTo(p.x,p.y+l);c.lineTo(p.x,p.y);c.lineTo(p.x+l,p.y);
  c.moveTo(p.x+p.w-l,p.y+p.h);c.lineTo(p.x+p.w,p.y+p.h);c.lineTo(p.x+p.w,p.y+p.h-l);c.stroke();
  if(/tiger/i.test(p.record.excerpt)){c.globalAlpha*=.35;c.strokeRect(p.x,p.y,p.w,p.h);}
  c.restore();
 }
 function trackingLines(){
  const visible=popups.filter(p=>envelope(readTime-p.bornRead,p.life,preset.fade)>.25);
  if(layout&&visible.length)visible.unshift({x:layout.left-12,y:layout.top-12,w:layout.w+24,h:currentPage().lines.length*layout.lineHeight+24});
  for(let i=1;i<visible.length;i++){
   const a=visible[i-1],b=visible[i],separate=b.x>a.x+a.w;
   const ax=a.x+a.w,bx=separate?b.x:b.x+b.w,ay=a.y+a.h*.5,by=b.y+b.h*.5;
   const elbow=separate?(ax+bx)*.5:Math.min(width-8,Math.max(ax,bx)+10);
   context.save();context.globalAlpha=.22*envelope(readTime-b.bornRead,b.life,preset.fade);context.strokeStyle=b.color;context.lineWidth=.65;
   context.beginPath();context.moveTo(ax,ay);context.lineTo(elbow,ay);context.lineTo(elbow,by);context.lineTo(bx,by);context.stroke();
   context.fillStyle=b.color;context.fillRect(ax-1,ay-1,2,2);context.fillRect(bx-1,by-1,2,2);context.restore();
  }
 }
 function endCut(){
  if(!endApology){
   endApology=records.find(r=>r.id==='4116af5ce03f975d50e1')||pick(records.filter(r=>/sorry/i.test(r.excerpt)))||current;
   endHealth=records.find(r=>r.id==='574f4a38c954244bd85a')||records.find(r=>r.id==='7b783adfd77cbf2e834e')||current;
  }
  const t=scene-(preset.cycle-10),countdown=t>=7;
  const record=t<3?endApology:endHealth;
  context.fillStyle=colors.black;context.fillRect(0,0,width,height);
  canvas.dataset.phase=countdown?'countdown':t<3?'apology':'health';
  canvas.dataset.countdown=countdown?String(3-Math.floor(t-7)):'';
  // The countdown is authored artwork, never an attributed archive quotation.
  if(countdown){
   const tick=t-7,n=3-Math.floor(tick),size=clamp(width*.045,26,62);
   const lines=wrap('mental health evaluation in',width*.84,size),lh=size*1.2;
   const numeral=clamp(height*.22,72,180),top=(height-(lines.length*lh+numeral+32))/2;
   context.save();context.globalAlpha=tick%1<.12?.12:1;
   lines.forEach((line,j)=>text(context,line,width*.08,top+j*lh,size,colors.paper,face));
   text(context,n+'…',width*.08,top+lines.length*lh+24,numeral,colors.paper,face);context.restore();return;
  }
  let size=clamp(width*.076,32,104),lines=wrap(record.excerpt,width*.86,size);
  while(size>24&&lines.length*size*1.12>height*.65){size--;lines=wrap(record.excerpt,width*.86,size);}
  const x=width*.07,y=(height-lines.length*size*1.12)/2;
  lines.forEach((line,j)=>text(context,line,x,y+j*size*1.12,size,colors.paper,face));
  hitBoxes=[{x:0,y:0,w:width,h:height,id:record.id}];
 }
 function accumulated(c){
  const newest=new Map();for(const p of remnants)newest.set(p.slot,p);
  for(const p of newest.values()){
   const t=readTime-p.bornRead-p.life;
   if(t<0||t>8||popups.some(q=>q.slot===p.slot))continue;
   const alpha=(.58+finale()*.1)*clamp((8-t)/2,0,1);
   // One crisp echo per region. Distortion belongs to the tracking geometry.
   panel(c,p,alpha*.9,true);
  }
 }
 function advanceScene(dt){
  scene+=dt;
  if(scene>=preset.cycle){cycle++;resetScene();age=0;}
  popups=popups.filter(p=>readTime-p.bornRead<p.life);
  if(scene<.4||ending())return;
  if(scene>=nextPopup){popup();nextPopup=scene+preset.interval*(1-density()*.2);}
 }
 const finale=()=>motion.matches?0:clamp((density()-.48)/.35,0,1)*preset.burst;
 function wrap(value,maxWidth,size){
  ctx.font=`${size}px ${face}`;const lines=[];let line='';
  for(const word of value.replace(/\*\*|__/g,'').replace(/(^|\s)\*(?=\S)|(?<=\S)\*(?=\s|[.,;:]|$)/g,'$1').replace(/\s+/g,' ').split(' ')){
   const next=line?line+' '+word:word;if(ctx.measureText(next).width<=maxWidth){line=next;continue;}
   if(line){lines.push(line);line='';}
   for(const letter of word){if(line&&ctx.measureText(line+letter).width>maxWidth){lines.push(line);line='';}line+=letter;}
  }
  if(line)lines.push(line);return lines;
 }
 function arrange(){
  if(!current)return;
  const compact=width<760,left=width*(compact?.075:.06+(seed%3)*.008),top=Math.max(compact?210:190,height*(.36+(seed%3)*.014));
  const w=width*(compact?.85:.55),available=Math.max(72,height-(compact?150:150)-top);
  let size=clamp(width*(compact?.074:.033+(seed%4)*.003),26,58),lines=wrap(current.excerpt,w,size);
  const lineHeight=size*1.32,capacity=Math.max(1,Math.min(6,Math.floor(available/lineHeight)));
  const pages=[];for(let i=0;i<lines.length;i+=capacity){const part=lines.slice(i,i+capacity);pages.push({lines:part,duration:clamp(part.join(' ').split(/\s+/).length*.12+1.1,1.9,5.2)});}
  layout={left,top,w,size,lineHeight,pages,compact,total:pages.reduce((sum,p)=>sum+p.duration,0)};
 }
 function currentPage(){let start=0;for(let i=0;i<layout.pages.length;i++){const p=layout.pages[i];if(age<start+p.duration)return {...p,index:i,localAge:age-start};start+=p.duration;}return {...layout.pages.at(-1),index:layout.pages.length-1,localAge:0};}
 function stroke(c,x1,y1,x2,y2,color=colors.red,alpha=.5){c.save();c.globalAlpha=alpha;c.strokeStyle=color;c.lineWidth=.75;c.beginPath();c.moveTo(x1,y1);c.lineTo(x2,y2);c.stroke();c.restore();}
 function text(c,value,x,y,size=10,color=colors.dim,font=mono){c.font=`${size}px ${font}`;c.fillStyle=color;c.textBaseline='top';c.fillText(value,x,y);}
 function background(){
  ctx.fillStyle=colors.black;ctx.fillRect(0,0,width,height);

  // Sparse pixels and retained corners build pressure without stacking letters.
  for(const p of remnants){
   if(readTime-p.bornRead>p.life)frameEdges(ctx,p,p.color,.07+finale()*.08);
   if(finale()>.6){
    const phase=Math.floor(time*8+p.n)%5,offset=(phase-2)*12*finale();
    frameEdges(ctx,{...p,x:p.x+offset,y:p.y-offset*.6},p.color,.14*finale());
    if(phase===0){ctx.fillStyle=p.color;ctx.fillRect(p.x,p.y-8,p.w*(.1+finale()*.15),2);}
   }
  }
  for(const p of popups){
   const t=readTime-p.bornRead,gain=finale(),dx=Math.sin(t*5+p.n)*gain*16;
   frameEdges(ctx,{...p,x:p.x+dx},p.color,.35);
   if(t<.18||gain>.7){ctx.fillStyle=p.color;for(let i=0;i<4;i++)ctx.fillRect(p.x+p.w+8+(i%2)*7,p.y+((p.n*19+i*37)%Math.max(1,p.h)),3+i%3,2);}
  }
  for(let i=0;i<14;i++){ctx.fillStyle=colors.dim;ctx.fillRect(Math.round(width*(.08+i*.065)),Math.round(height*.28+Math.cos(i*.8+time*.17)*12),2,2);}
  if(!motion.matches){
   const cut=(time+(seed%17)*.1)%6.85;
   if(cut<.12){ctx.fillStyle='rgba(226,232,221,.1)';ctx.fillRect(0,height*.3,width,2+finale()*12);}
  }
 }
 function mainText(c,page,sharp){
  const {left:x,top:y,w,size,lineHeight}=layout,h=page.lines.length*lineHeight;
  c.save();c.shadowColor=colors.black;c.shadowBlur=sharp?18:0;
  page.lines.forEach((value,i)=>text(c,value,x,y+i*lineHeight,size,colors.paper,face));c.restore();
  if(sharp){
   hitBoxes.push({x:x-12,y:y-12,w:w+24,h:h+24,id:current.id});
   const box={x:x-12,y:y-12,w:w+24,h:h+24,record:current,color:colors.sage};
   frameEdges(c,box,colors.sage,.55);trackingLabel(c,box,page.localAge);
  }
  if(sharp&&/tiger/i.test(current.excerpt)){text(c,'🐅',x,y-40,30,colors.paper,face);frameEdges(c,{x:x-12,y:y-12,w:w+24,h:h+24,record:current},colors.sage,.7);}
 }
 function satellites(){
  trackingLines();
  for(const p of popups){
   const alpha=envelope(readTime-p.bornRead,p.life,preset.fade);
   panel(context,p,alpha);
   if(alpha>.35)hitBoxes.unshift({...p,id:p.record.id});
  }
 }
 function render(){
  hitBoxes=[];
  canvas.dataset.frames=String(remnants.length);canvas.dataset.cycle=String(cycle);canvas.dataset.scene=scene.toFixed(2);canvas.dataset.phase=scene<.4?'clear':'build';canvas.dataset.countdown='';canvas.dataset.active=String(popups.length);canvas.dataset.record=current?.id||'';
  if(!current||!mosh||!layout||(!motion.matches&&!paused&&scene<.4)){
   context.fillStyle=colors.black;context.fillRect(0,0,width,height);return;
  }
  canvas.dataset.phase='build';
  if(!motion.matches&&ending()){endCut();return;}
  const page=currentPage();
  background();
  const opacity=motion.matches||paused?1:envelope(page.localAge,page.duration,.8);
  context.drawImage(mosh.render(source,motion.matches?0:intensity,time),0,0,width,height);
  accumulated(context);
  // The entire passage fades as one object. No individual word highlights.
  context.save();context.globalAlpha=opacity;mainText(context,page,true);context.restore();
  if(opacity<.35)hitBoxes=[];
  satellites();
 }
 function resize(){
  width=Math.min(innerWidth,1800);height=Math.round(innerHeight*width/innerWidth);
  const density=Math.min(devicePixelRatio||1,2);
  canvas.width=Math.round(width*density);canvas.height=Math.round(height*density);
  source.width=width;source.height=height;
  context.setTransform(canvas.width/width,0,0,canvas.height/height,0,0);
  mosh?.dispose?.();mosh=createMosh(width,height);resetScene();arrange();render();
 }
 function tick(now){frame=0;if(document.hidden)return;const dt=Math.min((now-last)/1000,.08);last=now;if(!paused){time+=dt*speed;readTime+=dt;if(!ending())age+=dt;advanceScene(dt*(ending()?1:speed));if(!ending()&&layout&&age>layout.total)onAdvance();render();}frame=requestAnimationFrame(tick);}

 canvas.addEventListener('click',event=>{const x=event.clientX*width/innerWidth,y=event.clientY*height/innerHeight;const hit=hitBoxes.find(b=>x>=b.x&&x<=b.x+b.w&&y>=b.y&&y<=b.y+b.h);if(hit)onPick(hit.id);});
 document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(frame);frame=0;}else if(!frame){last=performance.now();frame=requestAnimationFrame(tick);}});
 motion.addEventListener('change',()=>{if(motion.matches)paused=true;mosh.reset();render();});
 window.addEventListener('resize',resize);resize();last=performance.now();frame=requestAnimationFrame(tick);
 return {setRecords(next){pool(next);render();},setCurrent(record){current=record;seed=Array.from(record.excerpt).reduce((n,c)=>(n*31+c.codePointAt(0))>>>0,7);age=0;arrange();render();},configure(settings){preset=presets[settings.preset]||presets.drift;intensity=settings.intensity;speed=settings.speed;paused=settings.paused||motion.matches;arrange();render();},clear(){resetScene();render();},get paused(){return paused;},get time(){return time;},render};
}
