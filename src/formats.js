// Files the browser can't show by itself (PDF, PSD, RAW, fonts, audio, 3D, design apps' files…) are turned into a picture
// on this device. Decoders load only when a file of that kind is first shown.

const RAW=["cr2","cr3","crw","nef","nrw","arw","srf","sr2","dng","raf","orf","rw2","pef","srw","x3f","3fr","erf","kdc","mrw","mos","iiq","rwl","dcr"];
const PACK=["sketch","xd","fig","kra","ora","procreate","key","pages","numbers","xmind","cdr","afdesign","afphoto","afpub","clip","indd","psb","xcf","c4d","blend","skp","cdx"];
const OFFICE=["doc","docx","docm","rtf","odt","ppt","pptx","pptm","pps","ppsx","ppsm","odp","eps"];
const FMT={pdf:"pdf",ai:"pdf",psd:"psd",psb:"psd",tif:"tiff",tiff:"tiff",heic:"heic",heif:"heic",tga:"tga",
  ttf:"font",otf:"font",woff:"font",woff2:"font",
  mp3:"audio",wav:"audio",flac:"audio",m4a:"audio",aac:"audio",ogg:"audio",oga:"audio",opus:"audio",aif:"audio",aiff:"audio",
  glb:"model",gltf:"model",obj:"model",stl:"model",fbx:"model",dae:"model",ply:"model",
  xls:"sheet",xlsx:"sheet",xlsm:"sheet",ods:"sheet"};
RAW.forEach(e=>FMT[e]="raw");PACK.forEach(e=>FMT[e]??="pack");OFFICE.forEach(e=>FMT[e]="office");
export const fmtOf=ext=>FMT[ext]||null;
// Dropbox's own thumbnail is tried first for these; the rest are always made here.
export const dropboxFirst=f=>f!=="font"&&f!=="audio"&&f!=="model"&&f!=="sheet";

const css=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const canvas=(w,h)=>Object.assign(document.createElement("canvas"),{width:Math.max(1,Math.round(w)),height:Math.max(1,Math.round(h))});
// Longest side at most `max`, and no more than 16M pixels (iOS canvas limit).
const fit=(w,h,max)=>Math.min(max/Math.max(w,h),Math.sqrt(16e6/(w*h)));
function scaled(src,w,h,max){const k=Math.min(1,fit(w,h,max));const c=canvas(w*k,h*k);c.getContext("2d").drawImage(src,0,0,c.width,c.height);return c}

