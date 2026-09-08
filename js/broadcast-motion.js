// Optional physical-device parallax. No location, camera, storage or network access.
export function createSkyOrientation({reduced}) {
    const button=document.getElementById('sky-motion');
    const label=document.getElementById('sky-motion-state');
    let enabled=false,pending=false,origin=null;
    const target={x:0,y:0},current={x:0,y:0};
    const limit=value=>Math.max(-1,Math.min(1,value));
    const delta=(value,base)=>((value-base+540)%360)-180;
    function reset(){origin=null;target.x=target.y=current.x=current.y=0;}
    function receive(event){
        if(!enabled||reduced.matches||document.hidden||!Number.isFinite(event.beta)||!Number.isFinite(event.gamma))return;
        if(!origin)origin={beta:event.beta,gamma:event.gamma};
        const angle=(screen.orientation?.angle||window.orientation||0)*Math.PI/180;
        const x=limit(delta(event.gamma,origin.gamma)/35),y=limit(delta(event.beta,origin.beta)/35);
        target.x=(x*Math.cos(angle)+y*Math.sin(angle))*.025;
        target.y=(y*Math.cos(angle)-x*Math.sin(angle))*.025;
    }
    function sync(){
        button?.setAttribute('aria-pressed',String(enabled));
        if(label)label.textContent=enabled?'On':'Off';
        if(button)button.disabled=pending||reduced.matches;
    }
    function stop(){enabled=false;window.removeEventListener('deviceorientation',receive);reset();sync();}
    async function toggle(){
        if(enabled){stop();return;}
        if(pending||reduced.matches)return;
        pending=true;sync();
        try {
            const api=window.DeviceOrientationEvent;
            if(typeof api.requestPermission==='function' && await api.requestPermission()!=='granted'){
                label.textContent='Not allowed';return;
            }
            enabled=true;reset();window.addEventListener('deviceorientation',receive,{passive:true});
            label.textContent='On';button.setAttribute('aria-pressed','true');
        }catch{label.textContent='Unavailable';}
        finally{pending=false;button.disabled=reduced.matches;}
    }
    function visibility(){
        window.removeEventListener('deviceorientation',receive);reset();
        if(enabled&&!document.hidden)window.addEventListener('deviceorientation',receive,{passive:true});
    }
    function preference(){if(reduced.matches)stop();sync();}
    if(button&&label&&window.DeviceOrientationEvent){button.hidden=false;button.addEventListener('click',toggle);sync();}
    document.addEventListener('visibilitychange',visibility);
    reduced.addEventListener('change',preference);
    return {
        sample(dt){
            const amount=1-Math.exp(-dt*3);
            current.x+=(target.x-current.x)*amount;current.y+=(target.y-current.y)*amount;
            return current;
        },
        dispose(){stop();button?.removeEventListener('click',toggle);document.removeEventListener('visibilitychange',visibility);reduced.removeEventListener('change',preference);}
    };
}
