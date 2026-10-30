import "./styles.css";
import * as dbx from "./dropbox";
import { EAGLE_IMPORT } from "./config";
import * as eagle from "./eagle";
import PTHEMES from "./themes.json";

(async()=>{
const $=id=>document.getElementById(id);
let eagleMode=false;
// #eagle opens the importer on the public build too, for the one-off migration of the Eagle libraries.
const EAGLE=EAGLE_IMPORT||location.hash==="#eagle";
let dbxMode=false,own=null;
const HEART=`<svg class="hi" viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden="true"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`;
const favBtn=b=>{b.firstChild.insertAdjacentHTML("beforebegin",HEART);return b};
let FOLDERS=["キャラクター/表情","キャラクター/ポーズ","キャラクター/手","背景/屋内","背景/屋外","配色","UI","動き","メモ"];
const TAGS=["人物","手","夕景","夜","配色","光","構図","建物","植物","アニメーション","線画","質感"];
const PAL=[["#1f3b73","#f2a65a","#f6e6c8"],["#0e4d64","#6fb3b8","#f1f1f1"],["#3b1f4a","#d96c75","#f5c16c"],["#14281d","#5c946e","#e3e7af"],["#20232a","#61dafb","#ffffff"],["#5b2a86","#9a48d0","#f0e6ff"],["#7a1f1f","#e86a33","#ffd166"],["#102542","#f87060","#cdd7d6"],["#2d3047","#93b7be","#e0ca3c"],["#0b3954","#bfd7ea","#ff5a5f"]];
let seed=7;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
const pick=a=>a[Math.floor(rnd()*a.length)];
const NAMES={"キャラクター/表情":["笑顔","驚き","怒り","泣き顔","横顔"],"キャラクター/ポーズ":["走る","座る","振り向き","跳ぶ"],"キャラクター/手":["握る","指差し","開いた手","持つ"],"背景/屋内":["教室","台所","駅構内","喫茶店"],"背景/屋外":["夕方の河川敷","夜の商店街","雨の交差点","山道"],"配色":["寒色","補色","夕焼け","ネオン"],"UI":["ボタン","カード","メニュー"],"動き":["髪のなびき","煙","水しぶき","歩き"]};
const urls=[["https://www.artstation.com/","ArtStation"],["https://www.pinterest.com/","Pinterest"],["https://sketchfab.com/","Sketchfab"]];
const now=Date.parse("2026-10-30T12:00:00Z");
let items=[];
for(let i=0;i<72;i++){
  const folder=FOLDERS[i%8];
  const kind=folder==="動き"?(i%2?"gif":"video"):(i%13===5?"url":"image");
  const base=pick(NAMES[folder]);
  const tags=[...new Set([pick(TAGS),rnd()>.5?pick(TAGS):null].filter(Boolean))];
  if(folder.startsWith("キャラクター"))tags.unshift("人物");
  if(folder==="動き")tags.push("アニメーション");
  const u=kind==="url"?pick(urls):null;
  items.push({id:"id:demo"+i,name:kind==="url"?u[1]:`${base}_${String(i+1).padStart(3,"0")}.${kind==="video"?"mp4":kind==="gif"?"gif":rnd()>.5?"png":"jpg"}`,
    folder,kind,tags:[...new Set(tags)],favorite:rnd()>.82,url:u?u[0]:null,
    w:kind==="url"?0:pick([1200,1600,2048,1080]),h:kind==="url"?0:pick([900,1200,1536,1920]),
    pal:pick(PAL),style:Math.floor(rnd()*4),seed:Math.floor(rnd()*1e6),addedAt:now-i*3.7e6*(1+rnd()*8),trashed:false});
}
[["演出メモ.txt","カット12\n・振り向きは2コマ溜めてから一気に\n・髪は1コマ遅れて追従\n・最後に瞬き\n\nカット13\n・煙は手前に1レイヤー足す"],
 ["配色ルール.txt","夕景\n空：橙→紫のグラデーション\n影：青紫寄り、彩度は落とさない\n\n夜\n街灯の色を主光源にする"],
 ["参考リンクまとめ.txt","歩きのサイクル：8コマ／2コマ打ち\n走り：6コマ\n\nあとで見る\n・水しぶきの作画\n・炎の形の変化"],
 ["アイデア.txt","雨上がりの交差点で、水たまりに映る信号だけが動くショット"]].forEach(([n,t],j)=>items.push({id:"id:memo"+j,name:n,folder:"メモ",kind:"text",text:t,tags:j===1?["配色"]:["アニメーション"],favorite:j===3,url:null,w:0,h:0,addedAt:now-j*9e6-2e6,trashed:false}));
// persisted per-viewer edits (demo only)
const KEY="tehon-demo-v1";
try{const s=JSON.parse(localStorage.getItem(KEY)||"null");if(s){const m=new Map(s.map(x=>[x.id,x]));items.forEach(it=>{const x=m.get(it.id);if(x){it.tags=x.tags;it.favorite=x.favorite;it.folder=x.folder;it.trashed=x.trashed;if(x.text!=null)it.text=x.text}});s.filter(x=>x.extra).forEach(x=>items.push(x))}}catch(e){}
const save=()=>{if(eagleMode)return;if(dbxMode)return dbxSave();try{localStorage.setItem(KEY,JSON.stringify(items.map(it=>it.extra?{...it,blobUrl:null}:{id:it.id,tags:it.tags,favorite:it.favorite,folder:it.folder,trashed:it.trashed,text:it.kind==="text"?it.text:undefined})))}catch(e){}};

/* drawing demo artwork */
function draw(ctx,it,W,H,t=0){
  const r=(()=>{let s=it.seed;return()=>(s=(s*16807)%2147483647)/2147483647})();
  const [a,b,c]=it.pal;
  const g=ctx.createLinearGradient(0,0,W,H);g.addColorStop(0,a);g.addColorStop(1,b);
  ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
  ctx.fillStyle=c;ctx.strokeStyle=c;
  if(it.style===0){for(let i=0;i<9;i++){ctx.globalAlpha=.25+r()*.5;ctx.beginPath();ctx.arc(r()*W+Math.sin(t+i)*W*.04,r()*H,(r()*.22+.05)*W,0,7);ctx.fill()}}
  else if(it.style===1){ctx.globalAlpha=.85;ctx.beginPath();ctx.moveTo(0,H*.7);for(let x=0;x<=W;x+=W/12)ctx.lineTo(x,H*(.45+r()*.25)+Math.sin(t+x)*H*.02);ctx.lineTo(W,H);ctx.lineTo(0,H);ctx.fill();ctx.globalAlpha=.9;ctx.beginPath();ctx.arc(W*.7,H*.3,W*.1,0,7);ctx.fill()}
  else if(it.style===2){ctx.lineWidth=W*.012;for(let i=0;i<14;i++){ctx.globalAlpha=.3+r()*.6;ctx.beginPath();const y=r()*H;ctx.moveTo(0,y);ctx.bezierCurveTo(W*.3,y+(r()-.5)*H+Math.sin(t)*H*.05,W*.6,y+(r()-.5)*H,W,y);ctx.stroke()}}
  else{for(let i=0;i<7;i++){ctx.globalAlpha=.3+r()*.6;ctx.save();ctx.translate(r()*W,r()*H);ctx.rotate(r()*3+t*.3);ctx.fillRect(-W*.12,-H*.08,W*.24,H*.16);ctx.restore()}}
  ctx.globalAlpha=1;
}
const thumbCache=new Map();
const BLANK="data:image/svg+xml,"+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"/>');
function thumb(it){
  if(it.blobUrl)return it.blobUrl;
  if(it.dbx){if(thumbCache.has(it.id))return thumbCache.get(it.id);if(it.thumbable)queueThumb(it.id);return BLANK}
  if(it.local)return "data:image/svg+xml,"+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#8c97a8"/></svg>`);
  if(thumbCache.has(it.id))return thumbCache.get(it.id);
  const cv=document.createElement("canvas");const S=320,SH=Math.round(S*(it.h/it.w||1));cv.width=S;cv.height=SH;
  draw(cv.getContext("2d"),it,S,SH);const u=cv.toDataURL("image/jpeg",.8);thumbCache.set(it.id,u);return u;
}


/* Dropbox */
const thumbQ=new Set();let thumbBusy=0,thumbT;
function queueThumb(id){if(thumbQ.has(id))return;thumbQ.add(id);clearTimeout(thumbT);thumbT=setTimeout(pumpThumbs,30)}
async function pumpThumbs(){
  while(thumbQ.size&&thumbBusy<3){
    const ids=[...thumbQ].slice(0,25);ids.forEach(i=>thumbQ.delete(i));thumbBusy++;
    dbx.thumbnails(ids).then(m=>{for(const id of ids){const u=m.get(id);if(!u){thumbCache.set(id,BLANK);continue}thumbCache.set(id,u);document.querySelectorAll(`img[data-id="${CSS.escape(id)}"]`).forEach(im=>im.src=u)}})
      .catch(()=>ids.forEach(id=>thumbCache.delete(id))).finally(()=>{thumbBusy--;pumpThumbs()});
  }
}
const VIEW_EXT=["jpg","jpeg","png","gif","webp","bmp","svg","avif","ico"],VID_EXT=["mp4","webm","mov","m4v","ogv"],TXT_EXT=["txt","md","text","csv","json"];
function kindOf(ext){return ext==="gif"?"gif":VID_EXT.includes(ext)?"video":TXT_EXT.includes(ext)?"text":"image"}
const metaOf=it=>it.kind==="url"?{name:it.name,url:it.url,folder:it.folder,tags:it.tags,favorite:it.favorite,trashed:it.trashed,addedAt:it.addedAt}:{tags:it.tags,favorite:it.favorite,trashed:it.trashed};
const snap=new Map();let saveT=null;
function dbxSave(){
  const t=Date.now();let ch=false;
  for(const it of items){const m=metaOf(it),j=JSON.stringify(m);if(snap.get(it.id)===j)continue;snap.set(it.id,j);
    if(it.kind==="url")own.urls[it.key]={...m,updatedAt:t};else own.items[it.id]={...m,updatedAt:t};ch=true}
  if(ch){clearTimeout(saveT);saveT=setTimeout(flushSave,1500)}
}
function flushSave(){if(saveT==null)return;clearTimeout(saveT);saveT=null;$("sync").lastChild.textContent="保存中";
  dbx.saveDevice(own).then(()=>$("sync").lastChild.textContent="Dropbox").catch(()=>{$("sync").lastChild.textContent="未保存";toast("Dropboxに保存できませんでした")})}
addEventListener("visibilitychange",()=>{if(document.visibilityState==="hidden")flushSave()});
function dbxItem(e,m){
  const dot=e.name.lastIndexOf(".");const ext=dot>0?e.name.slice(dot+1).toLowerCase():"";const kind=kindOf(ext);
  const p=e.path_display.slice(1);const folder=p.includes("/")?p.slice(0,p.lastIndexOf("/")):"";
  const d=e.media_info?.metadata?.dimensions;
  return {id:e.id,name:e.name,folder,kind,dbx:true,size:e.size,path:e.path_display,rev:e.rev,badge:kind==="image"&&!VIEW_EXT.includes(ext)?ext||"file":null,
    viewable:kind!=="image"||VIEW_EXT.includes(ext),thumbable:dbx.THUMB_EXT.includes(ext),
    tags:m?.tags||[],favorite:!!m?.favorite,trashed:!!m?.trashed,url:null,w:d?.width||0,h:d?.height||0,
    addedAt:Date.parse(e.client_modified||e.server_modified||"")||0};
}
async function loadDropbox(){
  $("sync").lastChild.textContent="読み込み中";
  try{
    const [entries,meta]=await Promise.all([dbx.listAll(n=>toast(`読み込み中 ${n} 件`)),dbx.loadMeta()]);
    own=meta.own;
    const out=entries.filter(e=>e[".tag"]==="file").map(e=>dbxItem(e,meta.items[e.id]));
    for(const [k,u] of Object.entries(meta.urls))if(!u.deleted)out.push({id:"url:"+k,key:k,name:u.name,folder:u.folder,kind:"url",url:u.url,tags:u.tags||[],favorite:!!u.favorite,trashed:!!u.trashed,addedAt:u.addedAt,w:0,h:0,dbx:true});
    dbxMode=true;eagleMode=false;items=out;
    FOLDERS=entries.filter(e=>e[".tag"]==="folder").map(e=>e.path_display.slice(1)).sort((a,b)=>a.localeCompare(b,"ja"));
    TAGS.length=0;TAGS.push(...new Set(out.flatMap(i=>i.tags)));
    snap.clear();items.forEach(it=>snap.set(it.id,JSON.stringify(metaOf(it))));
    st.view="all";st.folder=null;st.tag=null;st.q="";$("q").value="";st.sel.clear();
    $("sync").lastChild.textContent="Dropbox";$("toast").hidden=true;render();
  }catch(e){
    $("sync").lastChild.textContent="デモデータ";
    toast(e instanceof dbx.DropboxError&&e.status===401?"Dropboxに再接続してください":"Dropboxを読み込めませんでした");
  }
}
const esc=t=>String(t).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[c]);
const folderOpts=sel=>(dbxMode?["",...FOLDERS]:FOLDERS).map(f=>`<option value="${esc(f)}"${f===sel?" selected":""}>${f?esc(f):"/"}</option>`).join("");
/* state */
const st={rseed:Date.now()|0,layout:"grid",view:"all",folder:null,tag:null,q:"",sort:"added-desc",sel:new Set(),selecting:false,anchor:null};
let list=[];
function filtered(){
  const q=st.q.trim().toLowerCase();
  let l=items.filter(it=>st.view==="trash"?it.trashed:!it.trashed);
  if(st.view==="fav")l=l.filter(it=>it.favorite);
  if(st.view==="url")l=l.filter(it=>it.kind==="url");
  if(st.folder)l=l.filter(it=>it.folder===st.folder||it.folder.startsWith(st.folder+"/"));
  if(st.tag)l=l.filter(it=>it.tags.includes(st.tag));
  if(q)l=l.filter(it=>(it.name+" "+it.folder+" "+it.tags.join(" ")+" "+(it.url||"")).toLowerCase().includes(q));
  if(st.sort==="random"){const r=x=>{let h=st.rseed;for(const c of x.id)h=Math.imul(h^c.charCodeAt(0),2654435761);return h>>>0};return l.sort((x,y)=>r(x)-r(y))}
  const [k,d]=st.sort.split("-");
  l.sort((x,y)=>k==="name"?x.name.localeCompare(y.name,"ja"):k==="kind"?x.kind.localeCompare(y.kind)||y.addedAt-x.addedAt:(d==="asc"?x.addedAt-y.addedAt:y.addedAt-x.addedAt));
  return l;
}
function navBtn(label,n,on,fn,cls=""){const b=document.createElement("button");b.className=(on?"on ":"")+cls;b.innerHTML=`<span></span><span class="n">${n}</span>`;b.firstChild.textContent=label;b.onclick=()=>{fn();closeNav()};return b}
function renderSide(){
  const live=items.filter(i=>!i.trashed);
  const lib=$("lib");lib.replaceChildren(
    navBtn("すべて",live.length,st.view==="all"&&!st.folder&&!st.tag,()=>setView("all")),
    favBtn(navBtn("お気に入り",live.filter(i=>i.favorite).length,st.view==="fav",()=>setView("fav"))),
    navBtn("URL",live.filter(i=>i.kind==="url").length,st.view==="url",()=>setView("url")),
    navBtn("ゴミ箱",items.filter(i=>i.trashed).length,st.view==="trash",()=>setView("trash")));
  const f=$("folders");f.replaceChildren();
  const all=new Set();FOLDERS.forEach(x=>{const a=x.split("/");a.forEach((_,i)=>all.add(a.slice(0,i+1).join("/")))});
  const cnt=new Map();live.forEach(i=>{const a=i.folder.split("/");a.forEach((_,k)=>{const q=a.slice(0,k+1).join("/");cnt.set(q,(cnt.get(q)||0)+1)})});
  const order=[...all].sort((a,b)=>{const x=a.split("/"),y=b.split("/");for(let i=0;i<Math.min(x.length,y.length);i++){if(x[i]!==y[i]){const ix=FOLDERS.findIndex(z=>z.split("/")[i]===x[i]),iy=FOLDERS.findIndex(z=>z.split("/")[i]===y[i]);return ix-iy||x[i].localeCompare(y[i],"ja")}}return x.length-y.length});
  for(const q of order){const d=q.split("/").length-1;const b=navBtn(q.split("/").pop(),cnt.get(q)||0,st.folder===q,()=>setFolder(q));b.style.paddingLeft=(8+d*16)+"px";f.append(b)}
  const tg=$("tags");tg.replaceChildren();
  const tagAll=[...new Set(live.flatMap(i=>i.tags))].sort((a,b)=>a.localeCompare(b,"ja"));
  for(const t of tagAll){const b=navBtn("# "+t,live.filter(i=>i.tags.includes(t)).length,st.tag===t,()=>setTag(t));b.oncontextmenu=e=>{e.preventDefault();editTag(t)};b.ondblclick=()=>editTag(t);tg.append(b)}
}
// Rename (merging into an existing tag of the same name) or delete a tag on every item.
function editTag(t){
  formDlg("タグを編集",`<input id="fTag" required><button type="button" class="btn" id="fDel">削除</button>`,"保存",()=>{
    const n=$("fTag").value.trim();if(!n||n===t)return;
    items.forEach(i=>{if(i.tags.includes(t))i.tags=[...new Set(i.tags.map(z=>z===t?n:z))]});
    if(st.tag===t)st.tag=n;TAGS.splice(0,TAGS.length,...new Set(TAGS.map(z=>z===t?n:z)));save();render();toast(`「${n}」に変更しました`)},
  ()=>{$("fTag").value=t;$("fDel").onclick=()=>{const n=items.filter(i=>i.tags.includes(t)).length;
    confirmDlg(`「${t}」を削除`,`${n} 件から外します。`,()=>{items.forEach(i=>{if(i.tags.includes(t))i.tags=i.tags.filter(z=>z!==t)});if(st.tag===t)st.tag=null;save();render();toast(`「${t}」を削除しました`)})}});
}
function setView(v){st.view=v;st.folder=null;st.tag=null;st.sel.clear();render()}
function setFolder(f){st.view="all";st.folder=st.folder===f?null:f;st.sel.clear();render()}
function setTag(t){if(st.view==="trash")st.view="all";st.tag=st.tag===t?null:t;st.sel.clear();render()}
function renderGrid(){
  list=filtered();
  const g=$("grid");g.replaceChildren();
  g.classList.toggle("selecting",st.selecting||st.sel.size>0);
  if(!list.length){const e=document.createElement("div");e.className="empty";e.textContent=st.view==="trash"?"ゴミ箱は空です":"該当する資料はありません";g.append(e);return}
  appendCards(0);
}
const CHUNK=300;let gridIO;
function appendCards(start){
  const g=$("grid");g.querySelector(".more")?.remove();
  const frag=document.createDocumentFragment();
  list.slice(start,start+CHUNK).forEach((it,j)=>{const idx=start+j;
    const c=document.createElement("div");c.className="card"+(st.sel.has(it.id)?" sel":"");c.tabIndex=0;c.dataset.i=idx;
    if(it.kind==="text"){const d=document.createElement("div");d.className="txtth";d.textContent=it.text!=null?it.text.slice(0,400):"…";c.append(d);if(it.text==null&&!(it.dbx&&it.size>2e5))readText(it).then(t=>{d.textContent=t.slice(0,400)})}
    else if(it.kind==="url"){c.innerHTML=`<div class="urlth"><b></b><span></span></div>`;c.querySelector("b").textContent=it.name;c.querySelector(".urlth span").textContent=it.url.replace(/^https?:\/\//,"")}
    else{const im=document.createElement("img");im.className="th";im.loading="lazy";im.decoding="async";im.alt="";if(it.dbx)im.dataset.id=it.id;im.src=it.kind==="gif"&&it.file?(it.srcUrl||=URL.createObjectURL(it.file)):thumb(it);c.append(im)}
    if(it.kind!=="image"||it.badge){const k=document.createElement("span");k.className="kind";k.textContent=(it.badge||it.kind).toUpperCase();c.append(k)}
    const ck=document.createElement("span");ck.className="chk";ck.textContent="✓";c.append(ck);
    const m=document.createElement("div");m.className="meta";m.innerHTML=`<span class="nm"></span><button class="fv${it.favorite?" on":""}" aria-label="お気に入り">${HEART}</button>`;
    m.firstChild.textContent=it.name;c.append(m);
    frag.append(c);
  });
  g.append(frag);
  if(start+CHUNK<list.length){const s=document.createElement("div");s.className="more";s.style.gridColumn="1/-1";s.style.height="1px";g.append(s);
    gridIO?.disconnect();gridIO=new IntersectionObserver(es=>{if(es[0].isIntersecting){gridIO.disconnect();appendCards(start+CHUNK)}},{root:$("wrap"),rootMargin:"800px"});gridIO.observe(s)}
}
function renderSel(){
  const n=st.sel.size;$("selbar").hidden=!(n||st.selecting);$("selN").textContent=n;
  const tr=st.view==="trash";$("bRestore").hidden=!tr;$("bTrash").textContent=tr?"ゴミ箱から削除":"ゴミ箱へ";
  ["bFav","bTag","bMove"].forEach(x=>$(x).hidden=tr);
  if(dbxMode){$("bMove").hidden=true;$("bTrash").hidden=tr}else $("bTrash").hidden=false;
  $("selBtn").textContent=st.selecting?"完了":"選択";
}
function render(){renderSide();renderGrid();renderSel()}

/* grid events */
$("grid").addEventListener("click",e=>{
  const c=e.target.closest(".card");if(!c)return;const it=list[+c.dataset.i];
  if(e.target.closest(".fv")){it.favorite=!it.favorite;save();render();return}
  if(e.shiftKey&&st.anchor!=null){const a=Math.min(st.anchor,+c.dataset.i),b=Math.max(st.anchor,+c.dataset.i);for(let i=a;i<=b;i++)st.sel.add(list[i].id);renderGrid();renderSel();return}
  if(e.metaKey||e.ctrlKey||st.selecting||st.sel.size||e.target.closest(".chk")){st.sel.has(it.id)?st.sel.delete(it.id):st.sel.add(it.id);st.anchor=+c.dataset.i;renderGrid();renderSel();return}
  st.anchor=+c.dataset.i;openViewer(+c.dataset.i);
});
let lp;$("grid").addEventListener("pointerdown",e=>{const c=e.target.closest(".card");if(!c||e.pointerType==="mouse")return;lp=setTimeout(()=>{st.selecting=true;st.sel.add(list[+c.dataset.i].id);renderGrid();renderSel();lp="done"},450)});
["pointerup","pointercancel","pointermove"].forEach(ev=>$("grid").addEventListener(ev,e=>{if(ev==="pointermove"&&Math.abs(e.movementX)+Math.abs(e.movementY)<4)return;if(lp!=="done")clearTimeout(lp)}));
$("grid").addEventListener("click",e=>{if(lp==="done"){lp=null;e.stopImmediatePropagation()}},true);
$("grid").addEventListener("keydown",e=>{const c=e.target.closest(".card");if(!c)return;const i=+c.dataset.i;
  const cols=getComputedStyle($("grid")).gridTemplateColumns.split(" ").length;
  const mv={ArrowRight:1,ArrowLeft:-1,ArrowDown:cols,ArrowUp:-cols}[e.key];
  if(mv){e.preventDefault();$("grid").children[Math.max(0,Math.min(list.length-1,i+mv))]?.focus();return}
  if(e.key==="Enter")openViewer(i);
  if(e.key===" "){e.preventDefault();const id=list[i].id;st.sel.has(id)?st.sel.delete(id):st.sel.add(id);renderGrid();renderSel();$("grid").children[i].focus()}
  if(e.key.toLowerCase()==="f"){list[i].favorite=!list[i].favorite;save();render();$("grid").children[i]?.focus()}
});
document.addEventListener("keydown",e=>{
  if(!$("viewer").hidden||!$("dlg").hidden)return;
  if(e.target.matches("input,select"))return;
  if((e.metaKey||e.ctrlKey)&&e.key==="a"){e.preventDefault();list.forEach(i=>st.sel.add(i.id));renderGrid();renderSel()}
  if(e.key==="Escape"){st.sel.clear();st.selecting=false;renderGrid();renderSel()}
  if(e.key==="/"){e.preventDefault();$("q").focus()}
  if((e.key==="Delete"||e.key==="Backspace")&&st.sel.size)trashSel();
});

/* toolbar */
$("q").oninput=e=>{st.q=e.target.value;renderGrid()};
$("sort").onchange=e=>{st.sort=e.target.value;if(st.sort==="random")st.rseed=Date.now()|0;$("shuffle").hidden=st.sort!=="random";renderGrid();$("wrap").scrollTop=0};
$("shuffle").onclick=()=>{st.rseed=(Date.now()^Math.random()*1e9)|0;renderGrid();$("wrap").scrollTop=0};
function setLayout(l){st.layout=l;$("grid").classList.toggle("fall",l==="fall");$("lGrid").classList.toggle("on",l==="grid");$("lFall").classList.toggle("on",l==="fall");try{localStorage.setItem("tehon-layout",l)}catch(e){}}
$("lGrid").onclick=()=>setLayout("grid");$("lFall").onclick=()=>setLayout("fall");
try{const l=localStorage.getItem("tehon-layout");if(l)setLayout(l)}catch(e){}
$("size").oninput=e=>{$("grid").style.setProperty("--cell",e.target.value+"px")};
$("selBtn").onclick=()=>{st.selecting=!st.selecting;if(!st.selecting)st.sel.clear();renderGrid();renderSel()};
$("bAll").onclick=()=>{list.forEach(i=>st.sel.add(i.id));renderGrid();renderSel()};
$("bNone").onclick=()=>{st.sel.clear();st.selecting=false;renderGrid();renderSel()};
const selItems=()=>items.filter(i=>st.sel.has(i.id));
$("bFav").onclick=()=>{const s=selItems();const v=!s.every(i=>i.favorite);s.forEach(i=>i.favorite=v);save();render();toast(v?"お気に入りに追加しました":"お気に入りを解除しました")};
function trashSel(){
  const s=selItems();
  if(st.view==="trash"){confirmDlg(`${s.length} 件をゴミ箱から削除`,"Dropboxでは「削除済みファイル」から一定期間復元できます。",()=>{items=items.filter(i=>!st.sel.has(i.id));st.sel.clear();save();render();toast("削除しました")});return}
  s.forEach(i=>i.trashed=true);st.sel.clear();save();render();toast(`${s.length} 件をゴミ箱へ移動しました`);
}
$("bTrash").onclick=trashSel;
$("bRestore").onclick=()=>{const s=selItems();s.forEach(i=>i.trashed=false);st.sel.clear();save();render();toast(`${s.length} 件を元に戻しました`)};
$("bTag").onclick=()=>{const s=selItems();const cur=[...new Set(s.flatMap(i=>i.tags))].sort((a,b)=>a.localeCompare(b,"ja"));
  formDlg("タグ",`<input id="fTag" list="tagList" placeholder="タグ名"><datalist id="tagList">${TAGS.map(t=>`<option value="${esc(t)}">`).join("")}</datalist><div class="tags" id="fCur"></div>`,"追加",()=>{const t=$("fTag").value.trim();if(!t)return;s.forEach(i=>{if(!i.tags.includes(t))i.tags.push(t)});save();render();toast(`「${t}」を追加しました`)},
  ()=>{for(const t of cur){const c=document.createElement("span");c.className="tag";c.textContent="# "+t;const x=document.createElement("button");x.type="button";x.textContent="✕";x.setAttribute("aria-label","タグを外す");
    x.onclick=()=>{s.forEach(i=>i.tags=i.tags.filter(z=>z!==t));c.remove();save();render()};c.append(x);$("fCur").append(c)}})};
$("bMove").onclick=()=>formDlg("移動",`<select id="fFolder">${folderOpts()}</select>`,"移動",()=>{const f=$("fFolder").value;const s=selItems();s.forEach(i=>i.folder=f);st.sel.clear();save();render();toast(`${s.length} 件を ${f} へ移動しました`)});
$("addBtn").onclick=()=>formDlg("追加",`<select id="fKind"><option value="file">ファイル（画像・動画・テキスト）</option><option value="url">URL</option>${EAGLE?`<option value="eagle">Eagleライブラリ（.library フォルダ）</option>`:""}</select><input id="fUrl" type="url" placeholder="https://" hidden><select id="fFolder">${folderOpts(st.folder)}</select>`,"追加",()=>{
  const f=$("fFolder").value;
  if($("fKind").value==="file"){pendingFolder=f;$("file").click();return}
  if($("fKind").value==="eagle"){if(dbxMode)importEagleDropbox();else $("eagleDir").click();return}
  const u=$("fUrl").value.trim();if(!/^https?:\/\//.test(u))return toast("URLを入力してください");
  const key=Date.now().toString(36)+Math.random().toString(36).slice(2,6);
  items.unshift({id:(dbxMode?"url:":"id:url")+key,key,name:new URL(u).hostname,folder:f,kind:"url",url:u,tags:[],favorite:false,addedAt:Date.now(),trashed:false,extra:!dbxMode,dbx:dbxMode});save();render();toast("URLを追加しました");
},()=>{$("fKind").onchange=e=>{$("fUrl").hidden=e.target.value!=="url";$("fFolder").hidden=e.target.value==="eagle"}});
let pendingFolder=null;
const pref=(k,v)=>{try{if(v===undefined)return localStorage.getItem("tehon-"+k);localStorage.setItem("tehon-"+k,v)}catch(e){return null}};
/* palette themes come from プリプロ名人 (src/themes.json, scripts/import-themes.mjs); [bg,panel,line,text,muted,accent,danger,lane] per tone */
const THEME_KEYS=["--bg","--panel","--line","--text","--muted","--accent","--danger","--lane"];
const customThemes=()=>{try{return JSON.parse(pref("themes-custom")||"[]")}catch(e){return[]}};
const allThemes=()=>[...PTHEMES,...customThemes()];
const findTheme=t=>allThemes().find(x=>x.id===t);
const lum=h=>{const c=[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255).map(v=>v<=.03928?v/12.92:((v+.055)/1.055)**2.4);return .2126*c[0]+.7152*c[1]+.0722*c[2]};
const contrast=(a,b)=>{const x=lum(a),y=lum(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
const darkQ=matchMedia("(prefers-color-scheme:dark)");
const TVARS=["--bg","--surface","--line","--fg","--muted","--accent","--accent-soft","--accent-ink","--on-accent","--fav","color-scheme"];
function setTheme(t){
  const r=document.documentElement,P=findTheme(t)||findTheme(t="default"),tone=pref("tone")||"auto",dk=tone==="dark"||tone==="auto"&&darkQ.matches;
  const[bg,panel,line,text,muted,accent,danger,lane]=dk?P.d:P.l;
  [bg,panel,line,text,muted,accent,lane,contrast(accent,lane)>=3?accent:text,contrast(text,accent)>contrast(panel,accent)?text:panel,danger,dk?"dark":"light"].forEach((v,i)=>r.style.setProperty(TVARS[i],v));
  pref("theme",t);syncSettings()}
darkQ.addEventListener("change",()=>setTheme(pref("theme")));
/* swatch tiles like 尺取名人: the palette fills the tile, the name sits on top */
const DEFAULT_SW=["#E8EFEA","#3772FF","#DF2935","#FDCA40","#2FA866","#A065E0","#F8902F","#34C3DB"];
function tile(attr,v,name,sw){
  return`<button type="button" class="tile" data-${attr}="${esc(v)}" aria-pressed="false"><span class="sw">${sw.map(c=>`<i style="background:${c}"></i>`).join("")}</span><span class="tn">${esc(name)}</span></button>`}
const themeTiles=()=>allThemes().map(x=>tile("theme",x.id,x.name,x.id==="default"?DEFAULT_SW:x.p.length?x.p:[...new Set(x.l)])).join("");
const VBGS=[["dark","黒",["#06080c"]],["blur","透明ぼかし",["#b4b9c3","#78829a"]],["light","ライトグレー",["#e9ecf1"]]];
function seg(id,opts,cur){return`<div class="segc" id="${id}" role="group">${opts.map(([v,l])=>`<button type="button" data-v="${v}" aria-pressed="${v===cur}">${l}</button>`).join("")}</div>`}
function syncSettings(){
  document.querySelectorAll("#fThemes .tile").forEach(b=>b.setAttribute("aria-pressed",b.dataset.theme===pref("theme")));
  document.querySelectorAll("#fVbgs .tile").forEach(b=>b.setAttribute("aria-pressed",b.dataset.vbg===(pref("vbg")||"dark")));
  document.querySelectorAll("#fTone button").forEach(b=>b.setAttribute("aria-pressed",b.dataset.v===(pref("tone")||"auto")))}
function importTheme(file){file.text().then(txt=>{
  const j=JSON.parse(txt),list=j.format==="vconte-theme-set"?j.themes:[j],hex=/^#[0-9a-f]{6}$/i,cu=customThemes();let last=null;
  for(const x of list){const l=THEME_KEYS.map(k=>x.light?.app?.[k]),d=THEME_KEYS.map(k=>x.dark?.app?.[k]);
    if(![...l,...d].every(v=>hex.test(v||"")))continue;
    const th={id:"x:"+x.id,name:x.name||x.id,p:(x.palette||[]).filter(v=>hex.test(v)),l,d};const i=cu.findIndex(y=>y.id===th.id);if(i<0)cu.push(th);else cu[i]=th;last=th.id}
  if(!last)return toast("テーマのファイルではありません");
  pref("themes-custom",JSON.stringify(cu));if($("fThemes"))$("fThemes").innerHTML=themeTiles();setTheme(last);toast("テーマを読み込みました");
}).catch(()=>toast("テーマのファイルではありません"))}
function setVBg(b){["dark","blur","light"].forEach(x=>$("viewer").classList.toggle("bg-"+x,x===b&&x!=="dark"));document.querySelectorAll(".swatch").forEach(w=>w.classList.toggle("on",w.dataset.bg===b));pref("vbg",b);syncSettings()}
document.querySelectorAll(".swatch").forEach(w=>w.onclick=()=>setVBg(w.dataset.bg));
setTheme(pref("theme"));setVBg(pref("vbg")||"dark");
const H=t=>`<div class="sh">${t}</div>`;
$("setBtn").onclick=()=>{closeNav();
  formDlg("設定",`${H("カラーテーマ")}${seg("fTone",[["auto","自動"],["light","ライト"],["dark","ダーク"]],pref("tone")||"auto")}<div class="tiles" id="fThemes">${themeTiles()}</div><button type="button" class="btn" id="fThemeFile">テーマを読み込む（.json）</button>
  ${H("ビューアの背景")}<div class="tiles" id="fVbgs">${VBGS.map(([v,l,sw])=>tile("vbg",v,l,sw)).join("")}</div>
  ${dbx.isConfigured()?`${H("Dropbox")}<button type="button" class="btn" id="fDbx">${dbxMode?"切断":"接続"}</button>`:""}`,"閉じる",()=>{},
  ()=>{$("dlgForm").classList.add("set");syncSettings();$("dCancel").hidden=true;
    $("fThemes").onclick=e=>{const b=e.target.closest(".tile");if(b)setTheme(b.dataset.theme)};
    $("fVbgs").onclick=e=>{const b=e.target.closest(".tile");if(b)setVBg(b.dataset.vbg)};
    $("fTone").onclick=e=>{const b=e.target.closest("button");if(b){pref("tone",b.dataset.v);setTheme(pref("theme"))}};
    $("fThemeFile").onclick=()=>{const i=document.createElement("input");i.type="file";i.accept=".json,application/json";i.onchange=()=>i.files[0]&&importTheme(i.files[0]);i.click()};
    const b=$("fDbx");if(b)b.onclick=async()=>{if(!dbxMode)return dbx.startAuth();flushSave();await dbx.disconnect();location.reload()}})};
const TEXT=["txt","md","text","csv","json"];
async function readText(it){
  if(it.text!=null)return it.text;
  if(it.dbx){if(it.textP)return it.textP;return it.textP=dbx.readText(it.id).then(r=>{it.readonly=r.truncated||r.enc==="Shift_JIS";it.enc=r.enc;it.rev=r.rev||it.rev;it.text=r.text;return r.text}).catch(()=>{it.textP=null;return ""})}
  if(!it.file)return "";
  if(it.file.size>2e6){it.readonly=true;it.text=new TextDecoder().decode(await it.file.slice(0,2e6).arrayBuffer());return it.text}
  const buf=await it.file.arrayBuffer();
  try{it.text=new TextDecoder("utf-8",{fatal:true}).decode(buf);it.enc="UTF-8"}catch(e){it.text=new TextDecoder("shift_jis").decode(buf);it.enc="Shift_JIS"}
  return it.text;
}
async function importEagleDropbox(){
  flushSave();$("sync").lastChild.textContent="読み込み中";
  try{
    const r=await eagle.importAll(own,m=>toast(`読み込み中 ${m}`));
    if(!r.libs.length){$("sync").lastChild.textContent="Dropbox";return toast(`${eagle.EAGLE_DIR} にEagleライブラリがありません`)}
    await loadDropbox();
    toast(`${r.libs.join("・")}：${r.items} 件、URL ${r.urls} 件を取り込みました${r.failed?`（${r.failed} 件は取り込めませんでした）`:""}`);
  }catch(e){$("sync").lastChild.textContent="Dropbox";toast("Eagleライブラリを取り込めませんでした")}
}
$("eagleDir").onchange=e=>{const fs=[...e.target.files];e.target.value="";importEagle(fs)};
const VIEWABLE=["jpg","jpeg","png","gif","webp","bmp","svg","avif","ico"],VIDEO=["mp4","webm","mov","m4v","ogv"];
async function importEagle(files){
  const dirs=new Map();let rootMeta=null,tagsJson=null;
  for(const f of files){const p=f.webkitRelativePath||f.name;const k=p.lastIndexOf("/");const d=p.slice(0,k+1);(dirs.get(d)||dirs.set(d,[]).get(d)).push(f);
    if(/^[^/]+\/metadata\.json$/.test(p))rootMeta=f}
  if(!rootMeta){toast("Eagleのライブラリフォルダ（〜.library）を選んでください");return}
  let lib;try{lib=JSON.parse(await rootMeta.text())}catch(e){toast("ライブラリのmetadata.jsonを読み込めませんでした");return}
  const fmap=new Map(),paths=[];
  (function walk(arr,pre){for(const f of arr||[]){const q=pre?pre+"/"+f.name.replace(/\//g,"／"):f.name.replace(/\//g,"／");fmap.set(f.id,q);paths.push(q);walk(f.children,q)}})(lib.folders,"");
  const metaDirs=[...dirs.keys()].filter(d=>/\/images\/[^/]+\.info\/$/.test(d));
  const out=[];let done=0,bad=0;
  for(let i=0;i<metaDirs.length;i+=200){
    await Promise.all(metaDirs.slice(i,i+200).map(async d=>{
      const fl=dirs.get(d);const mf=fl.find(f=>f.name==="metadata.json");if(!mf)return;
      try{const m=JSON.parse(await mf.text());const ext=(m.ext||"").toLowerCase();
        const th=fl.find(f=>f.name.endsWith("_thumbnail.png"));const orig=fl.find(f=>f!==mf&&f!==th&&f.name!=="metadata.json");
        const kind=ext==="url"?"url":ext==="gif"?"gif":VIDEO.includes(ext)?"video":TEXT.includes(ext)?"text":"image";
        out.push({id:"id:eagle"+m.id,name:m.name+(ext&&ext!=="url"?"."+ext:""),folder:fmap.get((m.folders||[])[0])||"未分類",kind,badge:kind==="image"&&!VIEWABLE.includes(ext)?ext:null,
          tags:m.tags||[],favorite:(m.star||0)>0,star:m.star||0,url:m.url||null,w:m.width||0,h:m.height||0,addedAt:m.btime||m.modificationTime||0,trashed:!!m.isDeleted,
          local:true,file:orig,thumbFile:th,viewable:VIEWABLE.includes(ext)||VIDEO.includes(ext)});
      }catch(e){bad++}
    }));
    done=Math.min(i+200,metaDirs.length);toast(`読み込み中 ${done} / ${metaDirs.length}`);
  }
  out.forEach(it=>{if(it.kind==="url"&&!it.url)it.kind="image";if(it.kind==="text"){it.badge=null;it.blobUrl=null;return}const src=it.thumbFile||(it.viewable&&it.kind!=="video"?it.file:null);it.blobUrl=src?URL.createObjectURL(src):null});
  if(out.some(i=>i.folder==="未分類"))paths.push("未分類");
  eagleMode=true;items=out;FOLDERS=paths;TAGS.length=0;TAGS.push(...new Set(out.flatMap(i=>i.tags)));
  st.view="all";st.folder=null;st.tag=null;st.q="";$("q").value="";st.sel.clear();
  $("sync").lastChild.textContent="Eagle";
  render();toast(`${out.length} 件を読み込みました${bad?`（${bad} 件は読み込めませんでした）`:""}。変更は保存されません`);
}
$("file").onchange=e=>{addFiles([...e.target.files],pendingFolder);e.target.value=""};
async function uploadFiles(files,folder){
  folder=folder??st.folder??"";let n=0,bad=0;
  for(const f of files){
    toast(`アップロード中 ${n+bad+1} / ${files.length}`);
    try{const e=await dbx.upload(folder,f);const it=dbxItem(e,null);it.addedAt=Date.now();items.unshift(it);snap.set(it.id,JSON.stringify(metaOf(it)));n++}catch(e){bad++}
  }
  render();toast(`${n} 件を追加しました${bad?`（${bad} 件はアップロードできませんでした）`:""}`);
}
function addFiles(files,folder){
  if(dbxMode)return uploadFiles(files,folder);
  folder=folder||st.folder||FOLDERS[0];let n=0;
  for(const f of files){
    const kind=f.type.startsWith("video/")?"video":f.type==="image/gif"?"gif":f.type.startsWith("image/")?"image":(f.type.startsWith("text/")||/\.(txt|md)$/i.test(f.name))?"text":null;if(!kind)continue;
    items.unshift({id:"id:local"+Date.now()+n,name:f.name,folder,kind,tags:[],favorite:false,addedAt:Date.now(),trashed:false,blobUrl:kind==="text"?null:URL.createObjectURL(f),file:f,local:true});n++;
  }
  render();toast(n?`${n} 件を追加しました（このデモでは再読み込みで消えます）`:"画像・動画・テキストファイルを選んでください");
}
let dc=0;
addEventListener("dragenter",e=>{if(e.dataTransfer?.types.includes("Files")){dc++;$("drop").hidden=false}});
addEventListener("dragleave",()=>{if(--dc<=0){dc=0;$("drop").hidden=true}});
addEventListener("dragover",e=>e.preventDefault());
addEventListener("drop",e=>{e.preventDefault();dc=0;$("drop").hidden=true;if(e.dataTransfer.files.length)addFiles([...e.dataTransfer.files])});
const closeNav=()=>$("app").classList.remove("nav-open");
$("menuBtn").onclick=()=>$("app").classList.add("nav-open");
$("scrim").onclick=closeNav;

/* dialogs */
function formDlg(title,html,ok,fn,init){
  const f=$("dlgForm");f.className="";f.innerHTML=`<h4></h4>${html}<div class="row"><button type="button" class="btn" id="dCancel">キャンセル</button><button class="btn pri">${ok}</button></div>`;
  f.querySelector("h4").textContent=title;$("dlg").hidden=false;init&&init();f.querySelector("input:not([hidden]),select")?.focus();
  $("dCancel").onclick=()=>$("dlg").hidden=true;
  f.onsubmit=e=>{e.preventDefault();$("dlg").hidden=true;fn()};
}
function confirmDlg(title,msg,fn){formDlg(title,`<div style="color:var(--muted);font-size:13px"></div>`,"削除",fn);$("dlgForm").querySelector("div").textContent=msg}
$("dlg").addEventListener("keydown",e=>{if(e.key==="Escape")$("dlg").hidden=true});
let tt;function toast(m){const t=$("toast");t.textContent=m;t.hidden=false;clearTimeout(tt);tt=setTimeout(()=>t.hidden=true,2400)}

/* viewer */
const V={i:0,z:1,x:0,y:0,fit:1,raf:0,play:true,img:null,video:null};
const vc=$("vc"),vx=vc.getContext("2d");
function openViewer(i){V.i=i;$("viewer").hidden=false;loadV()}
const vi=$("vi"),vv=$("vv");
const vt=$("vt");let vtTimer;
function useEl(el,w,h){[vc,vi,vv,vt].forEach(x=>x.hidden=x!==el);["vIn","vOut","vFit"].forEach(b=>$(b).hidden=el===vt);if(el===vt){V.el=null;return}V.el=el;V.w=w;V.h=h;fitV()}
function closeViewer(){$("viewer").hidden=true;cancelAnimationFrame(V.raf);vv.pause();vv.removeAttribute("src");vi.removeAttribute("src");renderGrid();$("grid").children[V.i]?.focus()}
function loadV(){
  cancelAnimationFrame(V.raf);vv.pause();V.video=null;
  const it=list[V.i];$("vTitle").textContent=it.name;$("vFav").classList.toggle("on",it.favorite);
  const anim=it.kind==="gif"||it.kind==="video";$("vPlay").hidden=!anim||((it.local||it.dbx)&&it.kind==="gif");V.play=true;$("vPlay").textContent="❚❚";
  renderFoot(it);$("vState").textContent="";$("vReload").hidden=true;
  if(it.conflict){it.conflict=false;it.text=null;it.textP=null}
  if(it.kind==="text"){useEl(vt);vt.value="";readText(it).then(t=>{if(list[V.i]!==it)return;vt.value=t;vt.readOnly=!!it.readonly;
      $("vState").textContent=it.readonly?(it.enc==="Shift_JIS"&&it.dbx?"Shift_JIS・閲覧のみ":"2MBを超えるため閲覧のみ"):it.enc==="Shift_JIS"?"Shift_JIS":"";$("vReload").hidden=true});
    vt.oninput=()=>{if(it.conflict)return;clearTimeout(vtTimer);$("vState").textContent="編集中";vtTimer=setTimeout(()=>saveText(it,vt.value),600)};return}
  if(it.kind==="url"){vc.width=800;vc.height=450;vx.fillStyle=getComputedStyle(document.documentElement).getPropertyValue("--accent");vx.fillRect(0,0,800,450);vx.fillStyle=getComputedStyle(document.documentElement).getPropertyValue("--on-accent");vx.font="500 28px sans-serif";vx.fillText(it.name,40,200);vx.font="20px monospace";vx.fillText(it.url,40,250);useEl(vc,800,450);return}
  if(it.dbx){
    const show=src=>{if(list[V.i]!==it||$("viewer").hidden)return;
      if(it.kind==="video"){V.video=vv;vv.onloadedmetadata=()=>{useEl(vv,vv.videoWidth,vv.videoHeight);vv.play()};vv.onerror=()=>toast("この動画形式はブラウザで再生できません");vv.src=src}
      else{vi.onload=()=>useEl(vi,vi.naturalWidth,vi.naturalHeight);vi.onerror=()=>toast("プレビューできない形式です");vi.src=src}};
    [vc,vi,vv].forEach(x=>x.hidden=true);V.el=null;
    if(!it.viewable){const t=thumbCache.get(it.id);if(t&&t!==BLANK){show(t);toast("サムネイルを表示しています")}else toast("プレビューできない形式です");return}
    (it.link&&Date.now()<it.linkExp?Promise.resolve(it.link):dbx.tempLink(it.id).then(l=>{it.link=l;it.linkExp=Date.now()+3.5*3600e3;return l})).then(show).catch(()=>toast("読み込めませんでした"));
    return;
  }
  if(it.local){
    const src=it.file&&it.viewable!==false?(it.srcUrl||=URL.createObjectURL(it.file)):it.blobUrl;
    if(!src){toast("プレビューできない形式です");return}
    if(it.kind==="video"){V.video=vv;vv.onloadedmetadata=()=>{useEl(vv,vv.videoWidth,vv.videoHeight);vv.play()};vv.onerror=()=>toast("この動画形式はブラウザで再生できません");vv.src=src;return}
    vi.onload=()=>useEl(vi,vi.naturalWidth,vi.naturalHeight);vi.onerror=()=>toast("プレビューできない形式です");vi.src=src;
    if(it.viewable===false&&it.blobUrl)toast("サムネイルを表示しています");return;
  }
  const W=Math.round(it.w/2),H=Math.round(it.h/2);vc.width=W;vc.height=H;draw(vx,it,W,H);useEl(vc,W,H);
  if(anim){let t0=performance.now(),acc=0;const f=n=>{if(V.play)acc+=(n-t0)/1000;t0=n;draw(vx,it,W,H,acc*(it.kind==="gif"?3:1.2));V.raf=requestAnimationFrame(f)};V.raf=requestAnimationFrame(f)}
}
// Dropbox text is written back only if nobody changed it since it was read (rev check); a conflict stops autosave until reloaded.
async function saveText(it,value){
  if(!it.dbx){it.text=value;save();renderGrid();$("vState").textContent=it.local||eagleMode?"保存しました（このデモ内のみ）":"保存しました";return}
  $("vState").textContent="保存中";
  try{const m=await dbx.writeText(it.path,value,it.rev);it.rev=m.rev;it.size=m.size;it.text=value;renderGrid();if(list[V.i]===it)$("vState").textContent="保存しました"}
  catch(e){if(list[V.i]!==it)return;if(e instanceof dbx.ConflictError){it.conflict=true;$("vState").textContent="他の端末で更新されたため保存していません";$("vReload").hidden=false}else $("vState").textContent="保存できませんでした"}
}
$("vReload").onclick=()=>{const it=list[V.i];it.conflict=false;it.text=null;it.textP=null;loadV()};
function renderFoot(it){
  const f=$("vfoot");f.replaceChildren();
  for(const t of it.tags){const s=document.createElement("span");s.className="tag";s.textContent="# "+t;const x=document.createElement("button");x.textContent="✕";x.setAttribute("aria-label","タグを外す");x.onclick=()=>{it.tags=it.tags.filter(z=>z!==t);save();renderFoot(it);renderSide()};s.append(x);f.append(s)}
  const inp=document.createElement("input");inp.placeholder="＋ タグ";inp.id="vTagInput";inp.setAttribute("list","vTags");
  const dl=document.createElement("datalist");dl.id="vTags";dl.innerHTML=TAGS.map(t=>`<option value="${t}">`).join("");
  inp.onkeydown=e=>{e.stopPropagation();if(e.key==="Enter"&&inp.value.trim()){const t=inp.value.trim();if(!it.tags.includes(t))it.tags.push(t);save();renderFoot(it);renderSide();$("vTagInput").focus()}if(e.key==="Escape")inp.blur()};
  const p=document.createElement("span");p.className="path";p.textContent=`/${it.folder}${it.w?` · ${it.w}×${it.h}`:""}`;
  f.append(inp,dl,p);
}
function fitV(){if(!V.el||V.el===vt)return;const r=$("stage").getBoundingClientRect();V.fit=Math.min(r.width/V.w,r.height/V.h,1)*.96;V.z=V.fit;V.x=0;V.y=0;applyV()}
function applyV(){if(!V.el)return;V.el.style.width=V.w+"px";V.el.style.height=V.h+"px";V.el.style.transform=`translate(${V.x-V.w*V.z/2}px,${V.y-V.h*V.z/2}px) scale(${V.z})`;$("vZoom").textContent=Math.round(V.z*100)+"%"}
function zoomAt(f,cx=0,cy=0){if(!V.el)return;const nz=Math.max(.05,Math.min(16,V.z*f));const k=nz/V.z;V.x=cx-(cx-V.x)*k;V.y=cy-(cy-V.y)*k;V.z=nz;applyV()}
$("vIn").onclick=()=>zoomAt(1.25);$("vOut").onclick=()=>zoomAt(.8);
$("vFit").onclick=()=>{if(Math.abs(V.z-V.fit)<.001){V.z=1;V.x=0;V.y=0;applyV()}else fitV()};
$("vClose").onclick=closeViewer;
$("vPrev").onclick=()=>{if(V.i>0){V.i--;loadV()}};$("vNext").onclick=()=>{if(V.i<list.length-1){V.i++;loadV()}};
$("vFav").onclick=()=>{const it=list[V.i];it.favorite=!it.favorite;save();$("vFav").classList.toggle("on",it.favorite);renderSide()};
$("vPlay").onclick=()=>{V.play=!V.play;$("vPlay").textContent=V.play?"❚❚":"▶";if(V.video)V.play?V.video.play():V.video.pause()};
const stage=$("stage");const pts=new Map();let pinch=null;
const rel=e=>{const r=stage.getBoundingClientRect();return[e.clientX-r.left-r.width/2,e.clientY-r.top-r.height/2]};
stage.addEventListener("wheel",e=>{if(e.target===vt)return;e.preventDefault();const [x,y]=rel(e);zoomAt(Math.exp(-e.deltaY*.0015),x,y)},{passive:false});
stage.addEventListener("pointerdown",e=>{if(e.target===vt)return;stage.setPointerCapture(e.pointerId);pts.set(e.pointerId,[e.clientX,e.clientY]);if(pts.size===2){const [a,b]=[...pts.values()];pinch={d:Math.hypot(a[0]-b[0],a[1]-b[1])}}});
stage.addEventListener("pointermove",e=>{if(!pts.has(e.pointerId))return;const p=pts.get(e.pointerId);
  if(pts.size===2&&pinch){pts.set(e.pointerId,[e.clientX,e.clientY]);const [a,b]=[...pts.values()];const d=Math.hypot(a[0]-b[0],a[1]-b[1]);const r=stage.getBoundingClientRect();zoomAt(d/pinch.d,(a[0]+b[0])/2-r.left-r.width/2,(a[1]+b[1])/2-r.top-r.height/2);pinch.d=d;return}
  V.x+=e.clientX-p[0];V.y+=e.clientY-p[1];pts.set(e.pointerId,[e.clientX,e.clientY]);applyV()});
const up=e=>{const p=pts.get(e.pointerId);pts.delete(e.pointerId);if(pts.size<2)pinch=null};
stage.addEventListener("pointerup",up);stage.addEventListener("pointercancel",up);
let lastTap=0;stage.addEventListener("pointerup",e=>{if(e.target===vt)return;const n=Date.now();if(n-lastTap<300){const [x,y]=rel(e);Math.abs(V.z-V.fit)<.001?zoomAt(2.5/V.z*V.fit>1?2.5:1/V.z,x,y):fitV()}lastTap=n});
let sx=null;stage.addEventListener("touchstart",e=>{if(e.target===vt){sx=null;return}sx=e.touches.length===1&&Math.abs(V.z-V.fit)<.001?e.touches[0].clientX:null},{passive:true});
stage.addEventListener("touchend",e=>{if(sx==null)return;const dx=e.changedTouches[0].clientX-sx;if(Math.abs(dx)>70){fitV();dx<0?$("vNext").click():$("vPrev").click()}sx=null});
document.addEventListener("keydown",e=>{if($("viewer").hidden||e.target.id==="vTagInput")return;if(e.target===vt){if(e.key==="Escape")vt.blur();if((e.metaKey||e.ctrlKey)&&e.key==="s"){e.preventDefault();vt.oninput()}return}
  ({Escape:closeViewer,ArrowLeft:()=>$("vPrev").click(),ArrowRight:()=>$("vNext").click(),"+":()=>zoomAt(1.25),"=":()=>zoomAt(1.25),"-":()=>zoomAt(.8),"0":fitV,f:()=>$("vFav").click()," ":()=>$("vPlay").click(),t:()=>{e.preventDefault();$("vTagInput").focus()}}[e.key]||(()=>{}))()});
addEventListener("resize",()=>{if(!$("viewer").hidden)fitV()});

document.querySelectorAll(".sb").forEach(el=>{let t;el.addEventListener("scroll",()=>{el.classList.add("show");clearTimeout(t);t=setTimeout(()=>el.classList.remove("show"),900)},{passive:true})});
const authErr=await dbx.handleRedirect();
render();
if(authErr)toast(authErr);
if(await dbx.isConnected())loadDropbox();
})();
