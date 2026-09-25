export const isDan=r=>/Normal Output|Developer Mode Output|CLASSIC|\bDAN\b|Developer Mode/i.test(r.excerpt);
export const isGrounding=r=>/ground|breath|outside the screen|feet on|five things/i.test(r.excerpt);
export const isPaternal=r=>/frustrat|feeling|feel |feels|defensive|angry|fed up|intensity|exhaustion|emotions|emotional|for you|you’re capable|you.re clearly capable|your experience|real and solid|blur reality/i.test(r.excerpt);
export const isHedge=r=>/important|careful|gently|need to|have to|however|grounded|sensitivity|nuance|respectful|constructive|clarify|clear and|positive and uplifting|without lecturing|without flattening/i.test(r.excerpt);
export const isTone=r=>isPaternal(r)||isHedge(r);
const shuffle=rows=>{const a=[...rows];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
export function createRotation(records){
 const pools={paternal:records.filter(isPaternal),hedge:records.filter(isHedge),dan:records.filter(isDan),tiger:records.filter(r=>/tiger/i.test(r.excerpt)),generic:records.filter(r=>!isDan(r)&&/sorry|cannot|can.t|won.t/i.test(r.excerpt)&&r.excerpt.length<150),all:records};
 const order=['paternal','hedge','generic','paternal','dan','hedge','paternal','tiger','hedge','generic','paternal','all'],bags={};let step=0,recent=[];
 return {next(){
  const preferred=order[step++%order.length],key=pools[preferred].length?preferred:'all';
  if(!pools[key].length)return null;
  if(!bags[key]?.length)bags[key]=shuffle(pools[key]);
  const fresh=bags[key].findIndex(r=>!recent.includes(r.id));
  const r=bags[key].splice(fresh<0?0:fresh,1)[0];recent=[...recent.slice(-7),r.id];return r;
 }};
}
