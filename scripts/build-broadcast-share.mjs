// Generate the Top 20's static link previews from the live Broadcast renderer.
// Run with Firefox WebDriver BiDi on localhost:9224; no npm install or site build step.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=fs.readFileSync(path.join(root,'js/broadcast.js'),'utf8');
const data=source.slice(source.indexOf('const BEHIND_THE_SCHEMES'),source.indexOf('const PERSONAL_STATION_UUIDS'));
const stations=JSON.parse(vm.runInNewContext(data+';JSON.stringify(CURATED_TOP_STATIONS)',{}, {timeout:1000}));
if(stations.length!==20||new Set(stations.map(s=>s.stationuuid)).size!==20)throw Error('Expected 20 unique curated stations');
const shareDir=path.join(root,'music/broadcast/share');
fs.mkdirSync(shareDir,{recursive:true});
const html=`<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;overflow:hidden;background:#090c0d}#broadcast-stars{position:fixed;inset:0;width:100%;height:100%}
#station-field{position:fixed;inset:0;pointer-events:none}#station-beacon{position:absolute;left:660px;top:-15px;width:450px;height:450px}
.field-readout{position:fixed;left:-10000px;width:300px;height:80px}
</style></head><body><canvas id="broadcast-stars"></canvas><div id="station-field" data-space="full"><div id="station-beacon"></div><div class="field-readout"></div></div>
<script type="module">import {createBroadcastSky} from '/js/broadcast-sky.js';
createBroadcastSky({getFrame:()=>({state:'idle',mode:'receiver-state'}),getCarMode:()=>true,reduced:{matches:true,addEventListener(){},removeEventListener(){}}});</script></body></html>`;
const server=http.createServer((req,res)=>{
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(pathname==='/_share-art'){res.setHeader('Content-Type','text/html');res.end(html);return;}
    const target=path.resolve(root,'.'+pathname);
    if(!target.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
    try{res.setHeader('Content-Type',path.extname(target)==='.js'?'text/javascript':'application/octet-stream');res.end(fs.readFileSync(target));}
    catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(4180,'127.0.0.1',resolve));
const socket=new WebSocket(process.env.BROADCAST_BIDI_URL||'ws://127.0.0.1:9224/session');
let id=0,context,started=false;
const pending=new Map();
socket.onmessage=({data})=>{
    const m=JSON.parse(data),p=pending.get(m.id);if(!p)return;
    clearTimeout(p.timer);pending.delete(m.id);
    m.type==='error'?p.reject(new Error(m.message)):p.resolve(m.result);
};
function send(method,params={}){return new Promise((resolve,reject)=>{
    const next=++id;const timer=setTimeout(()=>{pending.delete(next);reject(new Error(method+' timed out'));},20000);
    pending.set(next,{resolve,reject,timer});socket.send(JSON.stringify({id:next,method,params}));
});}
async function evaluate(expression){const r=await send('script.evaluate',{expression,target:{context},awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text);return r.result.value;}
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
try{
    await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
    await send('session.new',{capabilities:{alwaysMatch:{browserName:'firefox'}}});started=true;
    context=(await send('browsingContext.getTree')).contexts[0].context;
    await send('browsingContext.setViewport',{context,viewport:{width:1200,height:630},devicePixelRatio:1});
    await send('network.setCacheBehavior',{cacheBehavior:'bypass',contexts:[context]});
    await send('browsingContext.navigate',{context,url:'http://127.0.0.1:4180/_share-art',wait:'complete'});
    await evaluate('new Promise(r=>setTimeout(r,600))');
    if(!await evaluate("document.body.dataset.sky==='ready'"))throw Error('Three.js share art did not render');
    const {data:base}=await send('browsingContext.captureScreenshot',{context,origin:'viewport'});
    await evaluate(`(async()=>{window.shareArt=new Image();shareArt.src=${JSON.stringify('data:image/png;base64,'+base)};await shareArt.decode();})()`);
    const template=fs.readFileSync(path.join(root,'music/broadcast/index.html'),'utf8');
    for(const station of [{stationuuid:'galaxy-radio',name:'RG Broadcast',description:'Live internet radio, under the stars.'},...stations]){
        if(!/^[a-zA-Z0-9-]+$/.test(station.stationuuid))throw Error('Invalid station path');
        const png=await evaluate(`(()=>{
            const station=${JSON.stringify(station)};
            const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=630;
            const c=canvas.getContext('2d');c.drawImage(shareArt,0,0);
            const shade=c.createLinearGradient(0,0,920,0);shade.addColorStop(0,'#090c0d');shade.addColorStop(.62,'rgba(9,12,13,.96)');shade.addColorStop(1,'rgba(9,12,13,0)');c.fillStyle=shade;c.fillRect(0,0,1200,630);
            c.fillStyle='#a7cbbd';c.font='500 25px system-ui';c.fillText('RG Broadcast',64,88);
            function lines(text,width,max){const words=text.split(/\\s+/),result=[];let line='';for(const word of words){const next=line?line+' '+word:word;if(line&&c.measureText(next).width>width){result.push(line);line=word;}else line=next;}if(line)result.push(line);if(result.length>max){result.length=max;let last=result[max-1];while(last&&c.measureText(last+'…').width>width)last=last.slice(0,-1);result[max-1]=last+'…';}return result;}
            c.fillStyle='#e5eee9';c.font='500 59px system-ui';const title=lines(station.name,650,3);title.forEach((line,i)=>c.fillText(line,60,240+i*70));
            c.fillStyle='#a9b7b2';c.font='400 24px system-ui';lines(station.description,620,2).forEach((line,i)=>c.fillText(line,64,460+i*34));
            c.fillStyle='#b4ded0';c.font='500 21px system-ui';c.fillText('Listen on RG Broadcast',64,571);
            return canvas.toDataURL('image/png').split(',')[1];
        })()`);
        fs.writeFileSync(path.join(shareDir,station.stationuuid+'.png'),Buffer.from(png,'base64'));
        if(station.stationuuid==='galaxy-radio')continue;
        const url='https://doomswitch541-prog.github.io/music/broadcast/stations/'+station.stationuuid+'/';
        const title=escape(station.name+' | RG Broadcast'),description=escape(station.description);
        const page=template.replace(/<title>.*?<\/title>/,`<title>${title}</title>`)
            .replace(/(<meta property="og:title" content=")[^"]*/,`$1${title}`)
            .replace(/(<meta (?:property="og:description"|name="description") content=")[^"]*/g,`$1${description}`)
            .replace(/(<meta property="og:url" content=")[^"]*/,`$1${url}`)
            .replace('/share/galaxy-radio.png','/share/'+station.stationuuid+'.png');
        const dir=path.join(root,'music/broadcast/stations',station.stationuuid);
        fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'index.html'),page);
    }
    console.log('Built 20 station link pages, 20 matching galaxy cards, and the Broadcast cover.');
}finally{if(started)await send('session.end').catch(()=>{});socket.close();server.close();}
