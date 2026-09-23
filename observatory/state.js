export const STORAGE_KEY = 'rghq:observatory:v1';
export const OBJECTS = [
  { id:'lamp', name:'Arc lamp', surface:'floor', x:-2.65, z:-1.1, rotation:0, radius:.38 },
  { id:'ink', name:'Ink vessel', surface:'plinth', x:-.6, z:.35, rotation:0, radius:.26 },
  { id:'prism', name:'Prism', surface:'plinth', x:.65, z:.65, rotation:.4, radius:.24 },
  { id:'ring', name:'Ring sculpture', surface:'floor', x:2.65, z:-.5, rotation:-.35, radius:.45 },
  { id:'stone', name:'River stone', surface:'plinth', x:.65, z:-.4, rotation:0, radius:.28 },
  { id:'steps', name:'Folded piece', surface:'plinth', x:-.4, z:-.65, rotation:.5, radius:.25 }
];
export const INITIAL_CAMERA = { azimuth:.33, polar:1.05, distance:12.5 };
export const clone = value => JSON.parse(JSON.stringify(value));
export function constrain(id, x, z) {
  const spec = OBJECTS.find(object => object.id === id);
  if (!spec) throw Error('Unknown room object.');
  const radius = (spec.surface === 'plinth' ? 1.45 : 3.55) - spec.radius;
  const length = Math.hypot(x,z), scale = length > radius ? radius / length : 1;
  return {x:x*scale,z:z*scale};
}
export function initialState() { return {version:1,objects:Object.fromEntries(OBJECTS.map(o=>[o.id,{x:o.x,z:o.z,rotation:o.rotation}])),lampOn:true,notes:[],camera:{...INITIAL_CAMERA}}; }
const finite = value => typeof value === 'number' && Number.isFinite(value);
export function validateState(input) {
  if (!input || input.version !== 1 || !input.objects || typeof input.lampOn !== 'boolean' || !Array.isArray(input.notes) || input.notes.length > 80) throw Error('This is not a supported Observatory arrangement.');
  const result = initialState();
  for (const spec of OBJECTS) {
    const item = input.objects[spec.id];
    if (!item || ![item.x,item.z,item.rotation].every(finite)) throw Error('An object has invalid coordinates.');
    result.objects[spec.id] = {...constrain(spec.id,item.x,item.z),rotation:Math.atan2(Math.sin(item.rotation),Math.cos(item.rotation))};
  }
  const ids = new Set();
  result.notes = input.notes.map(note => {
    if (!note || typeof note.id !== 'string' || !/^[\w-]{1,80}$/.test(note.id) || ids.has(note.id) || typeof note.text !== 'string' || !note.text.trim() || note.text.length > 500 || !['wall',...OBJECTS.map(o=>o.id)].includes(note.anchor) || !finite(note.x) || !finite(note.y)) throw Error('A note has invalid content or placement.');
    ids.add(note.id);
    return {id:note.id,text:note.text,anchor:note.anchor,x:Math.max(-1.1,Math.min(1.1,note.x)),y:Math.max(.9,Math.min(2.1,note.y))};
  });
  result.lampOn = input.lampOn;
  if (!input.camera || ![input.camera.azimuth,input.camera.polar,input.camera.distance].every(finite)) throw Error('The saved view is invalid.');
  result.camera = {azimuth:Math.max(-.75,Math.min(.75,input.camera.azimuth)),polar:Math.max(.7,Math.min(1.28,input.camera.polar)),distance:Math.max(8,Math.min(17,input.camera.distance))};
  return result;
}
// The scene consumes only read/update/subscribe. A future room transport can replace this adapter.
export function createRoomStore(storage, report = () => {}) {
  let state = initialState(), timer, blocked = false;
  const listeners = new Set();
  try { const saved=storage.getItem(STORAGE_KEY); if(saved) state=validateState(JSON.parse(saved)); }
  catch { blocked=true; report('Saved room could not be read. Export changes to keep them.'); }
  function flush() {
    clearTimeout(timer);
    if(blocked){report('Changes in memory · export to keep a copy');return;}
    try { storage.setItem(STORAGE_KEY,JSON.stringify(state)); report('Saved in this browser'); }
    catch { report('Changes in memory · export to keep a copy'); }
  }
  function publish() { listeners.forEach(listener=>listener(clone(state))); clearTimeout(timer); timer=setTimeout(flush,250); }
  return {
    read:()=>clone(state),
    update(mutator){const next=clone(state);mutator(next);state=validateState(next);publish();},
    replace(next){state=validateState(next);blocked=false;publish();flush();},
    subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},
    flush
  };
}
