import {OBJECTS,INITIAL_CAMERA,createRoomStore,constrain,validateState} from './state.js';
import {createScene} from './scene.js';
const $=selector=>document.querySelector(selector),canvas=$('#room');
let selected=null,editing=null,scene=null,storage;
try{storage=window.localStorage;}catch{storage={getItem(){throw Error('Storage unavailable');},setItem(){throw Error('Storage unavailable');}};}
const store=createRoomStore(storage,message=>{$('#storage-status').textContent=message;});
function panel(id){for(const el of document.querySelectorAll('.room-panel'))el.hidden=el.id!==id;}
function select(id,open=false){selected=id;scene?.select(id);$('#object-controls').hidden=!id;for(const btn of $('#object-list').children)btn.setAttribute('aria-pressed',String(btn.dataset.object===id));if(!id)return;const spec=OBJECTS.find(o=>o.id===id);$('#selected-name').textContent=spec.name;$('#room-caption').textContent=spec.id==='lamp'?'Click the lamp to change the light.':spec.name+' · drag to find its place.';$('#toggle-lamp').hidden=id!=='lamp';if(open)panel('object-panel');}
function move(id,position){store.update(next=>{Object.assign(next.objects[id],position);});}
function moveSelected(x,z){if(!selected)return;const item=store.read().objects[selected];move(selected,constrain(selected,item.x+x,item.z+z));}
function rotate(amount){if(selected)store.update(next=>{next.objects[selected].rotation+=amount;});}
function toggleLamp(){store.update(next=>{next.lampOn=!next.lampOn;});}
for(const spec of OBJECTS){const btn=document.createElement('button');btn.textContent=spec.name;btn.dataset.object=spec.id;btn.setAttribute('aria-pressed','false');btn.onclick=()=>select(spec.id);$('#object-list').append(btn);const option=document.createElement('option');option.value=spec.id;option.textContent=spec.name;$('#note-anchor').append(option);}
function fallback(message){canvas.hidden=true;$('#note-markers').hidden=true;$('#render-status').hidden=false;$('#render-status').textContent=message;panel('object-panel');$('#room-caption').textContent='Objects and notes are available in the panel.';}
try{scene=createScene(canvas,{onSelect:select,onMove:move,onCamera:camera=>store.update(next=>{next.camera=camera;}),onLamp:toggleLamp,onNoteMove:(id,x,y)=>store.update(next=>{const note=next.notes.find(n=>n.id===id);if(note){note.x=x;note.y=y;}})});$('#render-status').hidden=true;}
catch(error){fallback('3D is unavailable here. Use Objects to arrange the room and edit notes.');console.warn('Observatory renderer:',error.message);}
canvas.addEventListener('room-render-failed',()=>fallback('The 3D view paused. Your arrangement is still available in Objects.'));
canvas.addEventListener('room-render-restored',()=>{canvas.hidden=false;$('#note-markers').hidden=false;$('#render-status').hidden=true;});
const markers=new Map();let noteSignature='';
function renderNotes(notes){
  const signature=JSON.stringify(notes.map(n=>({id:n.id,text:n.text,anchor:n.anchor})));
  if(signature===noteSignature)return;noteSignature=signature;
  for(const [id,element] of markers)if(!notes.some(note=>note.id===id)){element.remove();markers.delete(id);}
  $('#notes-list').replaceChildren();
  if(!notes.length){const p=document.createElement('p');p.textContent='Nothing left here yet.';$('#notes-list').append(p);}
  notes.forEach((note,index)=>{
    let marker=markers.get(note.id);if(!marker){marker=document.createElement('button');marker.className='note-marker';marker.dataset.note=note.id;marker.onclick=()=>{if(marker.dataset.dragged){delete marker.dataset.dragged;return;}openNote(note.id);};$('#note-markers').append(marker);markers.set(note.id,marker);}
    marker.textContent=String(index+1).padStart(2,'0');marker.setAttribute('aria-label','Read note: '+note.text.slice(0,70));marker.title=note.anchor==='wall'?'Read note · drag to move':'Read attached note';
    const row=document.createElement('button');row.textContent=note.text;row.onclick=()=>openNote(note.id);$('#notes-list').append(row);
  });scene?.setMarkers(markers);
}
function apply(state){scene?.apply(state);renderNotes(state.notes);$('#toggle-lamp').textContent=state.lampOn?'Turn lamp off':'Turn lamp on';}
store.subscribe(apply);apply(store.read());scene?.restoreCamera(store.read().camera);
$('#open-objects').onclick=()=>{if($('#object-panel').hidden)panel('object-panel');else $('#object-panel').hidden=true;};
$('#open-saves').onclick=()=>panel('save-panel');
for(const btn of document.querySelectorAll('[data-close]'))btn.onclick=()=>{$('#'+btn.dataset.close).hidden=true;};
for(const btn of document.querySelectorAll('[data-move]'))btn.onclick=()=>moveSelected(...btn.dataset.move.split(',').map(Number));
for(const btn of document.querySelectorAll('[data-rotate]'))btn.onclick=()=>rotate(Number(btn.dataset.rotate));
$('#home-object').onclick=()=>{if(!selected)return;const spec=OBJECTS.find(o=>o.id===selected);store.update(next=>{next.objects[selected]={x:spec.x,z:spec.z,rotation:spec.rotation};});};
$('#toggle-lamp').onclick=toggleLamp;
$('#reset-view').onclick=()=>{scene?.restoreCamera(INITIAL_CAMERA);store.update(next=>{next.camera={...INITIAL_CAMERA};});};
canvas.addEventListener('keydown',event=>{const moves={ArrowLeft:[-.16,0],ArrowRight:[.16,0],ArrowUp:[0,-.16],ArrowDown:[0,.16]};if(selected&&moves[event.key]){event.preventDefault();moveSelected(...moves[event.key]);}else if(selected&&['[',']'].includes(event.key)){event.preventDefault();rotate(event.key==='['?-.15:.15);}else if(event.key==='Escape'){select(null);} });
function openNote(id=null,anchor=selected||'wall'){
  const state=store.read(),note=state.notes.find(n=>n.id===id);if(!note&&state.notes.length>=80){$('#room-caption').textContent='The room has 80 notes. Edit or remove one to make space.';return;}
  editing=note?.id||null;$('#note-title').textContent=note?'A note in the room':'Leave a note';$('#note-text').value=note?.text||'';$('#note-anchor').value=note?.anchor||anchor;$('#remove-note').hidden=!note;count();$('#note-editor').showModal();$('#note-text').focus();
}
function count(){$('#note-count').textContent=$('#note-text').value.length+' / 500';}
$('#note-text').addEventListener('input',count);$('#add-note').onclick=()=>openNote();$('#note-object').onclick=()=>openNote();
$('#note-form').addEventListener('submit',event=>{
  if(event.submitter?.value==='cancel')return;event.preventDefault();const text=$('#note-text').value.trim();if(!text)return;
  const anchor=$('#note-anchor').value;store.update(next=>{const note=next.notes.find(n=>n.id===editing);if(note){note.text=text;note.anchor=anchor;}else{const i=next.notes.length;next.notes.push({id:crypto.randomUUID(),text,anchor,x:((i%5)-2)*.4,y:1.9-Math.floor(i%15/5)*.32});}});$('#note-editor').close();
});
$('#remove-note').onclick=()=>{if(!editing||!confirm('Remove this note from the room?'))return;store.update(next=>{next.notes=next.notes.filter(n=>n.id!==editing);});$('#note-editor').close();};
$('#export-room').onclick=()=>{store.flush();const blob=new Blob([JSON.stringify(store.read(),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='observatory-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('#import-room').addEventListener('change',async event=>{
  const file=event.target.files[0];if(!file)return;try{if(file.size>150000)throw Error('This file is too large for an Observatory arrangement.');const imported=validateState(JSON.parse(await file.text()));if(!confirm('Replace this browser’s arrangement with the imported copy?'))return;store.replace(imported);scene?.restoreCamera(imported.camera);$('#import-status').textContent='Arrangement restored.';}catch(error){$('#import-status').textContent=error instanceof SyntaxError?'That file is not valid JSON.':error.message;}finally{event.target.value='';}
});
document.addEventListener('visibilitychange',()=>{if(document.hidden)store.flush();});window.addEventListener('pagehide',()=>store.flush());
