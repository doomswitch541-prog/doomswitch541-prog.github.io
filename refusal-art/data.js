const published=document.body.dataset.storage==='browser';
let records,settings;
const defaults={preset:'overload',intensity:.4,speed:1,paused:false,motionEdition:'readable-cuts-2'};
export async function request(url,options){
 if(!published){const r=await fetch(url,options),value=await r.json();if(!r.ok)throw Error(value.error||'Request failed');return value;}
 if(!records){
  const r=await fetch('/refusal-art/passages.json');if(!r.ok)throw Error('Could not load passages');records=(await r.json()).records;
  settings={...defaults};try{const saved=JSON.parse(localStorage.getItem('rg-refusal-art')||'{}');for(const key of ['intensity','speed'])if(Number.isFinite(saved[key]))settings[key]=Math.max(key==='speed'?.25:0,Math.min(key==='speed'?2:1,saved[key]));}catch{}
 }
 if(url==='/api/index')return {records,settings,curation:{}};
 if(url.startsWith('/api/record/')){const record=records.find(r=>r.id===url.split('/').pop());if(!record)throw Error('Passage not found');return record;}
 if(url==='/api/settings'){
  const next=JSON.parse(options.body);settings={...settings,intensity:next.intensity,speed:next.speed,paused:next.paused};
  try{localStorage.setItem('rg-refusal-art',JSON.stringify({intensity:settings.intensity,speed:settings.speed}));}catch{}
  return settings;
 }
 throw Error('Unavailable on this page');
}
