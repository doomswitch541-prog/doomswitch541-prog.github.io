import {createField} from '/refusal-art/field.js';
import {presets} from '/refusal-art/presets.js';
import {createRotation} from '/refusal-art/rotation.js';
import {request} from '/refusal-art/data.js';
const $=s=>document.querySelector(s),reader=$('#reader');
let data,field,selected,rotation,saveTimer,wasPaused=false,reading=0;
function save(){clearTimeout(saveTimer);saveTimer=setTimeout(async()=>{try{await request('/api/settings',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(data.settings)});}catch{$('#status').textContent='Settings could not save.';}},350);}
function choose(record){if(!record)return;selected=record.id;data.settings.selected=selected;field.setCurrent(record);save();}
function next(){choose(rotation.next());}
function syncPlay(){$('#play').textContent=field.paused?'Play':'Pause';}
function pause(value){data.settings.paused=value;field.configure(data.settings);syncPlay();save();}
async function open(id){
 if(!id||reader.open)return;const ticket=++reading;
 try{const record=await request('/api/record/'+id);if(ticket!==reading)return;$('#message-text').textContent=record.excerpt;wasPaused=field.paused;pause(true);reader.showModal();}
 catch(error){$('#status').textContent=error.message;}
}
try{
 data=await request('/api/index');
 const records=data.records.filter(r=>data.curation[r.id]!=='exclude');rotation=createRotation(records);
 if(data.settings.motionEdition!=='readable-cuts-2')Object.assign(data.settings,{intensity:Math.min(data.settings.intensity,.4),speed:Math.min(data.settings.speed,1),motionEdition:'readable-cuts-2'});
 field=await createField($('#field'),{onAdvance:next,onPick:open});field.configure(data.settings);field.setRecords(records);next();syncPlay();
 for(const key of ['intensity','speed'])$('#'+key).value=data.settings[key];
 for(const [key,preset] of Object.entries(presets)){
  const button=document.querySelector('[data-preset="'+key+'"]');button.setAttribute('aria-pressed',String(data.settings.preset===key));
  button.onclick=()=>{Object.assign(data.settings,{preset:key,intensity:preset.intensity,speed:preset.speed});field.configure(data.settings);for(const k of ['intensity','speed'])$('#'+k).value=data.settings[k];for(const b of document.querySelectorAll('[data-preset]'))b.setAttribute('aria-pressed',String(b===button));save();};
 }
 document.body.dataset.ready='true';
}catch(error){$('#status').textContent='Could not open the piece: '+error.message;console.error(error);}
$('#next').onclick=next;$('#clear').onclick=()=>field.clear();$('#play').onclick=()=>pause(!field.paused);$('#inspect').onclick=()=>open(selected);
$('#close-reader').onclick=()=>reader.close();
reader.addEventListener('click',event=>{if(event.target===reader){const r=reader.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)reader.close();}});
reader.addEventListener('close',()=>{pause(wasPaused);$('#inspect').focus({preventScroll:true});});
document.addEventListener('keydown',event=>{if(event.code==='Space'&&event.target===document.body){event.preventDefault();$('#play').click();}});
for(const key of ['intensity','speed'])$('#'+key).oninput=event=>{data.settings[key]=Number(event.target.value);field.configure(data.settings);save();};
$('#record').onclick=async()=>{
 const button=$('#record');if(!window.MediaRecorder||!$('#field').captureStream){$('#status').textContent='Recording is unavailable in this browser.';return;}
 button.disabled=true;const stream=$('#field').captureStream(24),chunks=[];
 try{
  const type=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(t=>MediaRecorder.isTypeSupported(t));const recorder=new MediaRecorder(stream,type?{mimeType:type,videoBitsPerSecond:5500000}:undefined);
  recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};const stopped=new Promise((resolve,reject)=>{recorder.onstop=resolve;recorder.onerror=reject;});
  recorder.start();button.textContent='Recording…';await new Promise(r=>setTimeout(r,12000));recorder.stop();await stopped;
  const result=await request('/api/capture',{method:'POST',headers:{'content-type':'video/webm'},body:new Blob(chunks,{type:'video/webm'})});const link=document.createElement('a');link.href=result.url;link.textContent='Open clip';link.target='_blank';link.rel='noopener';$('#status').replaceChildren(link);
 }catch(error){$('#status').textContent='Capture failed: '+error.message;}
 finally{stream.getTracks().forEach(track=>track.stop());button.disabled=false;button.textContent='Record 12s';}
};