/* ---------- raster ---------- */
async function bitmap(blob){try{return await createImageBitmap(blob)}catch(e){return null}}
async function pdfjs(){
  const lib=await import("pdfjs-dist/legacy/build/pdf.mjs");
  lib.GlobalWorkerOptions.workerSrc||=(await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url")).default;
  return lib;
}
const PDF_DIR=import.meta.env.DEV?"/node_modules/pdfjs-dist/":"/pdfjs/";
export async function pdfOpen(blob){
  const lib=await pdfjs();
  const t=lib.getDocument({data:new Uint8Array(await blob.arrayBuffer()),isEvalSupported:false,
    cMapUrl:PDF_DIR+"cmaps/",standardFontDataUrl:PDF_DIR+"standard_fonts/",wasmUrl:PDF_DIR+"wasm/",iccUrl:PDF_DIR+"iccs/"});
  const doc=await t.promise;doc.close=()=>t.destroy();return doc;
}
export async function pdfPage(doc,n,max){
  const p=await doc.getPage(n),v=p.getViewport({scale:1}),vp=p.getViewport({scale:fit(v.width,v.height,max)});
  const c=canvas(vp.width,vp.height);await p.render({canvas:c,viewport:vp}).promise;p.cleanup();return c;
}
async function psd(blob){
  const {readPsd}=await import("ag-psd");
  const d=readPsd(await blob.arrayBuffer(),{skipLayerImageData:true,skipThumbnail:false});
  return d.canvas&&d.canvas.width?d.canvas:d.imageResources?.thumbnail||null;
}
async function tiff(blob){
  const b=await bitmap(blob);if(b)return b;
  const U=(await import("utif2")).default,buf=await blob.arrayBuffer(),ifds=U.decode(buf);
  const ifd=ifds.filter(i=>i.t256).sort((a,b)=>b.t256[0]*(b.t257?.[0]||1)-a.t256[0]*(a.t257?.[0]||1))[0];if(!ifd)return null;
  U.decodeImage(buf,ifd);const c=canvas(ifd.width,ifd.height);c.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(U.toRGBA8(ifd).buffer),ifd.width,ifd.height),0,0);return c;
}
async function heic(blob){
  const b=await bitmap(blob);if(b)return b;
  const {heicTo}=await import("heic-to/csp");return heicTo({blob,type:"bitmap"});
}
async function tga(blob){
  const u=new Uint8Array(await blob.arrayBuffer()),dv=new DataView(u.buffer);
  const type=u[2],w=dv.getUint16(12,true),h=dv.getUint16(14,true),bpp=u[16],top=u[17]&32,px=bpp>>3;
  if(![2,3,10,11].includes(type)||!w||!h)return null;
  const gray=type===3||type===11,rle=type>=10,out=new Uint8ClampedArray(w*h*4);let p=18+u[0]+(u[1]?dv.getUint16(5,true)*(u[7]>>3):0),i=0;
  const put=o=>{const k=i*4;if(gray){out[k]=out[k+1]=out[k+2]=u[o];out[k+3]=px>1?u[o+1]:255}else if(px===2){const v=u[o]|u[o+1]<<8;out[k]=(v>>10&31)*8.2;out[k+1]=(v>>5&31)*8.2;out[k+2]=(v&31)*8.2;out[k+3]=255}else{out[k]=u[o+2];out[k+1]=u[o+1];out[k+2]=u[o];out[k+3]=px===4?u[o+3]:255}i++};
  while(i<w*h&&p<u.length){if(!rle){put(p);p+=px;continue}const c=u[p++],n=(c&127)+1;if(c&128){for(let j=0;j<n;j++)put(p);p+=px}else for(let j=0;j<n;j++){put(p);p+=px}}
  const c=canvas(w,h),x=c.getContext("2d"),img=new ImageData(out,w,h);
  if(top)x.putImageData(img,0,0);else{const t=canvas(w,h);t.getContext("2d").putImageData(img,0,0);x.scale(1,-1);x.drawImage(t,0,-h)}
  return c;
}

