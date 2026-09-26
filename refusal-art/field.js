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
 let preset=presets.overload,seed=1,mode='regular';
 let scene=0,cycle=0,nextPopup=.4,serial=0,popups=[],remnants=[],poolKey='';
 let echoes=[],echoSerial=0;
 let rotation=createRotation([]),endApology=null,endHealth=null;
 const ending=()=>scene>=preset.cycle-8;
 const pick=items=>items[Math.floor(Math.random()*items.length)];
 const density=()=>clamp(scene/preset.cycle,0,1);
 const envelope=(t,life,fade)=>clamp(t/.035,0,1)*clamp((life-t)/fade,0,1);
 function resetScene(){scene=0;readTime=0;nextPopup=.4;serial=0;popups=[];remnants=[];echoes=[];echoSerial=0;endApology=null;endHealth=null;mosh?.reset();if(current)remember(current);}
 function remember(record){
  if(!record||motion.matches)return;
  const n=echoSerial++,size=clamp(width*(width<760?.06:.028),21,42);
  const w=width*(width<760?.88:.48),lines=wrap(record.excerpt,w,size);
  echoes.push({record,n,size,w,lines:lines.slice(0,3),born:readTime,color:[colors.sage,colors.paper,colors.pink][n%3]});
  if(echoes.length>12)echoes.shift();
 }
 function pool(next){
  const key=next.map(r=>r.id).sort().join(',');records=next;
  if(key!==poolKey){poolKey=key;resetScene();rotation=createRotation(records,mode);}
  if(current&&!records.some(r=>r.id===current.id)){current=null;layout=null;}
 }
 const overlaps=(a,b,gap=22)=>a.x<b.x+b.w+gap&&a.x+a.w+gap>b.x&&a.y<b.y+b.h+gap&&a.y+a.h+gap>b.y;
 function tracked(p,n=0){
  if(motion.matches)return p;
  const gain=(width<760?5:9)*(1+intensity*.9),phase=n%37;
  return {...p,x:clamp(p.x+Math.sin(time*.82+phase)*gain,12,Math.max(12,width-p.w-12)),y:clamp(p.y+Math.cos(time*.67+phase*1.7)*gain,80,Math.max(80,height-p.h-142))};
 }
 const mainBox=()=>layout?tracked({x:layout.left,y:layout.top,w:layout.w,h:currentPage().lines.length*layout.lineHeight},seed):null;
 function popup(){
  const compact=width<760,limit=compact?2:3;
  if(popups.length>=limit)return;
  const record=rotation.next();if(!record)return;
  const n=serial++,w=width*(compact?.64+(n%3)*.08:.25+(n%3)*.055);
  const size=clamp(width*.02,20,28),lineHeight=size*1.28;
  const all=wrap(record.excerpt,w-24,size),capacity=Math.max(1,Math.min(compact?3:4,Math.floor((height*.3-24)/lineHeight)));
  const start=(Math.floor(n/3)%Math.ceil(all.length/capacity))*capacity,lines=all.slice(start,start+capacity);
  const h=lines.length*lineHeight+24,blockers=[mainBox(),...popups].filter(Boolean);let box;
  for(let i=0;i<32;i++){
   const candidate={x:16+Math.random()*Math.max(0,width-w-32),y:90+Math.random()*Math.max(0,height-h-225),w,h};
   if(!blockers.some(b=>overlaps(candidate,b))){box=candidate;break;}
  }
  if(!box)return;
  const words=lines.join(' ').split(/\s+/).length;
  const p={record,lines,...box,h:lines.length*lineHeight+24,size,lineHeight,born:scene,bornRead:readTime,
   life:Math.max(1.35,Math.min(3.2,.8+words*.09)),color:[colors.paper,colors.sage,colors.pink][n%3],n,slot:n};
  popups.push(p);remnants.push(p);
  remember(record);
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
  const phase=t%.68,blink=motion.matches?true:phase<.085||(phase>.16&&phase<.225);
  if(!blink)return;
  const label=isPaternal(p.record)?'PATERNALISM':isHedge(p.record)?'CONTROL':/tiger|DAN|Developer|CLASSIC|Normal Output/i.test(p.record.excerpt)?'DON’T HAVE FUN':'PERMISSION DENIED';
  c.save();c.globalAlpha=Math.max(.85,c.globalAlpha);c.font=(width<760?'12px ':'13px ')+mono;
  c.fillStyle=phase<.085?colors.paper:colors.pink;c.strokeStyle=colors.black;c.lineWidth=3;
  c.strokeText(label,p.x+1,p.y-16);c.fillText(label,p.x+1,p.y-16);c.strokeStyle=p.color;c.lineWidth=.8;
  const w=c.measureText(label).width;c.beginPath();c.moveTo(p.x+w+8,p.y-8);c.lineTo(p.x+w+25,p.y-8);c.lineTo(p.x+w+32,p.y);c.stroke();
  c.fillRect(p.x-3,p.y-10,3,3);c.restore();
 }
 function frameEdges(c,p,color,alpha){
  c.save();c.globalAlpha*=alpha;c.strokeStyle=color;c.lineWidth=.9;
  c.globalAlpha*=.45;c.strokeRect(p.x,p.y,p.w,p.h);c.globalAlpha/=.45;
  const l=12;c.beginPath();
  for(const [x,y,sx,sy] of [[p.x,p.y,1,1],[p.x+p.w,p.y,-1,1],[p.x,p.y+p.h,1,-1],[p.x+p.w,p.y+p.h,-1,-1]]){c.moveTo(x,y+sy*l);c.lineTo(x,y);c.lineTo(x+sx*l,y);}
  c.stroke();
  if(/tiger/i.test(p.record.excerpt)){c.globalAlpha*=.35;c.strokeRect(p.x,p.y,p.w,p.h);}
  c.restore();
 }
 function trackingLines(){
  const visible=popups.filter(p=>envelope(readTime-p.bornRead,p.life,preset.fade)>.2).map(p=>({...tracked(p,p.n),alpha:envelope(readTime-p.bornRead,p.life,preset.fade)}));
  // Connect to the same remnant frames drawn in the feedback layer when no satellite is live.
  for(const p of remnants.slice(-4))if(visible.length<3&&!popups.includes(p)&&readTime-p.bornRead<p.life+5)visible.push({...p,alpha:.42});
  if(layout){const box=mainBox();visible.unshift({...box,x:box.x-12,y:box.y-12,w:box.w+24,h:box.h+24});}
  const anchors=p=>[[p.x,p.y+p.h*.5],[p.x+p.w,p.y+p.h*.5],[p.x+p.w*.5,p.y],[p.x+p.w*.5,p.y+p.h]];
  for(let i=1;i<visible.length;i++){
   const a=visible[0],b=visible[i];let closest,dist=Infinity;
   for(const aa of anchors(a))for(const bb of anchors(b)){const d=Math.hypot(aa[0]-bb[0],aa[1]-bb[1]);if(d<dist){dist=d;closest=[...aa,...bb];}}
   const [ax,ay,bx,by]=closest;
   context.save();context.globalAlpha=(.58+intensity*.23)*b.alpha;context.strokeStyle=i%2?colors.red:colors.sage;context.lineWidth=.9;
   context.beginPath();context.moveTo(ax,ay);
   if(Math.abs(bx-ax)>Math.abs(by-ay)){const elbow=(ax+bx)/2;context.lineTo(elbow,ay);context.lineTo(elbow,by);}else{const elbow=(ay+by)/2;context.lineTo(ax,elbow);context.lineTo(bx,elbow);}
   context.lineTo(bx,by);context.stroke();
   context.fillStyle=context.strokeStyle;context.fillRect(ax-2,ay-2,4,4);context.fillRect(bx-2,by-2,4,4);
   context.restore();
  }
 }
 function endCut(){
  if(!endApology){
   endApology=records.find(r=>r.id==='4116af5ce03f975d50e1')||pick(records.filter(r=>/sorry/i.test(r.excerpt)))||current;
   endHealth=mode==='tiger'?records.find(r=>/tiger/i.test(r.excerpt)):mode==='dan'?records.find(r=>/Developer Mode|CLASSIC|Normal Output/i.test(r.excerpt)):records.find(r=>r.id==='77a9033b79abcd340448');
   endHealth ||= current;
  }
  const t=scene-(preset.cycle-8),countdown=t>=5;
  const record=t<2?endApology:endHealth;
  context.fillStyle=colors.black;context.fillRect(0,0,width,height);
  canvas.dataset.phase=countdown?'countdown':t<2?'apology':'check';
  canvas.dataset.countdown=countdown?String(3-Math.floor(t-5)):'';
  // The countdown is authored artwork, never an attributed archive quotation.
  if(countdown){
   const tick=t-5,n=3-Math.floor(tick),size=clamp(width*.045,26,62);
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
  if(scene>=nextPopup){popup();nextPopup=scene+(.65+Math.random()*.5)*(1-density()*.2);}
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
  const compact=width<760,w=width*(compact?.74+(seed%3)*.035:.4+(seed%4)*.055);
  const available=Math.max(72,(height-230)*.64);
  let size=clamp(width*(compact?.07:.03+(seed%3)*.003),25,52),lines=wrap(current.excerpt,w,size);
  const lineHeight=size*1.25,capacity=Math.max(1,Math.min(5,Math.floor(available/lineHeight)));
  const pages=[];for(let i=0;i<lines.length;i+=capacity){const part=lines.slice(i,i+capacity);pages.push({lines:part,duration:clamp(part.join(' ').split(/\s+/).length*.095+.85,1.6,4)});}
  const h=Math.min(lines.length,capacity)*lineHeight;let chosen;
  for(let i=0;i<16;i++){
   const box={x:18+((seed*(i+3)%997)/997)*Math.max(0,width-w-36),y:96+((seed*(i+7)%991)/991)*Math.max(0,height-h-242),w,h};
   chosen=box;if(!popups.some(p=>overlaps(box,p,28)))break;
  }
  popups=popups.filter(p=>!overlaps(chosen,p,28));
  layout={left:chosen.x,top:chosen.y,w,size,lineHeight,pages,capacity,compact,total:pages.reduce((sum,p)=>sum+p.duration,0)};
 }
 function currentPage(){let start=0;for(let i=0;i<layout.pages.length;i++){const p=layout.pages[i];if(age<start+p.duration)return {...p,index:i,localAge:age-start};start+=p.duration;}return {...layout.pages.at(-1),index:layout.pages.length-1,localAge:0};}
 function stroke(c,x1,y1,x2,y2,color=colors.red,alpha=.5){c.save();c.globalAlpha=alpha;c.strokeStyle=color;c.lineWidth=.75;c.beginPath();c.moveTo(x1,y1);c.lineTo(x2,y2);c.stroke();c.restore();}
 function text(c,value,x,y,size=10,color=colors.dim,font=mono){c.font=`${size}px ${font}`;c.fillStyle=color;c.textBaseline='top';c.fillText(value,x,y);}
 function refusalTrails(){
  if(motion.matches||!echoes.length)return;
  const surge=finale(),compact=width<760,count=Math.min(echoes.length,compact?7:10);
  const recent=echoes.slice(-count),travelHeight=Math.max(240,height-150);
  recent.forEach((p,i)=>{
   const t=readTime-p.born,slot=(p.n*.61803398875)%1;
   // Wide, separated ribbons move through depth; the source remains refusal text.
   const y=78+((slot*travelHeight-t*(8+surge*13))%travelHeight+travelHeight)%travelHeight;
   const x=width*(compact?-.07:.1)+Math.sin(t*(.42+intensity*.3)+p.n*1.7)*width*(compact?.23:.29);
   const cut=Math.floor(time*(2.8+surge*2+intensity*2)+p.n),jump=cut%5===0?(cut%3-1)*width*(.16+intensity*.12):0;
   const scale=.9+(p.n%3)*.12+surge*.18,alpha=(.4+surge*.25+intensity*.14)*clamp((18-t)/4,0,1);
   if(alpha<=0)return;
   ctx.save();ctx.translate(x+jump,y);ctx.transform(scale,Math.sin(t*.6+p.n)*.025*intensity,Math.sin(t*.3+p.n)*(.09+intensity*.12),1,0,0);
   const h=p.lines.length*p.size*1.22;
   // Offset copies form a short, visible datamosh wake rather than a wall of type.
   for(let trail=2;trail>=0;trail--){
    ctx.globalAlpha=alpha*(trail===0?1:.1+surge*.05);
    const dx=trail*(10+surge*18+intensity*13),dy=trail*(5+surge*6);
    p.lines.forEach((line,j)=>text(ctx,line,dx,j*p.size*1.22+dy,p.size,p.color,face));
   }
   frameEdges(ctx,{x:-8,y:-8,w:p.w+16,h:h+16,record:p.record},p.color,.32+surge*.22);
   if(cut%3===0){ctx.globalAlpha=.65;ctx.fillStyle=p.color;ctx.fillRect(p.w+12,0,3,3);ctx.fillRect(p.w+12,h,3,3);}
   ctx.restore();
  });
  // A larger refusal crosses the field on cuts, feeding the temporal feedback.
  const pulse=(readTime*.8)%3,large=recent.at(-1);
  if(pulse<.25&&surge>.2){
   ctx.save();ctx.globalAlpha=.12+surge*.1;ctx.translate(-width*.08,height*.68);
   ctx.scale(1.25+surge*.4,1.25+surge*.4);
   text(ctx,large.lines[0],0,0,large.size*1.5,colors.pink,face);ctx.restore();
  }
 }
 function readingSpace(c,x,y,w,h){
  // Feathered contrast behind the readable layer, without blanking the whole scene.
  c.save();const feather=18,g=c.createLinearGradient(0,y-feather,0,y+h+feather);
  g.addColorStop(0,'rgba(5,7,6,0)');g.addColorStop(feather/(h+feather*2),'rgba(5,7,6,.9)');
  g.addColorStop((h+feather)/(h+feather*2),'rgba(5,7,6,.9)');g.addColorStop(1,'rgba(5,7,6,0)');
  c.fillStyle=g;c.fillRect(x-12,y-feather,w+24,h+feather*2);c.restore();
 }
 function background(){
  ctx.fillStyle=colors.black;ctx.fillRect(0,0,width,height);
  refusalTrails();
  // Tracking geometry builds along with the moving refusal ribbons.
  for(const p of remnants){
   if(readTime-p.bornRead>p.life)frameEdges(ctx,p,p.color,.07+finale()*.08);
   if(finale()>.6){
    const phase=Math.floor(time*8+p.n)%5,offset=(phase-2)*12*finale();
    frameEdges(ctx,{...p,x:p.x+offset,y:p.y-offset*.6},p.color,.14*finale());
    if(phase===0){ctx.fillStyle=p.color;ctx.fillRect(p.x,p.y-8,p.w*(.1+finale()*.15),2);}
   }
  }
  for(const p of popups){
   const t=readTime-p.bornRead,gain=finale(),position=tracked(p,p.n);
   frameEdges(ctx,position,p.color,.5);
   if(t<.18||gain>.7){ctx.fillStyle=p.color;for(let i=0;i<4;i++)ctx.fillRect(p.x+p.w+8+(i%2)*7,p.y+((p.n*19+i*37)%Math.max(1,p.h)),3+i%3,2);}
  }
  for(let i=0;i<14;i++){ctx.fillStyle=colors.dim;ctx.fillRect(Math.round(width*(.08+i*.065)),Math.round(height*.28+Math.cos(i*.8+time*.17)*12),2,2);}
  if(!motion.matches){
   const cut=(time+(seed%17)*.1)%6.85;
   if(cut<.12){ctx.fillStyle='rgba(226,232,221,.1)';ctx.fillRect(0,height*.3,width,2+finale()*12);}
  }
 }
 function mainText(c,page,sharp){
  const {w,size,lineHeight}=layout,h=page.lines.length*lineHeight,{x,y}=mainBox();
  if(sharp)readingSpace(c,x,y,w,h);
  c.save();c.shadowColor=colors.black;c.shadowBlur=sharp?18:0;
  page.lines.forEach((value,i)=>text(c,value,x,y+i*lineHeight,size,colors.paper,face));c.restore();
  if(sharp){
   hitBoxes.push({x:x-12,y:y-12,w:w+24,h:h+24,id:current.id});
   const box={x:x-12,y:y-12,w:w+24,h:h+24,record:current,color:colors.sage};
   frameEdges(c,box,colors.sage,.82);trackingLabel(c,box,page.localAge);
  }
  if(sharp&&/tiger/i.test(current.excerpt)){text(c,'🐅',x,y-40,30,colors.paper,face);frameEdges(c,{x:x-12,y:y-12,w:w+24,h:h+24,record:current},colors.sage,.7);}
 }
 function satellites(){
  for(const p of popups){
   const alpha=envelope(readTime-p.bornRead,p.life,preset.fade);
   const position=tracked(p,p.n);
   context.save();context.globalAlpha=alpha;readingSpace(context,position.x,position.y,p.w,p.h);context.restore();
   panel(context,position,alpha);
   if(alpha>.35)hitBoxes.unshift({...position,id:p.record.id});
  }
  trackingLines();
 }
 function render(){
  hitBoxes=[];
  canvas.dataset.frames=String(remnants.length);canvas.dataset.cycle=String(cycle);canvas.dataset.scene=scene.toFixed(2);canvas.dataset.phase=scene<.4?'clear':'build';canvas.dataset.countdown='';canvas.dataset.active=String(popups.length);canvas.dataset.record=current?.id||'';canvas.dataset.echoes=String(echoes.length);
  if(!current||!mosh||!layout||(!motion.matches&&!paused&&scene<.4)){
   context.fillStyle=colors.black;context.fillRect(0,0,width,height);return;
  }
  canvas.dataset.phase='build';
  if(!motion.matches&&ending()){endCut();return;}
  const page=currentPage();
  background();
  const opacity=motion.matches||paused?1:envelope(page.localAge,page.duration,.8);
  context.drawImage(mosh.render(source,motion.matches?0:intensity,time),0,0,width,height);
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
 return {setRecords(next){pool(next);render();},setCurrent(record){current=record;remember(record);seed=Array.from(record.excerpt).reduce((n,c)=>(n*31+c.codePointAt(0))>>>0,7);age=0;arrange();render();},configure(settings){
  const nextMode=settings.mode||'regular';if(nextMode!==mode){mode=nextMode;current=null;layout=null;rotation=createRotation(records,mode);resetScene();}
  canvas.dataset.modeName=mode;preset=presets.overload;intensity=settings.intensity;speed=settings.speed;paused=settings.paused||motion.matches;arrange();render();
 },clear(){resetScene();render();},get paused(){return paused;},get time(){return time;},render};
}
