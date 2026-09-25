// Block-matched motion carries pixels from the previous output into the next frame.
// This is temporal feedback, not codec corruption or a claim of semantic object detection.
export function createMosh(width,height){
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
 const gl=canvas.getContext('webgl',{alpha:false,preserveDrawingBuffer:true});if(!gl)return {canvas:null,render:source=>source,reset(){},dispose(){}};
 const vertex='attribute vec2 position; varying vec2 uv; void main(){uv=position*.5+.5;gl_Position=vec4(position,0.,1.);}';
 const fragment=`precision highp float;
 varying vec2 uv;uniform sampler2D currentFrame,historyFrame,motion;uniform float carry,time,fresh;uniform vec2 resolution;
 float noise(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
 void main(){
   vec3 now=texture2D(currentFrame,uv).rgb;
   vec4 vector=texture2D(motion,vec2(uv.x,1.-uv.y));
   vec2 flow=(vector.rg-.5)*8.*vec2(1./64.,-1./36.);
   vec2 cell=floor(uv*vec2(64.,36.));float gate=step(.65,noise(cell+floor(time*.35)));
   flow+=vec2(sin(cell.y*.51+time*.17),cos(cell.x*.31+time*.13))*.004*carry*gate;
   vec2 prior=clamp(uv+flow*carry*.65,vec2(0.),vec2(1.));
   vec3 held=texture2D(historyFrame,prior).rgb;
   float retention=carry*(.82+.06*gate)*(1.-fresh);
   vec3 color=mix(now,held,retention);
   float edges=length(now-texture2D(currentFrame,uv+vec2(2./resolution.x,0.)).rgb);
   color.r=mix(color.r,texture2D(historyFrame,prior+vec2(.003*carry,0.)).r,edges*carry*.38);
   color.b=mix(color.b,texture2D(historyFrame,prior-vec2(.002*carry,0.)).b,edges*carry*.32);
   color+=vec3(noise(gl_FragCoord.xy+floor(time*12.))-.5)*.018;
   gl_FragColor=vec4(max(vec3(0.),color),1.);
 }`;
 function program(v,f){const p=gl.createProgram();for(const [type,source] of [[gl.VERTEX_SHADER,v],[gl.FRAGMENT_SHADER,f]]){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));gl.attachShader(p,s);}gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));return p;}
 const effect=program(vertex,fragment),copy=program(vertex,'precision mediump float;varying vec2 uv;uniform sampler2D currentFrame;void main(){gl_FragColor=texture2D(currentFrame,uv);}');
 const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
 function texture(w,h,nearest=false){const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,nearest?gl.NEAREST:gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,nearest?gl.NEAREST:gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);return t;}
 const current=texture(width,height),flow=texture(64,36,true),history=[texture(width,height),texture(width,height)];
 const frames=history.map(t=>{const f=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,f);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,t,0);return f;});
 const sample=document.createElement('canvas');sample.width=64;sample.height=36;const ctx=sample.getContext('2d',{willReadFrequently:true}),vectors=new Uint8Array(64*36*4);let previous=null,index=0,fresh=1;
 function bind(p,name,t,unit){gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,t);gl.uniform1i(gl.getUniformLocation(p,name),unit);}
 function draw(p){gl.useProgram(p);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);const loc=gl.getAttribLocation(p,'position');gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);}
 function render(source,carry,time){
  ctx.drawImage(source,0,0,64,36);const pixels=ctx.getImageData(0,0,64,36).data;
  for(let y=0;y<36;y++)for(let x=0;x<64;x++){const k=(y*64+x)*4;let dx=0,dy=0,best=1e9;
   if(previous){best=Math.abs(pixels[k]-previous[k])+Math.abs(pixels[k+1]-previous[k+1])+Math.abs(pixels[k+2]-previous[k+2]);
    if(best>18)for(let yy=-3;yy<=3;yy++)for(let xx=-3;xx<=3;xx++){const px=x+xx,py=y+yy;if(px<0||px>63||py<0||py>35)continue;const j=(py*64+px)*4;const error=Math.abs(pixels[k]-previous[j])+Math.abs(pixels[k+1]-previous[j+1])+Math.abs(pixels[k+2]-previous[j+2])+Math.hypot(xx,yy)*2;if(error<best){best=error;dx=xx;dy=yy;}}
   }vectors[k]=Math.round(127.5+dx/8*255);vectors[k+1]=Math.round(127.5+dy/8*255);vectors[k+2]=Math.min(255,best);vectors[k+3]=255;
  }previous=new Uint8ClampedArray(pixels);
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,current);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);
  gl.bindTexture(gl.TEXTURE_2D,flow);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,64,36,0,gl.RGBA,gl.UNSIGNED_BYTE,vectors);
  draw(effect);gl.bindFramebuffer(gl.FRAMEBUFFER,frames[1-index]);gl.viewport(0,0,width,height);bind(effect,'currentFrame',current,0);bind(effect,'historyFrame',history[index],1);bind(effect,'motion',flow,2);gl.uniform1f(gl.getUniformLocation(effect,'carry'),carry);gl.uniform1f(gl.getUniformLocation(effect,'time'),time);gl.uniform1f(gl.getUniformLocation(effect,'fresh'),fresh);gl.uniform2f(gl.getUniformLocation(effect,'resolution'),width,height);gl.drawArrays(gl.TRIANGLES,0,6);
  index=1-index;draw(copy);gl.bindFramebuffer(gl.FRAMEBUFFER,null);bind(copy,'currentFrame',history[index],0);gl.drawArrays(gl.TRIANGLES,0,6);fresh=0;return canvas;
 }
 return {canvas,render,reset(){fresh=1;previous=null;},dispose(){gl.getExtension('WEBGL_lose_context')?.loseContext();}};
}