/* ---------- pictures stored inside other files ---------- */
// Largest JPEG (baseline/progressive only: RAW data itself is lossless JPEG) or PNG found in the bytes, else an XMP thumbnail.
function embedded(u){
  let best=null;const take=(s,e,area,type)=>{if(area>0&&(!best||area>best.area))best={s,e,area,type}};
  for(let i=0;i<u.length-8;i++){
    if(u[i]===0xFF&&u[i+1]===0xD8&&u[i+2]===0xFF){
      let p=i+2,area=0;
      while(p+4<u.length&&u[p]===0xFF){const m=u[p+1],len=u[p+2]<<8|u[p+3];
        if(m===0xC0||m===0xC1||m===0xC2)area=(u[p+5]<<8|u[p+6])*(u[p+7]<<8|u[p+8]);else if(m>=0xC3&&m<=0xCF&&m!==0xC4&&m!==0xC8&&m!==0xCC)area=-1;
        p+=2+len;if(m===0xDA)break}
      if(area>0){let q=p;while(q<u.length-1&&!(u[q]===0xFF&&u[q+1]===0xD9))q++;if(q<u.length-1){take(i,q+2,area,"image/jpeg");i=q+1}}
    }else if(u[i]===0x89&&u[i+1]===0x50&&u[i+2]===0x4E&&u[i+3]===0x47&&u[i+4]===0x0D&&u[i+5]===0x0A){
      const dv=new DataView(u.buffer,u.byteOffset);let p=i+8;const area=dv.getUint32(p+8)*dv.getUint32(p+12);
      while(p+8<=u.length){const len=dv.getUint32(p),t=String.fromCharCode(u[p+4],u[p+5],u[p+6],u[p+7]);p+=12+len;if(t==="IEND")break}
      if(p<=u.length){take(i,p,area,"image/png");i=p-1}
    }
  }
  if(best)return new Blob([u.subarray(best.s,best.e)],{type:best.type});
  const s=new TextDecoder("latin1").decode(u.subarray(0,Math.min(u.length,8e6))),m=s.match(/xmpGImg:image(?:>|=")([A-Za-z0-9+/=\s&#xA;]+)/);
  if(!m)return null;
  try{return new Blob([Uint8Array.from(atob(m[1].replace(/&#xA;|\s/g,"")),c=>c.charCodeAt(0))],{type:"image/jpeg"})}catch(e){return null}
}
// ZIP-based files (Sketch, XD, Figma, Krita, Keynote…) keep a preview image under a known name.
const PREVIEW=[/(^|\/)mergedimage\.png$/i,/^previews\/preview\.png$/i,/(^|\/)preview\.(png|jpe?g)$/i,/^quicklook\/(thumbnail|preview)\.(png|jpe?g)$/i,/thumbnail\.(png|jpe?g|webp)$/i,/\.(png|jpe?g|webp)$/i];
async function zipPreview(u){
  const dv=new DataView(u.buffer,u.byteOffset,u.byteLength);let e=u.length-22;
  while(e>=Math.max(0,u.length-65557)&&dv.getUint32(e,true)!==0x06054b50)e--;if(e<0||dv.getUint32(e,true)!==0x06054b50)return null;
  const n=dv.getUint16(e+10,true);let p=dv.getUint32(e+16,true);const list=[];
  for(let k=0;k<n&&p+46<=u.length&&dv.getUint32(p,true)===0x02014b50;k++){
    const nl=dv.getUint16(p+28,true),xl=dv.getUint16(p+30,true),cl=dv.getUint16(p+32,true);
    list.push({name:new TextDecoder().decode(u.subarray(p+46,p+46+nl)),method:dv.getUint16(p+10,true),size:dv.getUint32(p+20,true),usize:dv.getUint32(p+24,true),off:dv.getUint32(p+42,true)});p+=46+nl+xl+cl}
  for(const re of PREVIEW){
    const f=list.filter(f=>re.test(f.name)&&f.usize>0).sort((a,b)=>b.usize-a.usize)[0];if(!f)continue;
    const h=f.off,data=u.subarray(h+30+dv.getUint16(h+26,true)+dv.getUint16(h+28,true));const raw=data.subarray(0,f.size);
    const type=/\.png$/i.test(f.name)?"image/png":/\.webp$/i.test(f.name)?"image/webp":"image/jpeg";
    if(f.method===0)return new Blob([raw],{type});
    if(f.method===8)return new Blob([await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer()],{type});
  }
  return null;
}
async function pack(blob){
  const u=new Uint8Array(await blob.arrayBuffer());
  const b=await zipPreview(u).catch(()=>null)||embedded(u);return b&&bitmap(b);
}

/* ---------- fonts, audio, 3D, spreadsheets ---------- */
let fontN=0;
async function font(blob,w,h,thumb){
  const f=new FontFace("tehon-font-"+(++fontN),await blob.arrayBuffer());await f.load();document.fonts.add(f);
  const c=canvas(w,h),x=c.getContext("2d"),fam=`"${f.family}",sans-serif`;
  x.fillStyle=css("--surface");x.fillRect(0,0,w,h);x.fillStyle=css("--fg");x.textBaseline="alphabetic";
  const line=(t,size,y)=>{x.font=`${size}px ${fam}`;let s=size;while(x.measureText(t).width>w*.9&&s>8){s*=.9;x.font=`${s}px ${fam}`}x.fillText(t,w*.05,y)};
  if(thumb)line("Aa あア永",h*.4,h*.62);
  else{line("Aa あア永",h*.13,h*.2);line("ABCDEFGHIJKLMNOPQRSTUVWXYZ",h*.06,h*.36);line("abcdefghijklmnopqrstuvwxyz",h*.06,h*.47);line("0123456789 !?&@#%",h*.06,h*.58);
    line("あいうえお かきくけこ",h*.06,h*.71);line("アイウエオ 日本語 漢字",h*.06,h*.82)}
  document.fonts.delete(f);return c;
}
// Peaks of the whole file, 0–1, `n` bars.
export async function peaks(blob,n){
  const ac=new (window.AudioContext||window.webkitAudioContext)();
  try{const a=await ac.decodeAudioData(await blob.arrayBuffer()),d=a.getChannelData(0),step=Math.max(1,Math.floor(d.length/n)),out=[];let top=0;
    for(let i=0;i<n;i++){let m=0;for(let j=i*step,e=Math.min(d.length,j+step);j<e;j+=4)m=Math.max(m,Math.abs(d[j]));out.push(m);top=Math.max(top,m)}
    return {peaks:out.map(v=>v/(top||1)),duration:a.duration}}finally{ac.close()}
}
export function drawWave(x,w,h,pk,done,on,off){
  const bw=w/pk.length;
  pk.forEach((v,i)=>{x.fillStyle=i/pk.length<done?on:off;const bh=Math.max(2,v*h*.9);x.fillRect(i*bw+bw*.15,(h-bh)/2,bw*.7,bh)});
}
async function audio(blob,w,h){
  const {peaks:pk}=await peaks(blob,96),c=canvas(w,h),x=c.getContext("2d");
  x.fillStyle=css("--surface");x.fillRect(0,0,w,h);x.save();x.translate(w*.06,0);drawWave(x,w*.88,h,pk,1,css("--accent"),css("--accent"));x.restore();return c;
}
let three;
async function threeLib(){
  return three||=Promise.all([import("three"),import("three/examples/jsm/controls/OrbitControls.js")]).then(([T,O])=>({T,OrbitControls:O.OrbitControls}));
}
async function parseModel(blob,ext){
  const {T}=await threeLib(),buf=await blob.arrayBuffer(),txt=()=>new TextDecoder().decode(buf);
  const mat=()=>new T.MeshStandardMaterial({color:css("--muted")||"#888",roughness:.7,metalness:0});
  if(ext==="glb"||ext==="gltf"){const {GLTFLoader}=await import("three/examples/jsm/loaders/GLTFLoader.js");return new Promise((ok,ng)=>new GLTFLoader().parse(buf,"",g=>ok(g.scene),ng))}
  if(ext==="obj"){const {OBJLoader}=await import("three/examples/jsm/loaders/OBJLoader.js");const o=new OBJLoader().parse(txt());o.traverse(m=>{if(m.isMesh&&!m.material?.map)m.material=mat()});return o}
  if(ext==="fbx"){const {FBXLoader}=await import("three/examples/jsm/loaders/FBXLoader.js");return new FBXLoader().parse(buf,"")}
  if(ext==="dae"){const {ColladaLoader}=await import("three/examples/jsm/loaders/ColladaLoader.js");return new ColladaLoader().parse(txt(),"").scene}
  const L=ext==="stl"?(await import("three/examples/jsm/loaders/STLLoader.js")).STLLoader:(await import("three/examples/jsm/loaders/PLYLoader.js")).PLYLoader;
  const g=new L().parse(buf);g.computeVertexNormals();const m=mat();if(g.hasAttribute("color"))m.vertexColors=true;return new T.Mesh(g,m);
}
// A scene lit from above with the camera placed so the whole model fits.
export async function modelScene(blob,ext){
  const {T}=await threeLib(),obj=await parseModel(blob,ext),scene=new T.Scene();
  scene.add(new T.HemisphereLight(0xffffff,0x444444,2.2));const d=new T.DirectionalLight(0xffffff,2);d.position.set(1,2,1.5);scene.add(d);scene.add(obj);
  const box=new T.Box3().setFromObject(obj),size=box.getSize(new T.Vector3()).length()||1,ctr=box.getCenter(new T.Vector3());
  const cam=new T.PerspectiveCamera(35,1,size/100,size*100);cam.position.copy(ctr).add(new T.Vector3(.6,.45,1).normalize().multiplyScalar(size*1.35));cam.lookAt(ctr);
  return {T,scene,cam,ctr};
}
export async function modelViewer(el,blob,ext){
  const {T,scene,cam,ctr}=await modelScene(blob,ext),{OrbitControls}=await threeLib();
  const r=new T.WebGLRenderer({canvas:el,antialias:true,alpha:true});r.setPixelRatio(devicePixelRatio);
  const ctl=new OrbitControls(cam,el);ctl.target.copy(ctr);ctl.enableDamping=true;
  let raf=0;const size=()=>{const w=el.clientWidth,h=el.clientHeight;if(!w||!h)return;r.setSize(w,h,false);cam.aspect=w/h;cam.updateProjectionMatrix()};
  const loop=()=>{size();ctl.update();r.render(scene,cam);raf=requestAnimationFrame(loop)};loop();
  return ()=>{cancelAnimationFrame(raf);ctl.dispose();r.dispose();r.forceContextLoss()};
}
let thumbGl;
async function model(blob,ext,w,h){
  const {T,scene,cam}=await modelScene(blob,ext);
  thumbGl||=new T.WebGLRenderer({canvas:canvas(w,h),antialias:true,alpha:true,preserveDrawingBuffer:true});
  thumbGl.setSize(w,h,false);cam.aspect=w/h;cam.updateProjectionMatrix();thumbGl.render(scene,cam);
  const c=canvas(w,h);c.getContext("2d").drawImage(thumbGl.domElement,0,0);return c;
}
// Spreadsheets come from Dropbox as HTML; the card draws the first rows of the first table.
function sheet(html,w,h){
  const t=new DOMParser().parseFromString(html,"text/html").querySelector("table"),c=canvas(w,h),x=c.getContext("2d");
  x.fillStyle=css("--surface");x.fillRect(0,0,w,h);if(!t)return c;
  const rows=[...t.rows].slice(0,10).map(r=>[...r.cells].slice(0,6).map(c=>c.textContent.trim())),cols=Math.max(1,...rows.map(r=>r.length)),rh=h/10,cw=w/cols;
  x.font=`${rh*.5}px ${css("--sans")||"sans-serif"}`;x.textBaseline="middle";x.strokeStyle=css("--line");x.lineWidth=1;
  rows.forEach((r,i)=>{r.forEach((v,j)=>{x.save();x.beginPath();x.rect(j*cw,i*rh,cw,rh);x.clip();x.fillStyle=css(i?"--fg":"--muted");x.fillText(v,j*cw+rh*.3,i*rh+rh/2);x.restore()});
    x.beginPath();x.moveTo(0,(i+1)*rh+.5);x.lineTo(w,(i+1)*rh+.5);x.stroke()});
  for(let j=1;j<cols;j++){x.beginPath();x.moveTo(j*cw+.5,0);x.lineTo(j*cw+.5,rows.length*rh);x.stroke()}
  return c;
}

/* ---------- entry points ---------- */
// `src` is the file, or for office/sheet formats Dropbox's preview of it ({blob,type}).
// Returns a canvas or ImageBitmap at most `max` px on its longest side, or null.
export async function picture(src,fmt,ext,name,max,thumb){
  if(fmt==="office"||fmt==="sheet"){
    if(src.type.includes("pdf")){const d=await pdfOpen(src.blob);try{return await pdfPage(d,1,max)}finally{d.close()}}
    if(src.type.includes("html"))return sheet(await src.blob.text(),360,270);
    return null;
  }
  const s=x=>x&&scaled(x,x.width,x.height,max);
  switch(fmt){
    case "pdf":{try{const d=await pdfOpen(src);try{return await pdfPage(d,1,max)}finally{d.close()}}catch(e){return s(await pack(src))}}
    case "psd":return s(await psd(src).catch(()=>null)||await pack(src));
    case "tiff":return s(await tiff(src).catch(()=>null)||await pack(src));
    case "heic":return s(await heic(src));
    case "tga":return s(await tga(src));
    case "raw":case "pack":return s(await pack(src));
    case "font":return thumb?font(src,480,320,true):font(src,1600,1200,false);
    case "audio":return audio(src,480,200);
    case "model":return model(src,ext,thumb?480:1200,thumb?360:900);
  }
  return null;
}
export const toBlob=c=>new Promise(ok=>{if(c instanceof HTMLCanvasElement)return c.toBlob(ok,"image/webp",.85);const k=canvas(c.width,c.height);k.getContext("2d").drawImage(c,0,0);k.toBlob(ok,"image/webp",.85)});
