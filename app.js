/* 견적 작업실 — 인테리어 견적 앱 (PWA)
 * 데이터는 이 기기(IndexedDB)에 먼저 저장하고, 로그인하면 Supabase와 동기화합니다.
 * 수정 후 배포할 때는 sw.js의 VERSION 숫자를 올려야 기기에 새 버전이 적용됩니다.
 */
const APP_VERSION = '2.6.1';

/* ---------- constants ---------- */
const PROCS = [
  {k:'demo',n:'철거',pat:'hatch'},{k:'plumb',n:'설비·방수',pat:'pipe'},{k:'elec',n:'전기·조명',pat:'wire'},
  {k:'carp',n:'목공',pat:'wood'},{k:'window',n:'창호·샷시',pat:'frame'},{k:'film',n:'필름',pat:'sheen'},
  {k:'paint',n:'도장',pat:'paint'},{k:'paper',n:'도배',pat:'paper'},{k:'tile',n:'타일',pat:'tile'},
  {k:'floor',n:'바닥재',pat:'plank'},{k:'bath',n:'욕실',pat:'hex'},{k:'kitchen',n:'주방·가구',pat:'cabinet'},
  {k:'etc',n:'기타·청소',pat:'dots'}];
const PMAP = Object.fromEntries(PROCS.map(p=>[p.k,p]));
const PY = 3.3058;
const ANTHROPIC_SDK_URL = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.126.0/+esm';

/* ---------- utils ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,7);
const num = v => { const n = parseFloat(String(v).replace(/,/g,'')); return isFinite(n) ? n : 0; };
const won = n => Math.round(n).toLocaleString('ko-KR');
const r1 = n => (Math.round(n*10)/10).toLocaleString('ko-KR');
const clone = o => JSON.parse(JSON.stringify(o));
const today = () => { const d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); };
const ls = { get(k,d=null){ try{ const v=localStorage.getItem('ie:'+k); return v==null?d:v; }catch{ return d; } }, set(k,v){ try{ v==null?localStorage.removeItem('ie:'+k):localStorage.setItem('ie:'+k,v); }catch{} } };
function toast(msg){ const t=document.createElement('div'); t.className='toast'; t.textContent=msg; document.body.appendChild(t); setTimeout(()=>t.remove(),2600); }
/* 현장 이름·고객 정보는 목록에서 이 작은 창으로만 고칩니다 (현장 화면에서는 보기만) */
function editSiteBox(p){
  return new Promise(res=>{
    const box=document.createElement('div'); box.className='modal';
    box.innerHTML=`<div class="modal-b ask" style="width:min(460px,100%)">
      <h3>현장 정보 수정</h3>
      <label class="fl">현장 이름<input class="f" id="es-name" value="${esc(p.name||'')}" placeholder="예: 상계동 주공 302동 1501호"></label>
      <div class="client-grid">
        <label class="fl">고객명<input class="f" id="es-client" value="${esc(p.client||'')}" placeholder="홍길동"></label>
        <label class="fl">연락처<input class="f" type="tel" id="es-phone" value="${esc(p.phone||'')}" placeholder="010-0000-0000"></label>
      </div>
      <label class="fl">현장 주소<input class="f" id="es-addr" value="${esc(p.address||'')}"></label>
      <div class="row" style="justify-content:flex-end;margin-top:6px">
        <button class="btn" data-x="no">취소</button><button class="btn pri" data-x="yes">저장</button></div></div>`;
    const close=save=>{
      if(save){ p.name=box.querySelector('#es-name').value.trim(); p.client=box.querySelector('#es-client').value.trim();
        p.phone=box.querySelector('#es-phone').value.trim(); p.address=box.querySelector('#es-addr').value.trim(); saveProj(p); }
      box.remove(); document.removeEventListener('keydown',key); res(save);
    };
    const key=e=>{ if(e.key==='Escape') close(false); if(e.key==='Enter'&&e.target.tagName==='INPUT') close(true); };
    box.addEventListener('click',e=>{ const b=e.target.closest('[data-x]'); if(b) close(b.dataset.x==='yes'); else if(e.target===box) close(false); });
    document.addEventListener('keydown',key);
    document.body.appendChild(box);
    const el=box.querySelector('#es-name'); el.focus(); el.select();
  });
}
/* 실수로 눌러도 바로 지워지지 않도록, 직접 “삭제”를 한 번 더 고르게 합니다 */
function askConfirm({title,lines=[],ok='삭제',cancel='취소',danger=true}){
  return new Promise(res=>{
    const box=document.createElement('div'); box.className='modal';
    box.innerHTML=`<div class="modal-b ask">
      <h3>${esc(title)}</h3>
      ${lines.length?`<ul class="ask-l">${lines.map(l=>`<li>${esc(l)}</li>`).join('')}</ul>`:''}
      <div class="row" style="justify-content:flex-end;margin-top:6px">
        <button class="btn" data-x="no">${esc(cancel)}</button>
        <button class="btn ${danger?'del':'pri'}" data-x="yes">${esc(ok)}</button>
      </div></div>`;
    const close=v=>{ box.remove(); document.removeEventListener('keydown',key); res(v); };
    const key=e=>{ if(e.key==='Escape') close(false); };
    box.addEventListener('click',e=>{ const b=e.target.closest('[data-x]'); if(b) close(b.dataset.x==='yes'); else if(e.target===box) close(false); });
    document.addEventListener('keydown',key);
    document.body.appendChild(box);
    box.querySelector('[data-x="no"]').focus();
  });
}
function krWords(n){
  n=Math.round(n); if(n<=0) return '영';
  const d=['','일','이','삼','사','오','육','칠','팔','구'],u=['','십','백','천'],big=['','만','억','조'];
  let s='',i=0;
  while(n>0){ let c=n%10000, part='', j=0; while(c>0){ const g=c%10; if(g) part=d[g]+u[j]+part; c=Math.floor(c/10); j++; } if(part) s=part+big[i]+s; n=Math.floor(n/10000); i++; }
  return s;
}
const isTouch = () => matchMedia('(pointer:coarse)').matches;
/* 숫자만 적어도 전화번호 모양으로 바꿔줍니다 (010-1234-5678, 02-123-4567, 1588-1234) */
function formatPhone(v){
  const d=String(v??'').replace(/\D/g,'').slice(0,11);
  if(!d) return '';
  if(d.startsWith('02')){
    if(d.length<=2) return d;
    if(d.length<=5) return `${d.slice(0,2)}-${d.slice(2)}`;
    if(d.length<=9) return `${d.slice(0,2)}-${d.slice(2,5)}-${d.slice(5)}`;
    return `${d.slice(0,2)}-${d.slice(2,6)}-${d.slice(6,10)}`;
  }
  if(/^1[5-9]\d\d/.test(d) && d.length<=8) return d.length<=4 ? d : `${d.slice(0,4)}-${d.slice(4)}`;
  if(d.length<=3) return d;
  if(d.length<=7) return `${d.slice(0,3)}-${d.slice(3)}`;
  if(d.length<=10) return `${d.slice(0,3)}-${d.slice(3,6)}-${d.slice(6)}`;
  return `${d.slice(0,3)}-${d.slice(3,7)}-${d.slice(7)}`;
}
async function shareOrDownload(filename, blob){
  const file = new File([blob], filename, {type: blob.type});
  if(isTouch() && navigator.canShare?.({files:[file]})){
    try{ await navigator.share({files:[file], title:filename}); return true; }catch(e){ if(e?.name==='AbortError') return false; }
  }
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=filename; document.body.appendChild(a); a.click();
  setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  return true;
}

/* ---------- material swatches (drawn on canvas) ---------- */
const swCache = {};
function rng(seed){ let s=seed>>>0||1; return ()=>((s=Math.imul(s^s>>>15,1|s)+0x6D2B79F5|0, ((s^s>>>14)>>>0)/4294967296)); }
function hexA(h,a){ const n=parseInt(h.slice(1),16); return `rgba(${n>>16},${n>>8&255},${n&255},${a})`; }
function shade(h,f){ const n=parseInt(h.slice(1),16); let r=n>>16,g=n>>8&255,b=n&255; const t=f<0?0:255,p=Math.abs(f); r=Math.round((t-r)*p+r);g=Math.round((t-g)*p+g);b=Math.round((t-b)*p+b); return '#'+((1<<24)+(r<<16)+(g<<8)+b).toString(16).slice(1); }
const DEF_TONE = {hatch:'#9a9892',pipe:'#b87333',wire:'#2b2f33',wood:'#d8b98a',frame:'#8d9399',sheen:'#b89a78',paint:'#e9e5dc',paper:'#efece6',tile:'#e7e6e2',plank:'#b9885a',hex:'#dfe6e8',cabinet:'#e8e4dc',dots:'#cfd6d2'};
function swatch(pat, tone){
  tone = /^#[0-9a-f]{6}$/i.test(tone||'') ? tone : DEF_TONE[pat] || '#cccccc';
  const key = pat+tone; if(swCache[key]) return swCache[key];
  const W=320,H=240,c=document.createElement('canvas'); c.width=W;c.height=H; const g=c.getContext('2d'); const R=rng(key.split('').reduce((a,ch)=>a*31+ch.charCodeAt(0),7));
  g.fillStyle=tone; g.fillRect(0,0,W,H);
  const line=(x1,y1,x2,y2,col,w)=>{g.strokeStyle=col;g.lineWidth=w;g.beginPath();g.moveTo(x1,y1);g.lineTo(x2,y2);g.stroke();};
  switch(pat){
    case 'hatch':
      for(let x=-H;x<W;x+=16) line(x,H,x+H,0,hexA(shade(tone,-.35),.5),2);
      for(let i=0;i<14;i++){ g.fillStyle=shade(tone,(R()-.5)*.5); g.beginPath(); const x=R()*W,y=R()*H,s=8+R()*22; g.moveTo(x,y); for(let k=0;k<5;k++) g.lineTo(x+(R()-.5)*s*2,y+(R()-.5)*s*2); g.fill(); }
      break;
    case 'pipe':
      g.fillStyle='#e9ecee'; g.fillRect(0,0,W,H); g.lineCap='round';
      [[tone,34,[[-10,70],[180,70],[180,260]]],['#8fa4b3',26,[[340,160],[90,160],[90,-10]]]].forEach(([col,w,pts])=>{
        g.strokeStyle=shade(col,-.25);g.lineWidth=w+4;g.beginPath();pts.forEach((p,i)=>i?g.lineTo(...p):g.moveTo(...p));g.stroke();
        g.strokeStyle=col;g.lineWidth=w;g.stroke(); g.strokeStyle=hexA('#ffffff',.35);g.lineWidth=w/4;g.stroke();});
      break;
    case 'wire':
      ['#d0392b','#2c6fbb','#e4c21c','#3e9a4f','#f2f2f2'].forEach((col,i)=>{ g.strokeStyle=col;g.lineWidth=9;g.lineCap='round';g.beginPath(); g.moveTo(-10,40+i*38); g.bezierCurveTo(100,10+i*50,200,200-i*30,340,60+i*36); g.stroke(); g.strokeStyle=hexA('#ffffff',.3);g.lineWidth=2;g.stroke(); });
      break;
    case 'wood':
      for(let y=0;y<H;y+=3){ g.strokeStyle=hexA(shade(tone,-.3),.15+R()*.2); g.lineWidth=1; g.beginPath(); for(let x=0;x<=W;x+=8) g.lineTo(x,y+Math.sin(x/40+y/30)*4+R()*1.2); g.stroke(); }
      line(0,H/2,W,H/2,hexA('#000000',.25),2);
      break;
    case 'frame': {
      const gr=g.createLinearGradient(0,0,W,H); gr.addColorStop(0,'#cfe3ee'); gr.addColorStop(1,'#8fb3c8'); g.fillStyle=gr; g.fillRect(0,0,W,H);
      g.fillStyle=hexA('#ffffff',.35); g.beginPath(); g.moveTo(40,0);g.lineTo(110,0);g.lineTo(30,H);g.lineTo(-40,H);g.fill();
      g.strokeStyle=tone; g.lineWidth=22; g.strokeRect(11,11,W-22,H-22); line(W/2,0,W/2,H,tone,16);
      g.strokeStyle=shade(tone,-.3); g.lineWidth=2; g.strokeRect(22,22,W-44,H-44);
      break; }
    case 'sheen': {
      for(let y=0;y<H;y+=4){ g.strokeStyle=hexA(shade(tone,-.25),.2+R()*.15); g.lineWidth=1.5; g.beginPath(); for(let x=0;x<=W;x+=10) g.lineTo(x,y+Math.sin(x/55)*3); g.stroke(); }
      const gr=g.createLinearGradient(0,0,W,H); gr.addColorStop(.35,hexA('#ffffff',0)); gr.addColorStop(.5,hexA('#ffffff',.35)); gr.addColorStop(.65,hexA('#ffffff',0)); g.fillStyle=gr; g.fillRect(0,0,W,H);
      break; }
    case 'paint':
      for(let i=0;i<5;i++){ g.fillStyle=hexA(shade(tone,(R()-.5)*.12),.6); g.fillRect(i*70-10+R()*10,0,76,H); }
      for(let i=0;i<500;i++){ g.fillStyle=hexA(R()>.5?'#ffffff':'#000000',.035); g.fillRect(R()*W,R()*H,2,2); }
      g.fillStyle=hexA(shade(tone,-.4),.9); g.fillRect(W-98,H-70,70,26); g.fillStyle='#555'; g.fillRect(W-66,H-44,6,40);
      break;
    case 'paper':
      for(let y=0;y<H+30;y+=30) for(let x=((y/30)%2)*18;x<W+30;x+=36){ g.fillStyle=hexA(shade(tone,-.2),.35); g.beginPath(); g.moveTo(x,y-7);g.lineTo(x+5,y);g.lineTo(x,y+7);g.lineTo(x-5,y);g.fill(); }
      for(let i=0;i<900;i++){ g.fillStyle=hexA('#000000',.03); g.fillRect(R()*W,R()*H,1.5,1.5); }
      line(W*0.62,0,W*0.62,H,hexA('#000000',.12),1.5);
      break;
    case 'tile':
      for(let i=0;i<10;i++){ g.strokeStyle=hexA(shade(tone,-.35),.25); g.lineWidth=.8+R()*1.4; g.beginPath(); let x=R()*W,y=R()*H; g.moveTo(x,y); for(let k=0;k<6;k++){ x+=(R()-.3)*70; y+=(R()-.5)*40; g.lineTo(x,y);} g.stroke(); }
      for(let x=0;x<=W;x+=W/2) line(x,0,x,H,'#c4c1ba',5); for(let y=0;y<=H;y+=H/2) line(0,y,W,y,'#c4c1ba',5);
      break;
    case 'plank': {
      const ph=40; for(let r=0;r*ph<H;r++){ let x=-(r*97%180); while(x<W){ const w=150+R()*110; g.fillStyle=shade(tone,(R()-.5)*.22); g.fillRect(x,r*ph,w,ph);
        for(let k=0;k<6;k++){ g.strokeStyle=hexA(shade(tone,-.35),.18); g.lineWidth=1; g.beginPath(); const yy=r*ph+5+k*6; g.moveTo(x,yy); g.bezierCurveTo(x+w/3,yy+(R()-.5)*6,x+2*w/3,yy+(R()-.5)*6,x+w,yy); g.stroke(); }
        line(x,r*ph,x,r*ph+ph,hexA('#000000',.3),1.2); x+=w; }
        line(0,r*ph,W,r*ph,hexA('#000000',.3),1.2); }
      break; }
    case 'hex': {
      g.fillStyle='#b8bfc1'; g.fillRect(0,0,W,H); const s=14,hh=Math.sqrt(3)*s;
      for(let row=0;row*hh*0.5<H+hh;row++) for(let col=0;col*s*3<W+s*3;col++){ const cx=col*s*3+(row%2?s*1.5:0),cy=row*hh/2; g.fillStyle=shade(tone,(R()-.5)*.1); g.beginPath(); for(let k=0;k<6;k++){ const a=Math.PI/3*k; g.lineTo(cx+(s-1.5)*Math.cos(a),cy+(s-1.5)*Math.sin(a)); } g.fill(); }
      break; }
    case 'cabinet':
      g.fillStyle=shade(tone,-.08); g.fillRect(0,0,W,H);
      [[8,8,148,108],[164,8,148,108],[8,124,96,108],[112,124,96,108],[216,124,96,108]].forEach(([x,y,w,h])=>{ g.fillStyle=tone; g.fillRect(x,y,w,h); g.fillStyle=hexA('#ffffff',.25); g.fillRect(x,y,w,3); g.fillStyle='#6e6e6e'; g.fillRect(x+w/2-16,y+h-18,32,4); });
      break;
    default:
      for(let i=0;i<60;i++){ g.fillStyle=hexA(shade(tone,-.3),.3); g.beginPath(); g.arc(R()*W,R()*H,2+R()*6,0,7); g.fill(); }
  }
  return swCache[key] = c.toDataURL('image/jpeg',.82);
}
const procImg = k => swatch((PMAP[k]||PMAP.etc).pat);

/* ---------- local database (IndexedDB) ---------- */
const idb = {
  db:null, mem:new Map(),
  open(){ return new Promise(res=>{
    try{ const r=indexedDB.open('interior-estimate',1);
      r.onupgradeneeded=()=>r.result.createObjectStore('records',{keyPath:'key'});
      r.onsuccess=()=>{ this.db=r.result; res(true); }; r.onerror=()=>res(false); }catch{ res(false); } }); },
  tx(mode){ return this.db.transaction('records',mode).objectStore('records'); },
  req(r){ return new Promise((res,rej)=>{ r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); }); },
  async all(){ return this.db ? this.req(this.tx('readonly').getAll()) : [...this.mem.values()]; },
  async get(k){ return this.db ? this.req(this.tx('readonly').get(k)) : this.mem.get(k); },
  async put(rec){ if(!this.db){ this.mem.set(rec.key,rec); return; } return this.req(this.tx('readwrite').put(rec)); },
  async del(k){ if(!this.db){ this.mem.delete(k); return; } return this.req(this.tx('readwrite').delete(k)); },
  async clear(){ if(!this.db){ this.mem.clear(); return; } return this.req(this.tx('readwrite').clear()); },
};

/* ---------- app state ---------- */
const S = { materials:new Map(), estimates:new Map(), projects:new Map(), company:{}, curId:null, curPid:null };
const cur = () => S.estimates.get(S.curId);
const curProj = () => S.projects.get(S.curPid);
/* 현장을 고르면 그 현장에 연결된 견적도 함께 선택합니다 */
function selectSite(id){
  S.curPid=id; ls.set('curPid',id||null);
  const p=S.projects.get(id);
  if(p?.estimateId && S.estimates.has(p.estimateId)) setCur(p.estimateId);
}
function setCur(id){ S.curId=id; ls.set('cur',id||null); }
function strip(o){ const {id,...rest}=o; return rest; }

function applyRecord(col,id,data){
  if(col==='materials'){ if(data) S.materials.set(id,{...data,id}); else S.materials.delete(id); }
  else if(col==='estimates'){ if(data) S.estimates.set(id,{...data,id}); else S.estimates.delete(id); }
  else if(col==='projects'){ if(data) S.projects.set(id,{...data,id}); else S.projects.delete(id); }
  else if(col==='settings' && id==='company'){ S.company=data||{}; }
}
async function loadLocal(){
  const ok = await idb.open();
  if(!ok) toast('이 브라우저는 기기 저장을 막고 있습니다. 로그인하면 클라우드에만 저장됩니다.');
  const recs = await idb.all();
  recs.forEach(r=>{ if(!r.deleted) applyRecord(r.col,r.id,r.data); });
  S.curId = ls.get('cur');
  if(!S.estimates.has(S.curId)) S.curId=[...S.estimates.values()].sort((a,b)=>(b.updated||0)-(a.updated||0))[0]?.id||null;
  S.curPid = ls.get('curPid');
  if(!S.projects.has(S.curPid)) S.curPid=[...S.projects.values()].sort((a,b)=>(b.updated||0)-(a.updated||0))[0]?.id||null;
}

/* writes: debounced per record, flushed when the app goes to background */
const pending = new Map();
function queueWrite(col,id,getData,ms=500){
  const key=col+'/'+id;
  clearTimeout(pending.get(key)?.t);
  const fn=()=>{ pending.delete(key); const d=getData(); if(d==null) return; writeRecord(col,id,d); };
  pending.set(key,{t:setTimeout(fn,ms),fn});
}
function flushWrites(){ [...pending.values()].forEach(p=>{ clearTimeout(p.t); p.fn(); }); }
/* 삭제할 때 아직 저장 대기 중인 수정이 남아 있으면 지운 항목이 되살아납니다 */
function cancelWrite(col,id){ const key=col+'/'+id, p=pending.get(key); if(p){ clearTimeout(p.t); pending.delete(key); } }
async function writeRecord(col,id,data,deleted=false){
  await idb.put({key:col+'/'+id,col,id,data:deleted?null:data,updated:Date.now(),dirty:true,deleted});
  scheduleSync();
}
const saveMat = m => queueWrite('materials',m.id,()=>S.materials.has(m.id)?strip(S.materials.get(m.id)):null);
const saveEst = e => { e.updated=Date.now(); queueWrite('estimates',e.id,()=>S.estimates.has(e.id)?strip(S.estimates.get(e.id)):null); };
const saveCo = () => queueWrite('settings','company',()=>S.company);
const saveProj = p => { p.updated=Date.now(); queueWrite('projects',p.id,()=>S.projects.has(p.id)?strip(S.projects.get(p.id)):null); if(p.share?.on) schedulePublish(p.id); };
function deleteMat(id){ cancelWrite('materials',id); S.materials.delete(id); writeRecord('materials',id,null,true); }
function deleteEst(id){ cancelWrite('estimates',id); S.estimates.delete(id); writeRecord('estimates',id,null,true); }
function deleteProj(id){ const p=S.projects.get(id); if(p?.share?.token) unpublishShare(p.share.token);
  cancelWrite('projects',id); S.projects.delete(id); writeRecord('projects',id,null,true); }

/* ---------- cloud sync (Supabase) ---------- */
const CFG = window.APP_CONFIG || {};
const sbConf = () => ({ url:(CFG.SUPABASE_URL||ls.get('sb_url')||'').trim(), key:(CFG.SUPABASE_KEY||ls.get('sb_key')||'').trim() });
let sb=null, session=null, syncing=false, syncAgain=false, syncTimer=null, lastSyncAt=null, syncErr='';
function initSupabase(){
  const {url,key}=sbConf();
  if(!url||!key||!window.supabase) return null;
  try{ return window.supabase.createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}}); }catch(e){ console.warn(e); return null; }
}
function scheduleSync(ms=1500){ clearTimeout(syncTimer); syncTimer=setTimeout(sync,ms); updatePill(); }
async function countDirty(){ return (await idb.all()).filter(r=>r.dirty).length; }
async function sync(){
  if(!sb||!session){ updatePill(); return; }
  if(!navigator.onLine){ updatePill(); return; }
  if(syncing){ syncAgain=true; return; }
  syncing=true; syncErr=''; updatePill();
  try{ await push(); await pull(); lastSyncAt=new Date(); }
  catch(e){ console.warn('sync',e); syncErr=e?.message||String(e); }
  finally{ syncing=false; updatePill(); if(syncAgain){ syncAgain=false; scheduleSync(300); } }
}
async function push(){
  const dirty=(await idb.all()).filter(r=>r.dirty);
  const userId=session.user.id;
  for(let i=0;i<dirty.length;i+=15){
    const chunk=dirty.slice(i,i+15);
    const rows=chunk.map(r=>({user_id:userId,col:r.col,id:r.id,data:r.data,deleted:!!r.deleted,client_updated:r.updated}));
    const {error}=await sb.from('records').upsert(rows,{onConflict:'user_id,col,id'});
    if(error) throw error;
    for(const r of chunk){
      const now=await idb.get(r.key);
      if(now && now.updated===r.updated){ if(now.deleted) await idb.del(r.key); else { now.dirty=false; await idb.put(now); } }
    }
  }
}
async function pull(){
  const userId=session.user.id, markKey='pull:'+userId;
  let since=ls.get(markKey)||'1970-01-01T00:00:00Z';
  let changed=false;
  for(let page=0;page<50;page++){
    // first page re-reads a few seconds back (commits in flight); later pages use >= so rows sharing a timestamp aren't skipped
    let q=sb.from('records').select('col,id,data,deleted,client_updated,updated_at');
    q = page===0 ? q.gt('updated_at',new Date(new Date(since).getTime()-3000).toISOString()) : q.gte('updated_at',since);
    const {data,error}=await q.order('updated_at',{ascending:true}).limit(200);
    if(error) throw error;
    let advanced=false;
    for(const row of data){
      const key=row.col+'/'+row.id, local=await idb.get(key);
      if(row.updated_at>since){ since=row.updated_at; advanced=true; }
      if(local && local.dirty && local.updated>=Number(row.client_updated)) continue;
      if(local && !local.dirty && local.updated===Number(row.client_updated) && !row.deleted) continue;
      if(row.deleted){ if(local) await idb.del(key); applyRecord(row.col,row.id,null); changed=true; }
      else { await idb.put({key,col:row.col,id:row.id,data:row.data,updated:Number(row.client_updated),dirty:false,deleted:false}); applyRecord(row.col,row.id,row.data); changed=true; }
    }
    ls.set(markKey,since);
    if(data.length<200||!advanced) break;
  }
  if(changed){ if(!S.estimates.has(S.curId)) setCur([...S.estimates.values()].sort((a,b)=>(b.updated||0)-(a.updated||0))[0]?.id||null); safeRender(); }
}
async function updatePill(){
  const el=$('#syncPill'); if(!el||window.__viewerMode) return;
  el.hidden=false;
  const n=await countDirty();
  let s,t;
  if(!sb){ s='local'; t='이 기기에만 저장'; }
  else if(!session){ s='local'; t='로그인 안 됨'; }
  else if(!navigator.onLine){ s='offline'; t=n?`오프라인 · ${n}건 대기`:'오프라인'; }
  else if(syncing){ s='sync'; t='동기화 중'; }
  else if(syncErr){ s='err'; t='동기화 실패 · 다시 시도'; }
  else if(n){ s='sync'; t=`${n}건 올리는 중`; }
  else { s='ok'; t=lastSyncAt?`동기화됨 ${lastSyncAt.getHours()}:${String(lastSyncAt.getMinutes()).padStart(2,'0')}`:'동기화됨'; }
  el.dataset.s=s; el.textContent=t; el.title=syncErr||'';
}

/* ---------- calculation ---------- */
const FRAC_UNITS = ['m','kg','L','ℓ','㎏'];
function calcLine(l, procArea){
  const area = (l.area===''||l.area==null) ? procArea : num(l.area);
  const cov=num(l.coverage), loss=num(l.loss), price=num(l.unitPrice);
  let qty;
  if(l.mode==='qty' || cov<=0) qty = num(l.qty);
  else { const raw = area*(1+loss/100)/cov; qty = FRAC_UNITS.includes(l.unit) ? Math.ceil(raw*10)/10 : Math.ceil(raw-1e-9); }
  const cost = qty*price;
  const perM2 = (l.mode!=='qty' && cov>0) ? price/cov*(1+loss/100) : (area>0 ? cost/area : 0);
  return {area, qty, cost, perM2};
}
function calcProc(p, margin){
  const area=num(p.area);
  const lines=(p.lines||[]).map(l=>calcLine(l,area));
  const mat=lines.reduce((s,x)=>s+x.cost,0);
  const labor=area*num(p.laborPerM2)+num(p.laborLump);
  const cost=mat+labor;
  const price=Math.round(cost*(1+margin/100)/1000)*1000;
  return {area,lines,mat,labor,cost,price,perM2: area>0?cost/area:0};
}
function calcEst(e){
  const margin=num(e.margin);
  const procs=(e.processes||[]).map(p=>calcProc(p,margin));
  const mat=procs.reduce((s,x)=>s+x.mat,0), labor=procs.reduce((s,x)=>s+x.labor,0), cost=mat+labor;
  const gross=procs.reduce((s,x)=>s+x.price,0);
  const supply=Math.max(0,gross-num(e.discount));
  const vat=e.vat!==false?Math.round(supply*0.1):0;
  return {procs,mat,labor,cost,gross,supply,vat,total:supply+vat,profit:supply-cost,margin};
}

/* ---------- model helpers ---------- */
function newEstimate(){
  const n=S.estimates.size+1;
  return {id:uid(),no:today().replace(/-/g,'')+'-'+String(n).padStart(2,'0'),title:'',
    client:{name:'',phone:'',address:'',size:''},date:today(),validDays:30,margin:20,discount:0,vat:true,
    showLinePrice:false,showImages:true,notes:'· 본 견적은 현장 실측 후 변동될 수 있습니다.\n· 계약금 10% / 중도금 40% / 잔금 50%\n· 공사 기간 중 추가 요청 사항은 별도 협의합니다.',
    processes:[],updated:Date.now()};
}
function lineFromMat(m){ return {mid:m.id,name:m.name,spec:m.spec||'',unit:m.unit||'',unitPrice:num(m.unitPrice),coverage:num(m.coverage),loss:num(m.loss),mode:m.mode||(num(m.coverage)>0?'area':'qty'),qty:m.mode==='qty'?1:0,area:''}; }
function ensureProc(e,k){ let p=e.processes.find(x=>x.k===k); if(!p){ p={id:uid(),k,area:0,laborPerM2:0,laborLump:0,lines:[]}; e.processes.push(p); } return p; }
function lineImg(l,k){ const m=l.mid&&S.materials.get(l.mid); return m?.image || swatch((PMAP[k]||PMAP.etc).pat, m?.tone); }
function matImg(m){ return m.image || swatch((PMAP[m.process]||PMAP.etc).pat, m.tone); }
function matPerM2(m){ const c=num(m.coverage); return (m.mode!=='qty'&&c>0) ? num(m.unitPrice)/c*(1+num(m.loss)/100) : null; }
const perM2Html = v => v==null ? '<span class="muted small">수량 기준</span>' : won(v)+'원';
/* "84", "84㎡", "26평" 무엇을 넣어도 알아서 읽습니다. 평은 올림. */
const ceilPy = m2 => Math.round(m2/PY);   // 평수는 반올림
function parseArea(s){
  const txt=String(s??''), v=parseFloat(txt.replace(/,/g,'').match(/-?[\d.]+/)?.[0]||'');
  if(!isFinite(v)||v<=0) return {m2:0,py:0,typed:''};
  const inPy=/평/.test(txt);
  const m2 = inPy ? Math.round(v*PY*10)/10 : v;
  return {m2, py:ceilPy(m2), typed:inPy?'평':'㎡'};
}
/* 면적: 숫자 + 단위(㎡/평)를 따로 저장하고, 반대 단위를 같은 크기 글씨로 보여줍니다 */
function sizeOf(c){
  if(c && c.sizeVal!=null && c.sizeVal!=='') return {val:c.sizeVal, unit:c.sizeUnit==='py'?'py':'m2'};
  const a=parseArea(c?.size);                      // 예전에 글로 적어둔 값 읽기
  if(!a.m2) return {val:'', unit:'m2'};
  return a.typed==='평' ? {val:Math.round(a.m2/PY*10)/10, unit:'py'} : {val:a.m2, unit:'m2'};
}
function sizeConv(c){
  const {val,unit}=sizeOf(c); const v=num(val); if(!v) return '';
  return unit==='py' ? `= ${r1(v*PY)}㎡` : `= ${ceilPy(v)}평`;
}
function sizeText(c){
  const {val,unit}=sizeOf(c); const v=num(val); if(!v) return '';
  return unit==='py' ? `${r1(v)}평 (${r1(v*PY)}㎡)` : `${r1(v)}㎡ (${ceilPy(v)}평)`;
}
function areaHint(s){
  if(/평/.test(String(s))&&/㎡|m2/i.test(String(s))) return '';   // 이미 둘 다 적혀 있으면 그대로 둡니다
  const a=parseArea(s); if(!a.m2) return '';
  return a.typed==='평' ? `= ${r1(a.m2)}㎡` : `= ${a.py}평`;
}
const sizeHint = areaHint;

/* ---------- views ---------- */
let VIEW=ls.get('view','home');
let HOME_SEL=null, HOME_NEW=false;
let MAT_FILTER='all';
let IMPORT={files:[],urls:[],busy:false,items:null,memo:'',err:''};
let AUTH={mode:'login',busy:false,err:'',skipped:ls.get('skipLogin')==='1'};

function needLogin(){ return sb && !session && !AUTH.skipped; }
function render(){
  const tabs=$('#tabs');
  if(needLogin()){ tabs.hidden=true; $('#app').innerHTML=renderAuth(); updatePill(); return; }
  tabs.hidden=false;
  ['home','est','sched','mat','doc','set'].forEach(v=>$('#tab-'+v).setAttribute('aria-selected',String(v===VIEW)));
  const app=$('#app');
  if(VIEW==='home') app.innerHTML=renderHome();
  else if(VIEW==='sched') app.innerHTML=renderSched();
  else if(VIEW==='mat') app.innerHTML=renderMat();
  else if(VIEW==='doc') app.innerHTML=renderDocView();
  else if(VIEW==='set') app.innerHTML=renderSettings();
  else app.innerHTML=renderEst();
  if(VIEW==='est') recalc();
  updatePill();
}
let renderDeferred=false;
function safeRender(){
  const a=document.activeElement;
  if(a && a.closest?.('#app') && /INPUT|TEXTAREA|SELECT/.test(a.tagName)){ renderDeferred=true; return; }
  render();
}
document.addEventListener('keydown',ev=>{
  const c=ev.target.closest?.('.card'); if(!c) return;
  if(ev.key==='Enter'||ev.key===' '){ ev.preventDefault(); c.click(); }
});
/* 칸을 누르면 이미 있는 값이 통째로 선택돼, 지우지 않고 바로 덮어쓸 수 있습니다 */
document.addEventListener('focusin',ev=>{
  const t=ev.target;
  if(t.tagName!=='INPUT'||!t.value) return;
  if(['date','checkbox','radio','file','password','email','tel'].includes(t.type)) return;
  requestAnimationFrame(()=>{ try{ t.select(); }catch{} });
});
document.addEventListener('focusout',()=>{ if(renderDeferred) setTimeout(()=>{ const a=document.activeElement; if(!(a&&a.closest?.('#app')&&/INPUT|TEXTAREA|SELECT/.test(a.tagName))){ renderDeferred=false; render(); } },50); });

function renderAuth(){
  return `<div class="auth"><section class="panel">
    <div class="panel-h"><h2>로그인</h2></div>
    <form class="panel-b" id="loginForm">
      <p class="muted small" style="margin:0">아이폰·아이패드·노트북에서 같은 계정으로 로그인하면 견적과 단가표가 자동으로 맞춰집니다.</p>
      <label class="fl">이메일<input class="f" type="email" id="lg-email" name="username" autocomplete="username" required value="${esc(ls.get('lastEmail')||'')}"></label>
      <label class="fl">비밀번호<input class="f" type="password" id="lg-pw" name="password" autocomplete="current-password" required></label>
      <label class="row" style="gap:8px;font-size:13px"><input type="checkbox" id="lg-auto" ${ls.get('autoLogin')!=='0'?'checked':''}> 이 기기에서 자동 로그인</label>
      ${AUTH.err?`<div class="status err">${esc(AUTH.err)}</div>`:''}
      <button class="btn pri" type="submit" ${AUTH.busy?'disabled':''}>${AUTH.busy?'<span class="spin"></span> 로그인 중':'로그인'}</button>
      <button class="btn ghost" type="button" data-act="skipLogin">로그인 없이 이 기기에서만 쓰기</button>
    </form></section></div>`;
}

function estPicker(){
  const list=[...S.estimates.values()].sort((a,b)=>(b.updated||0)-(a.updated||0));
  return `<div class="row">
    ${list.length?`<select class="f" id="estSel" data-act-change="pick" style="width:auto;max-width:280px">${list.map(x=>`<option value="${x.id}" ${x.id===S.curId?'selected':''}>${esc(x.title||'제목 없음')} · ${esc(x.client?.name||'')}</option>`).join('')}</select>`:''}
    <button class="btn" data-act="newEst">+ 새 견적</button>
    ${cur()?`<button class="btn" data-act="dupEst">복제</button><button class="btn ghost danger" data-act="delEst">삭제</button>`:''}
  </div>`;
}

function renderEst(){
  const e=cur();
  if(!e) return `<div class="panel"><div class="empty"><h2 style="margin-bottom:6px">아직 견적이 없습니다</h2><p>새 견적을 만들거나, 예시 견적으로 구조를 먼저 살펴보세요.</p><div class="row" style="justify-content:center;margin-top:12px"><button class="btn pri" data-act="newEst">+ 새 견적</button><button class="btn" data-act="seed">예시 데이터 넣기</button></div></div></div>`;
  const used=new Set(e.processes.map(p=>p.k));
  const sp=curProj(), owner=[...S.projects.values()].find(x=>x.estimateId===e.id);
  return `<div class="stack">
  ${owner&&sp&&owner.id!==sp.id?`<div class="sitebar warn">
      <span>지금 고른 현장은 <b>${esc(siteName(sp))}</b>인데, 이 견적은 <b>${esc(siteName(owner))}</b> 현장 것입니다.</span><span class="spacer"></span>
      ${sp.estimateId&&S.estimates.has(sp.estimateId)
        ? `<button class="btn sm pri" data-act="openEst" data-id="${sp.estimateId}">“${esc(siteName(sp))}” 견적 열기</button>`
        : `<button class="btn sm pri" data-act="newEstForSite">“${esc(siteName(sp))}” 견적 만들기</button>`}
      <button class="btn sm" data-act="openSite" data-id="${owner.id}">${esc(siteName(owner))} 현장</button></div>`
   :owner?`<div class="sitebar"><span class="badge">${esc(siteName(owner))}</span> 현장의 견적입니다
      <span class="spacer"></span><button class="btn sm" data-act="openSite" data-id="${owner.id}">현장 화면</button></div>`
   :sp?`<div class="sitebar warn"><span>이 견적은 아직 어느 현장에도 연결되지 않았습니다.</span><span class="spacer"></span>
      <button class="btn sm" data-act="linkEstToSite">“${esc(siteName(sp))}” 현장에 연결</button></div>`:''}
  <div class="row"><div style="flex:1;min-width:220px"><div class="eyebrow">견적 번호 ${esc(e.no)}</div><input class="f" id="estTitle" data-bind="est:title" value="${esc(e.title)}" placeholder="견적 제목 (예: 상계동 34평 리모델링)" style="font-size:20px;font-weight:700;border-color:transparent;padding-left:0;background:transparent"></div>${estPicker()}</div>
  <div class="est-grid">
    <div class="stack">
      <section class="panel"><div class="panel-b client-grid">
        <label class="fl">고객명<input class="f" id="c-name" data-bind="est:client.name" value="${esc(e.client.name)}" placeholder="홍길동"></label>
        <label class="fl">연락처<input class="f" type="tel" id="c-phone" data-bind="est:client.phone" value="${esc(e.client.phone)}" placeholder="010-0000-0000"></label>
        <label class="fl span2">현장 주소<input class="f" id="c-addr" data-bind="est:client.address" value="${esc(e.client.address)}"></label>
        <label class="fl">면적<span class="sizef">
          <input class="f num" id="c-sizeval" data-size="val" inputmode="decimal" value="${esc(sizeOf(e.client).val||'')}" placeholder="84">
          <select class="f" id="c-sizeunit" data-size="unit"><option value="m2" ${sizeOf(e.client).unit!=='py'?'selected':''}>㎡</option><option value="py" ${sizeOf(e.client).unit==='py'?'selected':''}>평</option></select>
          <b id="o-size-conv" class="conv">${sizeConv(e.client)}</b></span></label>
        <label class="fl">견적일<input class="f" type="date" id="c-date" data-bind="est:date" value="${esc(e.date)}"></label>
        <label class="fl">유효기간(일)<input class="f num" type="number" inputmode="numeric" id="c-valid" data-bind="est:validDays" data-num value="${esc(e.validDays)}"></label>
      </div></section>
      ${e.processes.map((p,pi)=>renderProc(e,p,pi)).join('')}
      <div class="add-proc">
        <b>공정 추가</b>
        <div class="chips">${PROCS.filter(p=>!used.has(p.k)).map(p=>`<button class="chip" data-act="addProc" data-k="${p.k}">+ ${p.n}</button>`).join('')}</div>
      </div>
    </div>
    <aside class="panel summary">
      <div class="panel-h"><h3>합계</h3><span class="spacer"></span><button class="btn sm" data-act="view" data-v="doc">고객용 보기 →</button></div>
      <div class="panel-b">
        <div class="sum-rows">
          <div class="sum-row"><span class="muted">자재 원가</span><span class="v" id="o-mat"></span></div>
          <div class="sum-row"><span class="muted">인건비</span><span class="v" id="o-labor"></span></div>
          <div class="sum-row sep"><b>총 원가</b><b class="v" id="o-cost"></b></div>
          <div class="sum-row"><span class="muted">이윤·관리비 %</span><input class="f num" type="number" inputmode="decimal" id="s-margin" data-bind="est:margin" data-num value="${esc(e.margin)}"></div>
          <div class="sum-row"><span class="muted">할인 (원)</span><input class="f num" type="number" inputmode="numeric" id="s-disc" data-bind="est:discount" data-num value="${esc(e.discount)}" step="10000"></div>
          <div class="sum-row sep"><span>공급가액</span><span class="v" id="o-supply"></span></div>
          <div class="sum-row"><label style="display:flex;gap:6px;align-items:center;cursor:pointer"><input type="checkbox" id="s-vat" data-bind="est:vat" ${e.vat!==false?'checked':''}> 부가세 10%</label><span class="v" id="o-vat"></span></div>
          <div class="sum-row total sep"><span>고객 견적가</span><span class="v" id="o-total"></span></div>
          <div class="sum-row"><span class="muted">예상 이익</span><span class="v" id="o-profit"></span></div>
        </div>
        <div class="eyebrow" style="margin-top:14px">공정별 원가</div>
        <div class="mini-bars" id="o-bars"></div>
        <div class="row" style="margin-top:14px"><button class="btn sm" data-act="refreshPrices" title="자재 단가표의 최신 단가로 이 견적의 자재 단가를 바꿉니다">단가표 최신가 반영</button><button class="btn sm" data-act="goImport">단가표 사진 넣기</button></div>
      </div>
    </aside>
  </div></div>`;
}

function renderProc(e,p,pi){
  const P=PMAP[p.k]||PMAP.etc;
  const mats=[...S.materials.values()].filter(m=>m.process===p.k);
  const others=[...S.materials.values()].filter(m=>m.process!==p.k);
  return `<section class="proc" data-pi="${pi}">
    <div class="proc-h">
      <img class="sw" src="${procImg(p.k)}" alt="">
      <div><div class="proc-name">${P.n}</div>
        <div class="proc-area small muted">시공면적
          <span class="unitf"><input class="f num" inputmode="decimal" id="p${pi}-area" data-area="${pi}" value="${esc(p.areaText ?? (p.area||''))}" placeholder="84 또는 26평">
            <i id="o-p${pi}-unit">${areaHint(p.areaText ?? p.area)}</i></span>
        </div></div>
      <div class="proc-sum"><div class="small muted">원가 소계 · <span id="o-p${pi}-m2"></span></div><b id="o-p${pi}-cost"></b></div>
      <button class="btn ghost sm danger" data-act="delProc" data-pi="${pi}" aria-label="${P.n} 공정 삭제">✕</button>
    </div>
    <div class="tbl-wrap"><table class="t resp">
      <thead><tr><th class="w-img"></th><th class="w-name">자재 · 규격</th><th class="r">적용면적㎡</th><th class="r">로스%</th><th class="r">1단위 시공㎡</th><th class="r">필요수량</th><th>단위</th><th class="r">단가</th><th class="r">자재비</th><th class="r">㎡당</th><th></th></tr></thead>
      <tbody>${(p.lines||[]).map((l,li)=>renderLine(p,pi,l,li)).join('') || `<tr><td colspan="11" class="muted small c-empty" style="padding:12px 8px">아래에서 자재를 추가하세요.</td></tr>`}</tbody>
    </table></div>
    <div class="proc-f">
      <select class="f" id="p${pi}-addsel" style="width:auto;max-width:100%" data-act-change="addLine" data-pi="${pi}">
        <option value="">+ 자재 단가표에서 추가…</option>
        ${mats.length?`<optgroup label="${P.n}">${mats.map(m=>`<option value="${m.id}">${esc(m.name)} ${esc(m.spec||'')} · ${won(m.unitPrice)}원/${esc(m.unit)}</option>`).join('')}</optgroup>`:''}
        ${others.length?`<optgroup label="다른 공정">${others.map(m=>`<option value="${m.id}">${esc(m.name)} ${esc(m.spec||'')}</option>`).join('')}</optgroup>`:''}
      </select>
      <button class="btn sm" data-act="addBlank" data-pi="${pi}">직접 입력</button>
    </div>
    <div class="labor">
      <b>인건비</b>
      <label class="row" style="gap:6px">㎡당 <input class="f num" type="number" inputmode="numeric" step="500" id="p${pi}-lab" data-bind="proc:${pi}:laborPerM2" data-num value="${esc(p.laborPerM2)}"> 원</label>
      <label class="row" style="gap:6px">일식·추가 <input class="f num" type="number" inputmode="numeric" step="10000" id="p${pi}-lump" data-bind="proc:${pi}:laborLump" data-num value="${esc(p.laborLump)}"> 원</label>
      <span class="spacer"></span><span>= <b id="o-p${pi}-labor"></b></span>
    </div>
  </section>`;
}
function renderLine(p,pi,l,li){
  const id=`p${pi}l${li}`, qtyMode=l.mode==='qty';
  const m=l.mid&&S.materials.get(l.mid);
  return `<tr>
    <td class="c-img"><button class="thumb-btn" data-act="linePhoto" data-pi="${pi}" data-li="${li}" aria-label="사진 바꾸기"><img class="thumb" src="${lineImg(l,p.k)}" alt=""></button></td>
    <td class="c-name"><input class="f" id="${id}-name" data-bind="line:${pi}:${li}:name" value="${esc(l.name)}" placeholder="자재명" style="font-weight:500">
        <input class="f small" id="${id}-spec" data-bind="line:${pi}:${li}:spec" value="${esc(l.spec)}" placeholder="규격" style="margin-top:3px">
        ${m&&num(m.unitPrice)!==num(l.unitPrice)?`<div class="small" style="margin-top:3px"><span class="badge warn">단가표 ${won(m.unitPrice)}원</span></div>`:''}</td>
    ${qtyMode
      ? `<td class="r" data-l="계산 방식"><button class="btn ghost sm" data-act="toggleMode" data-pi="${pi}" data-li="${li}" title="면적 기준으로 계산">수량 직접 입력 ↺</button></td><td></td><td></td>
         <td class="r" data-l="수량"><input class="f num w-s" type="number" inputmode="decimal" step="0.1" id="${id}-qty" data-bind="line:${pi}:${li}:qty" data-num value="${esc(l.qty)}"></td>`
      : `<td class="r" data-l="적용면적㎡"><input class="f num w-n" type="number" inputmode="decimal" step="0.1" id="${id}-area" data-bind="line:${pi}:${li}:area" data-num-empty value="${esc(l.area)}" placeholder="공정값"></td>
         <td class="r" data-l="로스%"><input class="f num w-s" type="number" inputmode="decimal" id="${id}-loss" data-bind="line:${pi}:${li}:loss" data-num value="${esc(l.loss)}"></td>
         <td class="r" data-l="1단위 시공㎡"><input class="f num w-s" type="number" inputmode="decimal" step="0.01" id="${id}-cov" data-bind="line:${pi}:${li}:coverage" data-num value="${esc(l.coverage)}"></td>
         <td class="cell-out" data-l="필요수량"><span id="o-${id}-qty"></span></td>`}
    <td data-l="단위"><input class="f w-s" id="${id}-unit" data-bind="line:${pi}:${li}:unit" value="${esc(l.unit)}" style="width:54px"></td>
    <td class="r" data-l="단가"><input class="f num w-n" type="number" inputmode="numeric" step="100" id="${id}-price" data-bind="line:${pi}:${li}:unitPrice" data-num value="${esc(l.unitPrice)}"></td>
    <td class="cell-out" data-l="자재비"><span id="o-${id}-cost"></span></td>
    <td class="cell-out muted" data-l="㎡당"><span id="o-${id}-m2"></span></td>
    <td class="c-act"><div class="row" style="gap:0;flex-wrap:nowrap">${!qtyMode?`<button class="btn ghost sm" data-act="toggleMode" data-pi="${pi}" data-li="${li}" title="수량을 직접 입력">수량 직접</button>`:''}<button class="btn ghost sm danger" data-act="delLine" data-pi="${pi}" data-li="${li}" aria-label="삭제">✕</button></div></td>
  </tr>`;
}
function setText(id,t){ const el=document.getElementById(id); if(el) el.textContent=t; }
function recalc(){
  const e=cur(); if(!e||VIEW!=='est') return;
  const c=calcEst(e);
  setText('o-mat',won(c.mat)+'원'); setText('o-labor',won(c.labor)+'원'); setText('o-cost',won(c.cost)+'원');
  setText('o-supply',won(c.supply)+'원'); setText('o-vat',won(c.vat)+'원'); setText('o-total',won(c.total)+'원');
  setText('o-profit',won(c.profit)+'원 ('+(c.supply>0?(c.profit/c.supply*100).toFixed(1):'0')+'%)');
  e.processes.forEach((p,pi)=>{ const pc=c.procs[pi];
    setText(`o-p${pi}-cost`,won(pc.cost)+'원');
    setText(`o-p${pi}-m2`, pc.area>0?`㎡당 ${won(pc.perM2)}원`:'면적 미입력'); setText(`o-p${pi}-labor`,won(pc.labor)+'원');
    (p.lines||[]).forEach((l,li)=>{ const x=pc.lines[li], id=`p${pi}l${li}`;
      setText(`o-${id}-qty`, r1(x.qty)); setText(`o-${id}-cost`, won(x.cost)); setText(`o-${id}-m2`, x.perM2?won(x.perM2):'—'); });
  });
  const max=Math.max(1,...c.procs.map(x=>x.cost));
  const bars=document.getElementById('o-bars');
  if(bars) bars.innerHTML = e.processes.length ? e.processes.map((p,pi)=>`<div class="mb"><span>${(PMAP[p.k]||PMAP.etc).n}</span><div class="mb-track"><div class="mb-fill" style="width:${c.procs[pi].cost/max*100}%"></div></div><span style="text-align:right">${won(c.procs[pi].cost/10000)}만</span></div>`).join('') : '<span class="muted small">공정을 추가하세요.</span>';
}

/* ---------- materials view ---------- */
function renderMat(){
  const all=[...S.materials.values()];
  const counts={}; all.forEach(m=>counts[m.process]=(counts[m.process]||0)+1);
  const list=all.filter(m=>MAT_FILTER==='all'||m.process===MAT_FILTER).sort((a,b)=>PROCS.findIndex(p=>p.k===a.process)-PROCS.findIndex(p=>p.k===b.process)||String(a.name).localeCompare(b.name,'ko'));
  return `<div class="stack">
    <div><h2>자재 단가표</h2><p class="muted" style="margin:4px 0 0">거래명세서·단가표·카톡 캡처를 올리면 자재를 뽑아 1단위 시공면적과 ㎡당 원가까지 정리합니다.</p></div>
    ${renderImport()}
    <section class="panel">
      <div class="panel-h"><h3>저장된 자재 ${all.length}</h3><span class="spacer"></span><button class="btn sm" data-act="addMat">+ 자재 직접 추가</button></div>
      <div class="panel-b" style="padding-bottom:0"><div class="chips">
        <button class="chip" data-act="matFilter" data-k="all" aria-pressed="${MAT_FILTER==='all'}">전체 ${all.length}</button>
        ${PROCS.filter(p=>counts[p.k]).map(p=>`<button class="chip" data-act="matFilter" data-k="${p.k}" aria-pressed="${MAT_FILTER===p.k}">${p.n} ${counts[p.k]}</button>`).join('')}
      </div></div>
      <div class="tbl-wrap" style="margin-top:10px"><table class="t resp">
        <thead><tr><th class="w-img">사진</th><th class="w-name">자재 · 규격</th><th>공정</th><th>단위</th><th class="r">단가(원)</th><th class="r">1단위 시공㎡</th><th class="r">로스%</th><th class="r">㎡당 원가</th><th>메모</th><th></th></tr></thead>
        <tbody>${list.map(m=>`<tr>
          <td class="c-img"><button class="thumb-btn" data-act="matPhoto" data-id="${m.id}" aria-label="사진 바꾸기"><img class="thumb" src="${matImg(m)}" alt=""></button></td>
          <td class="c-name"><input class="f" id="m-${m.id}-name" data-bind="mat:${m.id}:name" value="${esc(m.name)}" placeholder="자재명" style="font-weight:500"><input class="f small" id="m-${m.id}-spec" data-bind="mat:${m.id}:spec" value="${esc(m.spec)}" placeholder="규격" style="margin-top:3px"></td>
          <td data-l="공정"><select class="f" id="m-${m.id}-proc" data-bind="mat:${m.id}:process" style="width:110px">${PROCS.map(p=>`<option value="${p.k}" ${p.k===m.process?'selected':''}>${p.n}</option>`).join('')}</select></td>
          <td data-l="단위"><input class="f" id="m-${m.id}-unit" data-bind="mat:${m.id}:unit" value="${esc(m.unit)}" style="width:56px"></td>
          <td class="r" data-l="단가(원)"><input class="f num w-n" type="number" inputmode="numeric" step="100" id="m-${m.id}-price" data-bind="mat:${m.id}:unitPrice" data-num value="${esc(m.unitPrice)}"></td>
          <td class="r" data-l="1단위 시공㎡"><input class="f num w-s" type="number" inputmode="decimal" step="0.01" id="m-${m.id}-cov" data-bind="mat:${m.id}:coverage" data-num value="${esc(m.coverage)}" title="0이면 수량 기준 자재">${m.coverageBasis==='추정'?'<div><span class="badge warn">추정</span></div>':''}</td>
          <td class="r" data-l="로스%"><input class="f num w-s" type="number" inputmode="decimal" id="m-${m.id}-loss" data-bind="mat:${m.id}:loss" data-num value="${esc(m.loss)}"></td>
          <td class="cell-out" data-l="㎡당 원가"><span id="o-m-${m.id}">${perM2Html(matPerM2(m))}</span></td>
          <td class="small muted" data-l="메모" style="max-width:220px">${esc(m.note||'')}</td>
          <td class="c-act"><button class="btn ghost sm danger" data-act="delMat" data-id="${m.id}" aria-label="삭제">✕ 삭제</button></td></tr>`).join('') || `<tr><td colspan="10" class="empty c-empty">자재가 없습니다. 단가표 사진을 올리거나 직접 추가하세요.</td></tr>`}</tbody>
      </table></div>
    </section>
  </div>`;
}
function renderImport(){
  const I=IMPORT, hasKey=!!ls.get('anthropic_key');
  let body='';
  if(I.busy) body=`<div class="status"><span class="spin"></span> 단가표를 읽고 있습니다. 사진 장수에 따라 20초~1분 걸립니다.</div>`;
  else if(I.err) body=`<div class="status err">${esc(I.err)}</div>`;
  if(I.items && !I.busy){
    const e=cur();
    body+=`<div class="panel" style="margin-top:12px">
      <div class="panel-h"><h3>읽어낸 자재 ${I.items.length}개</h3><span class="muted small">저장 전에 확인·수정하세요. <span class="badge warn">추정</span>은 사진에 규격이 없어 일반 시공 기준으로 잡은 값입니다.</span></div>
      ${I.memo?`<div class="panel-b memo">${esc(I.memo)}</div>`:''}
      <div class="panel-b" style="padding-block:6px"><label class="row small" style="gap:6px"><input type="checkbox" id="rv-all" data-act-change="revAll" ${I.items.every(x=>x.on)?'checked':''}> 전체 선택</label></div>
      <div class="tbl-wrap"><table class="t resp"><thead><tr><th></th><th class="w-name">자재 · 규격</th><th>공정</th><th>단위</th><th class="r">단가(원)</th><th class="r">1단위 시공㎡</th><th class="r">로스%</th><th class="r">㎡당 원가</th><th>근거</th></tr></thead>
      <tbody>${I.items.map((it,i)=>`<tr>
        <td class="c-img"><input type="checkbox" id="rv-${i}-on" data-bind="rev:${i}:on" ${it.on?'checked':''} aria-label="선택" style="width:20px;height:20px"></td>
        <td class="c-name"><input class="f" id="rv-${i}-name" data-bind="rev:${i}:name" value="${esc(it.name)}" style="font-weight:500"><input class="f small" id="rv-${i}-spec" data-bind="rev:${i}:spec" value="${esc(it.spec)}" style="margin-top:3px"></td>
        <td data-l="공정"><select class="f" id="rv-${i}-proc" data-bind="rev:${i}:process" style="width:110px">${PROCS.map(p=>`<option value="${p.k}" ${p.k===it.process?'selected':''}>${p.n}</option>`).join('')}</select></td>
        <td data-l="단위"><input class="f" id="rv-${i}-unit" data-bind="rev:${i}:unit" value="${esc(it.unit)}" style="width:56px"></td>
        <td class="r" data-l="단가(원)"><input class="f num w-n" type="number" inputmode="numeric" id="rv-${i}-price" data-bind="rev:${i}:unitPrice" data-num value="${esc(it.unitPrice)}">${it.vatConverted?'<div><span class="badge">VAT 제외 환산</span></div>':''}</td>
        <td class="r" data-l="1단위 시공㎡"><input class="f num w-s" type="number" inputmode="decimal" step="0.01" id="rv-${i}-cov" data-bind="rev:${i}:coverage" data-num value="${esc(it.coverage)}">${it.coverageBasis==='추정'?'<div><span class="badge warn">추정</span></div>':it.coverage>0?'<div><span class="badge">규격 계산</span></div>':''}</td>
        <td class="r" data-l="로스%"><input class="f num w-s" type="number" inputmode="decimal" id="rv-${i}-loss" data-bind="rev:${i}:loss" data-num value="${esc(it.loss)}"></td>
        <td class="cell-out" data-l="㎡당 원가"><span id="o-rv-${i}">${perM2Html(matPerM2(it))}</span></td>
        <td class="small muted" data-l="근거" style="max-width:240px">${esc(it.note||'')}</td></tr>`).join('')}</tbody></table></div>
      <div class="panel-b row">
        <button class="btn pri" data-act="revSave">선택 항목 자재함에 저장</button>
        ${e?`<button class="btn" data-act="revSaveAdd">저장하고 “${esc(e.title)}” 견적에 추가</button>`:''}
        <span class="spacer"></span><button class="btn ghost" data-act="revCancel">취소</button>
      </div></div>`;
  }
  return `<section>
    <div class="dropzone" id="dz">
      <div class="dz-icon" aria-hidden="true"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" style="color:var(--accent)"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg></div>
      <div style="flex:1;min-width:200px"><b>단가표 사진 가져오기</b>
        <div class="muted small">${hasKey?'사진을 찍거나 고르세요. 노트북에서는 끌어다 놓거나 붙여넣기(Ctrl+V)도 됩니다.':'AI 사진 읽기를 쓰려면 <a href="#" data-act="view" data-v="set">설정</a>에서 API 키를 넣어주세요. 키 없이도 아래에서 직접 추가할 수 있습니다.'}</div>
        ${IMPORT.urls.length?`<div class="previews" style="margin-top:8px">${IMPORT.urls.map(u=>`<img src="${u}" alt="올린 단가표">`).join('')}</div>`:''}</div>
      ${hasKey?`<div class="row">
        <button class="btn" data-act="pickSheet" ${I.busy?'disabled':''}>사진 선택</button>
        ${IMPORT.files.length?`<button class="btn pri" data-act="parse" ${I.busy?'disabled':''}>${I.busy?'<span class="spin"></span> 읽는 중':'AI로 정리하기'}</button>`:''}
      </div>`:''}
    </div>
    ${body?`<div style="margin-top:10px">${body}</div>`:''}
  </section>`;
}

/* ---------- AI import (Claude API, user's own key) ---------- */
function setSheetFiles(files){
  const imgs=[...files].filter(f=>f.type.startsWith('image/'));
  if(!imgs.length) return;
  IMPORT.urls.forEach(u=>URL.revokeObjectURL(u));
  IMPORT.files=imgs.slice(0,6); IMPORT.urls=IMPORT.files.map(f=>URL.createObjectURL(f)); IMPORT.err=''; IMPORT.items=null;
  VIEW='mat'; render();
}
async function loadImage(file){
  const url=URL.createObjectURL(file);
  try{ return await new Promise((res,rej)=>{ const i=new Image(); i.onload=()=>res(i); i.onerror=()=>rej(new Error('사진을 열 수 없습니다')); i.src=url; }); }
  finally{ setTimeout(()=>URL.revokeObjectURL(url),1000); }
}
async function toBase64Jpeg(file,max=1600){
  const img=await loadImage(file);
  const s=Math.min(1,max/Math.max(img.width,img.height));
  const c=document.createElement('canvas'); c.width=Math.round(img.width*s); c.height=Math.round(img.height*s);
  c.getContext('2d').drawImage(img,0,0,c.width,c.height);
  return c.toDataURL('image/jpeg',.88).split(',')[1];
}
const PARSE_PROMPT = `너는 한국 인테리어 현장의 자재 원가 정리 담당이다. 위 이미지는 자재 원가 자료(거래명세서, 단가표, 견적서, 메신저 캡처 등)다.
이미지에 적힌 자재를 한 줄씩 항목으로 뽑아라. 이미지에 없는 자재를 지어내지 마라. 인건비·운반비 같은 비자재 항목도 적혀 있으면 포함하되 mode를 "qty"로 둔다.

각 항목:
- name: 자재명 (브랜드명 포함 가능)
- spec: 규격·색상·두께 등 (없으면 "")
- process: demo(철거), plumb(설비·방수), elec(전기·조명), carp(목공), window(창호·샷시), film(필름), paint(도장), paper(도배), tile(타일), floor(바닥재), bath(욕실 도기·수전·액세서리), kitchen(주방·가구), etc(기타) 중 하나
- unit: 판매 단위 (롤, 박스, 장, 말, 통, 포, 개, m, kg, 식 등)
- unitPrice: 판매 단위 1개의 가격(원). 수량×단가로 합계만 있으면 1개 가격으로 나눠라.
- vatIncluded: 이미지에 부가세 포함가로 명시돼 있으면 true
- coverage: 판매 단위 1개로 시공 가능한 면적(㎡). 규격(예: 600×600 4장/박스, 폭1.06m×15.6m/롤, 1220×2440 합판)으로 계산되면 계산하고 coverageBasis "계산". 규격이 없으면 한국 시공 관행의 일반값으로 추정하고 coverageBasis "추정" (예: 실크벽지 1롤≈16.5㎡, 수성페인트 18L≈60㎡(1회 도장), 타일접착제 25kg≈5㎡, 석고보드 900×1800≈1.62㎡). 면적 개념이 없는 자재(조명, 수전, 도기, 문, 폐기물, 운반비 등)는 coverage 0, coverageBasis "없음", mode "qty".
- mode: "area"(면적으로 수량 산출) 또는 "qty"(개수로 산출)
- loss: 권장 로스율 % (타일 8~10, 마루 5~7, 벽지 10~15, 필름 10, 페인트 5, 보드 5, 수량형 0)
- tone: 자재 대표색 hex (알 수 있으면, 예 "#d9c7a8"), 모르면 ""
- note: 판단 근거 한 줄 (예: "600×600×4장=1.44㎡")

memo에는 이미지 전체에 대한 참고사항(VAT 여부, 읽기 어려운 부분 등)을 적고 없으면 빈 문자열로 둔다.`;
const PARSE_SCHEMA = {
  type:'object', additionalProperties:false, required:['items','memo'],
  properties:{
    memo:{type:'string'},
    items:{type:'array', items:{type:'object', additionalProperties:false,
      required:['name','spec','process','unit','unitPrice','vatIncluded','coverage','coverageBasis','mode','loss','tone','note'],
      properties:{
        name:{type:'string'}, spec:{type:'string'},
        process:{type:'string', enum:PROCS.map(p=>p.k)},
        unit:{type:'string'}, unitPrice:{type:'number'}, vatIncluded:{type:'boolean'},
        coverage:{type:'number'}, coverageBasis:{type:'string', enum:['계산','추정','없음']},
        mode:{type:'string', enum:['area','qty']}, loss:{type:'number'}, tone:{type:'string'}, note:{type:'string'} }}}
  }
};
let AnthropicSDK=null;
async function parseSheets(){
  if(IMPORT.busy||!IMPORT.files.length) return;
  const apiKey=ls.get('anthropic_key');
  if(!apiKey){ IMPORT.err='설정에서 API 키를 먼저 넣어주세요.'; render(); return; }
  if(!navigator.onLine){ IMPORT.err='인터넷에 연결되어 있을 때만 사진을 읽을 수 있습니다.'; render(); return; }
  IMPORT.busy=true; IMPORT.err=''; render();
  try{
    if(!AnthropicSDK) AnthropicSDK=(await import(ANTHROPIC_SDK_URL)).default;
    const client=new AnthropicSDK({apiKey, dangerouslyAllowBrowser:true});
    const images=[];
    for(const f of IMPORT.files) images.push({type:'image',source:{type:'base64',media_type:'image/jpeg',data:await toBase64Jpeg(f)}});
    const res=await client.beta.messages.create({
      model:'claude-opus-5',
      max_tokens:16000,
      betas:['server-side-fallback-2026-07-01'],
      fallbacks:'default',
      output_config:{format:{type:'json_schema',schema:PARSE_SCHEMA}},
      messages:[{role:'user',content:[...images,{type:'text',text:PARSE_PROMPT}]}],
    });
    if(res.stop_reason==='refusal') throw {code:'refusal'};
    if(res.stop_reason==='max_tokens') throw {code:'too_long'};
    const text=res.content.filter(b=>b.type==='text').map(b=>b.text).join('');
    let out; try{ out=JSON.parse(text); }catch{ throw {code:'invalid_json'}; }
    const items=(out.items||[]).map(it=>{
      let price=num(it.unitPrice), conv=false;
      if(it.vatIncluded){ price=Math.round(price/1.1); conv=true; }
      const cov=num(it.coverage);
      return {on:true,name:String(it.name||''),spec:String(it.spec||''),process:PMAP[it.process]?it.process:'etc',unit:String(it.unit||''),unitPrice:price,vatConverted:conv,
        coverage:cov,coverageBasis:it.coverageBasis,mode:(it.mode==='qty'||cov<=0)?'qty':'area',loss:num(it.loss),tone:/^#[0-9a-f]{6}$/i.test(it.tone||'')?it.tone:'',note:String(it.note||'')};
    });
    if(!items.length) throw {code:'empty'};
    IMPORT.items=items; IMPORT.memo=String(out.memo||'');
  }catch(e){
    const S_=AnthropicSDK;
    let msg;
    if(S_ && e instanceof S_.AuthenticationError) msg='API 키가 맞지 않습니다. 설정에서 키를 다시 확인해주세요.';
    else if(S_ && e instanceof S_.PermissionDeniedError) msg='이 API 키로는 사용할 수 없습니다. Anthropic 콘솔에서 키 권한과 결제 상태를 확인해주세요.';
    else if(S_ && e instanceof S_.RateLimitError) msg='요청이 많아 잠시 막혔습니다. 1분 뒤 다시 시도하세요.';
    else if(S_ && e instanceof S_.BadRequestError) msg='요청을 처리하지 못했습니다: '+(e.message||'')+' (크레딧 잔액이 부족할 때도 이 메시지가 나옵니다)';
    else if(S_ && e instanceof S_.APIConnectionError) msg='AI 서버에 연결하지 못했습니다. 인터넷 연결을 확인하고 다시 시도하세요.';
    else if(S_ && e instanceof S_.APIError) msg='AI 서버 오류로 읽지 못했습니다. 잠시 후 다시 시도하세요.';
    else msg={refusal:'이 사진은 처리하지 못했습니다. 다른 사진으로 시도해주세요.',too_long:'항목이 너무 많아 다 읽지 못했습니다. 사진을 나눠서 올려주세요.',invalid_json:'결과를 표로 정리하지 못했습니다. 다시 한 번 눌러주세요.',empty:'사진에서 자재 항목을 찾지 못했습니다. 글자가 선명한 사진으로 다시 올려주세요.'}[e?.code]
      || ('읽지 못했습니다: '+(e?.message||e));
    IMPORT.err=msg;
  }finally{ IMPORT.busy=false; render(); }
}
function saveReviewed(addToEst){
  const sel=(IMPORT.items||[]).filter(x=>x.on&&x.name.trim());
  if(!sel.length){ toast('선택된 항목이 없습니다.'); return; }
  const e=addToEst?cur():null;
  sel.forEach(it=>{ const {on,vatConverted,...rest}=it; const m={id:uid(),...rest,note:(rest.note||'')+(vatConverted?' · VAT 포함가를 공급가로 환산':''),updated:Date.now()};
    S.materials.set(m.id,m); saveMat(m);
    if(e){ const p=ensureProc(e,m.process); p.lines.push(lineFromMat(m)); } });
  if(e) saveEst(e);
  IMPORT={files:[],urls:[],busy:false,items:null,memo:'',err:''};
  toast(`${sel.length}개 자재를 저장했습니다`+(e?' · 견적에 추가됨':''));
  if(e) VIEW='est';
  render();
}

/* ---------- customer document ---------- */
const DOC_CSS = `
#doc{--d-ink:#1a1a1a;--d-mut:#5f6360;--d-line:#cfd3d0;--d-soft:#f1f4f2;
  background:#fff;color:var(--d-ink);width:794px;max-width:none;margin:0 auto;padding:56px 56px 64px;font-family:"IBM Plex Sans KR","Apple SD Gothic Neo","Malgun Gothic",sans-serif;font-size:12.5px;line-height:1.55;box-shadow:0 2px 20px rgba(0,0,0,.12);font-variant-numeric:tabular-nums}
#doc h1{font-family:"Nanum Myeongjo","AppleMyungjo","Batang",serif;font-size:34px;font-weight:800;letter-spacing:.6em;text-align:center;margin:0 0 4px;padding-left:.6em;color:var(--d-ink)}
#doc .d-no{text-align:center;color:var(--d-mut);font-size:11.5px;margin-bottom:26px}
#doc .d-parties{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:18px}
#doc .d-to .d-name{font-size:18px;font-weight:700;border-bottom:1.5px solid var(--d-ink);padding-bottom:4px;margin-bottom:8px}
#doc .d-kv{display:grid;grid-template-columns:64px 1fr;gap:3px 8px;font-size:12px;margin:0}
#doc .d-kv dt{color:var(--d-mut)}#doc .d-kv dd{margin:0}
#doc .d-from{border:1px solid var(--d-line);padding:10px 12px}
#doc .d-from .d-co{font-weight:700;font-size:14px;margin-bottom:6px}
#doc .d-total{display:flex;justify-content:space-between;align-items:baseline;gap:16px;border-top:2px solid var(--d-ink);border-bottom:1px solid var(--d-ink);padding:12px 4px;margin:6px 0 4px;flex-wrap:wrap}
#doc .d-total .lbl{font-weight:700}
#doc .d-total .words{font-family:"Nanum Myeongjo","AppleMyungjo",serif;font-weight:800;font-size:17px}
#doc .d-total .fig{font-size:20px;font-weight:700}
#doc .d-vatnote{text-align:right;font-size:11px;color:var(--d-mut);margin-bottom:22px}
#doc h2.d-sec{font-size:13px;font-weight:700;margin:22px 0 8px;padding-bottom:5px;border-bottom:1px solid var(--d-ink);letter-spacing:.02em;color:var(--d-ink)}
#doc table{width:100%;border-collapse:collapse;font-size:12px}
#doc th{background:var(--d-soft);font-weight:600;padding:7px 8px;border-top:1px solid var(--d-line);border-bottom:1px solid var(--d-line);text-align:left;color:var(--d-ink)}
#doc td{padding:7px 8px;border-bottom:1px solid var(--d-line);vertical-align:top}
#doc .r{text-align:right}#doc .c{text-align:center}
#doc tfoot td{border-bottom:0;padding:5px 8px}
#doc tfoot tr.g td{border-top:1.5px solid var(--d-ink);font-weight:700;font-size:13px;padding-top:8px}
#doc .d-proc{margin-top:14px;break-inside:avoid;page-break-inside:avoid}
#doc .d-proc-h{display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin-bottom:8px}
#doc .d-proc-h b{font-size:13.5px}
#doc .d-mats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
#doc .d-mat{border:1px solid var(--d-line);display:flex;flex-direction:column}
#doc .d-mat img{width:100%;aspect-ratio:4/3;object-fit:cover;display:block;border-bottom:1px solid var(--d-line)}
#doc .d-mat .t{padding:6px 7px 7px;font-size:11.5px;line-height:1.4}
#doc .d-mat .t b{display:block;font-size:12px}
#doc .d-mat .t span{color:var(--d-mut)}
#doc .d-list{font-size:11.5px;color:var(--d-mut);margin-top:6px}
#doc .d-notes{white-space:pre-wrap;font-size:12px;border:1px solid var(--d-line);padding:10px 12px;background:#fcfcfb}
#doc .d-sign{display:flex;justify-content:space-between;gap:20px;margin-top:30px;font-size:12px;flex-wrap:wrap}
#doc .d-sign .s{flex:1;min-width:200px;border-top:1px solid var(--d-ink);padding-top:6px}
#doc .d-foot{margin-top:28px;text-align:center;color:var(--d-mut);font-size:11px}`;
(()=>{ const st=document.createElement('style'); st.textContent=DOC_CSS; document.head.appendChild(st); })();

function krDate(s){ const d=new Date(s||today()); return isNaN(d)?'':`${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일`; }
function docHTML(e){
  const c=calcEst(e), co=S.company||{};
  const expD=new Date(e.date||today()); expD.setDate(expD.getDate()+num(e.validDays));
  const exp=isNaN(expD)?'':krDate(expD.toISOString().slice(0,10)), dt=krDate(e.date);
  const k=1+num(e.margin)/100;
  const procs=e.processes.map((p,pi)=>({p,pc:c.procs[pi],P:PMAP[p.k]||PMAP.etc}));
  return `<article id="doc">
    <h1>견적서</h1>
    <div class="d-no">No. ${esc(e.no)} · ${dt}</div>
    <div class="d-parties">
      <div class="d-to">
        <div class="d-name">${esc(e.client.name||'고객')} 귀하</div>
        <dl class="d-kv">
          ${e.client.address?`<dt>현장</dt><dd>${esc(e.client.address)}</dd>`:''}
          ${sizeText(e.client)||e.client.size?`<dt>면적</dt><dd>${esc(sizeText(e.client)||e.client.size)}</dd>`:''}
          ${e.client.phone?`<dt>연락처</dt><dd>${esc(e.client.phone)}</dd>`:''}
          <dt>공사명</dt><dd>${esc(e.title)}</dd>
          <dt>유효기간</dt><dd>${exp}까지</dd>
        </dl>
        <p style="margin:12px 0 0;font-size:12px">아래와 같이 견적합니다.</p>
      </div>
      <div class="d-from">
        <div class="d-co">${esc(co.name||'상호명을 입력하세요')}</div>
        <dl class="d-kv">
          ${co.ceo?`<dt>대표</dt><dd>${esc(co.ceo)} (인)</dd>`:''}
          ${co.bizNo?`<dt>사업자번호</dt><dd>${esc(co.bizNo)}</dd>`:''}
          ${co.address?`<dt>주소</dt><dd>${esc(co.address)}</dd>`:''}
          ${co.phone?`<dt>연락처</dt><dd>${esc(co.phone)}</dd>`:''}
          ${co.email?`<dt>이메일</dt><dd>${esc(co.email)}</dd>`:''}
        </dl>
      </div>
    </div>
    <div class="d-total"><span class="lbl">합계금액</span><span class="words">금 ${krWords(c.total)}원정</span><span class="fig">₩ ${won(c.total)}</span></div>
    <div class="d-vatnote">${e.vat!==false?'부가세 포함':'부가세 별도'}</div>

    <h2 class="d-sec">공정별 금액</h2>
    <table><thead><tr><th style="width:36px" class="c">No</th><th>공정</th><th>주요 자재</th><th class="r" style="width:90px">시공면적</th><th class="r" style="width:110px">금액(원)</th></tr></thead>
      <tbody>${procs.map(({p,pc,P},i)=>`<tr><td class="c">${i+1}</td><td><b>${P.n}</b></td><td>${esc((p.lines||[]).map(l=>l.name).filter(Boolean).join(', ')||'—')}</td><td class="r">${pc.area>0?r1(pc.area)+'㎡<br><span style="color:var(--d-mut);font-size:11px">'+Math.round(pc.area/PY)+'평</span>':'일식'}</td><td class="r">${won(pc.price)}</td></tr>`).join('')}</tbody>
      <tfoot>
        <tr><td colspan="4" class="r">소계</td><td class="r">${won(c.gross)}</td></tr>
        ${num(e.discount)>0?`<tr><td colspan="4" class="r">할인</td><td class="r">−${won(e.discount)}</td></tr>`:''}
        <tr><td colspan="4" class="r">공급가액</td><td class="r">${won(c.supply)}</td></tr>
        ${e.vat!==false?`<tr><td colspan="4" class="r">부가세 (10%)</td><td class="r">${won(c.vat)}</td></tr>`:''}
        <tr class="g"><td colspan="4" class="r">합계</td><td class="r">${won(c.total)}</td></tr>
      </tfoot></table>

    <h2 class="d-sec">공정별 자재 및 시공 내역</h2>
    ${procs.map(({p,pc,P})=>`<div class="d-proc">
      <div class="d-proc-h"><b>${P.n}</b><span>${pc.area>0?r1(pc.area)+'㎡ ('+Math.round(pc.area/PY)+'평) · ':''}${won(pc.price)}원</span></div>
      ${e.showImages!==false && p.lines?.length ? `<div class="d-mats">${p.lines.map((l,li)=>{ const x=pc.lines[li]; return `<div class="d-mat"><img src="${lineImg(l,p.k)}" alt=""><div class="t"><b>${esc(l.name)}</b><span>${esc(l.spec)}</span>${x.qty>0?`<br><span>${r1(x.qty)} ${esc(l.unit)}</span>`:''}${e.showLinePrice?`<br><span>${won(x.cost*k)}원</span>`:''}</div></div>`; }).join('')}</div>`
      : p.lines?.length ? `<table><thead><tr><th>자재</th><th>규격</th><th class="r">수량</th>${e.showLinePrice?'<th class="r">금액</th>':''}</tr></thead><tbody>${p.lines.map((l,li)=>{const x=pc.lines[li]; return `<tr><td>${esc(l.name)}</td><td>${esc(l.spec)}</td><td class="r">${r1(x.qty)} ${esc(l.unit)}</td>${e.showLinePrice?`<td class="r">${won(x.cost*k)}</td>`:''}</tr>`;}).join('')}</tbody></table>`:''}
      ${pc.labor>0?`<div class="d-list">시공비 포함${e.showLinePrice?` · ${won(pc.labor*k)}원`:''}</div>`:''}
    </div>`).join('')}

    ${e.notes?`<h2 class="d-sec">비고 및 계약 조건</h2><div class="d-notes">${esc(e.notes)}</div>`:''}
    ${co.bank?`<p style="margin-top:12px;font-size:12px"><b>입금 계좌</b> ${esc(co.bank)}</p>`:''}
    <div class="d-sign"><div class="s">공급자 ${esc(co.name||'')} ${esc(co.ceo||'')} (인)</div><div class="s">고객 ${esc(e.client.name||'')} (서명)</div></div>
    <div class="d-foot">본 견적서는 ${dt} 기준이며 자재 단가 변동 및 현장 실측에 따라 조정될 수 있습니다.</div>
  </article>`;
}
function renderDocView(){
  const e=cur();
  if(!e) return `<div class="panel"><div class="empty">먼저 견적을 만들어주세요. <button class="btn" data-act="view" data-v="est">견적 작성으로</button></div></div>`;
  const co=S.company||{};
  const f=(k,l,ph='')=>`<label class="fl">${l}<input class="f" ${k==='phone'?'type="tel"':''} id="co-${k}" data-bind="co:${k}" value="${esc(co[k]||'')}" placeholder="${ph}"></label>`;
  return `<div class="stack">
    <div class="row no-print"><h2 style="flex:1">고객용 견적서</h2>${estPicker()}</div>
    <details class="co panel no-print" ${co.name?'':'open'}><summary>우리 업체 정보 ${co.name?'· '+esc(co.name):'(견적서 발신란에 들어갑니다)'}</summary>
      <div class="panel-b co-grid">${f('name','상호','○○인테리어')}${f('ceo','대표자')}${f('bizNo','사업자등록번호','000-00-00000')}${f('phone','연락처')}${f('email','이메일')}${f('address','주소')}${f('bank','입금 계좌','○○은행 000-000000-00 예금주')}</div></details>
    <section class="panel no-print"><div class="panel-b">
      <div class="doc-tools">
        <label><input type="checkbox" id="d-img" data-bind="est:showImages" ${e.showImages!==false?'checked':''}> 자재 사진 표시</label>
        <label><input type="checkbox" id="d-lp" data-bind="est:showLinePrice" ${e.showLinePrice?'checked':''}> 자재·시공비 금액 세부 표시</label>
        <span class="spacer"></span>
        <button class="btn" data-act="print">인쇄 / PDF</button>
        <button class="btn pri" data-act="download">${isTouch()?'보내기':'파일로 저장'}</button>
      </div>
      <label class="fl">비고 및 계약 조건<textarea class="f" id="d-notes" rows="3" data-bind="est:notes">${esc(e.notes)}</textarea></label>
      <p class="small muted" style="margin:8px 0 0">고객용에는 원가·마진이 나오지 않습니다. 공정 금액은 원가에 이윤 ${esc(e.margin)}%를 더해 천 원 단위로 반올림한 값입니다.</p>
    </div></section>
    <div class="doc-stage" id="docStage">${docHTML(e)}</div>
  </div>`;
}
function refreshDoc(){ const st=document.getElementById('docStage'); const e=cur(); if(st&&e) st.innerHTML=docHTML(e); }
async function downloadDoc(){
  const e=cur(); if(!e) return;
  const html=`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>견적서 ${esc(e.client.name||'')} ${esc(e.no)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;600;700&family=Nanum+Myeongjo:wght@800&display=swap">
<style>body{margin:0;background:#e9ebe9;padding:24px 0;overflow-x:auto}@media print{body{background:#fff;padding:0}#doc{box-shadow:none!important;padding:0!important}}@page{size:A4;margin:12mm}${DOC_CSS}</style></head><body>${docHTML(e)}</body></html>`;
  const fname=`견적서_${(e.client.name||'고객').replace(/[\\/:*?"<>|]/g,'')}_${e.no}.html`;
  await shareOrDownload(fname,new Blob([html],{type:'text/html'}));
}

/* ---------- 첫 화면: 현장 목록 · 현장 홈 ---------- */
function renderNewSite(){
  const ests=[...S.estimates.values()].sort((a,b)=>(b.updated||0)-(a.updated||0));
  return `<div class="stack" style="max-width:520px;margin:0 auto">
    <div class="row"><button class="btn ghost" data-act="homeBack">‹ 현장 목록</button></div>
    <section class="panel"><div class="panel-h"><h2>새 현장</h2></div>
      <form class="panel-b" id="newSiteForm" style="display:flex;flex-direction:column;gap:12px">
        <label class="fl">현장 이름 <span class="muted">(비워두면 현장 주소가 제목이 됩니다)</span>
          <input class="f" id="ns-name" placeholder="예: 상계동 주공 302동 1501호"></label>
        <div class="client-grid">
          <label class="fl">고객명<input class="f" id="ns-client" placeholder="홍길동"></label>
          <label class="fl">연락처<input class="f" type="tel" id="ns-phone" placeholder="010-0000-0000"></label>
        </div>
        <label class="fl">현장 주소<input class="f" id="ns-addr"></label>
        ${ests.length?`<label class="fl">견적 연결 <span class="muted">(선택)</span>
          <select class="f" id="ns-est"><option value="">연결 안 함</option>
          ${ests.map(e=>`<option value="${e.id}">${esc(e.title)} · ${esc(e.client?.name||'')}</option>`).join('')}</select></label>
          <span class="small muted" style="margin-top:-6px">견적을 연결하면 그 견적의 공정이 일정으로 들어옵니다.</span>`:''}
        <div class="row"><button class="btn pri" type="submit">현장 만들기</button>
          <button class="btn ghost" type="button" data-act="homeBack">취소</button></div>
      </form></section>
  </div>`;
}
function renderHome(){
  const projs=[...S.projects.values()].sort((a,b)=>(b.updated||0)-(a.updated||0));
  if(HOME_NEW) return renderNewSite();
  if(HOME_SEL && S.projects.has(HOME_SEL)) return renderHub(S.projects.get(HOME_SEL));
  const loose=[...S.estimates.values()].filter(e=>!projs.some(p=>p.estimateId===e.id));
  return `<div class="stack">
    <div class="row"><h2 style="flex:1">현장</h2>
      <button class="btn pri" data-act="newProj">+ 새 현장</button>
      ${!projs.length&&!loose.length?`<button class="btn" data-act="seed">예시 데이터</button>`:''}</div>
    ${projs.length?`<div class="cards">${projs.map(p=>{
      const r=projRange(p), prog=projProgress(p), e=p.estimateId&&S.estimates.get(p.estimateId);
      const imgs=(p.files||[]).filter(f=>fileKind(f)==='img').length, docs=(p.files||[]).length-imgs;
      const next=(p.tasks||[]).filter(t=>dnum(t.end)>=dnum(today())).sort((a,b)=>String(a.start).localeCompare(String(b.start)))[0];
      return `<div class="card" role="button" tabindex="0" data-act="openSite" data-id="${p.id}">
        <div class="row" style="gap:6px"><span class="badge${p.status==='준공'?'':' warn'}">${esc(p.status||'준비')}</span>
          ${p.share?.on?'<span class="badge">공유중</span>':''}<span class="spacer"></span>
          <span class="muted small">${r?`${dstr(r.from).slice(5)}~${dstr(r.to).slice(5)}`:'일정 없음'}</span>
          <button class="card-x" data-act="renameSite" data-id="${p.id}" title="현장 이름 고치기" aria-label="${esc(siteName(p))} 이름 고치기">✎</button>
          <button class="card-x" data-act="delSite" data-id="${p.id}" title="이 현장 삭제" aria-label="${esc(siteName(p))} 삭제">✕</button></div>
        <b class="card-t">${esc(siteName(p))}${p.name?'':' <span class="badge warn">주소</span>'}</b>
        <span class="muted small">${esc(p.client||'')}${p.address?' · '+esc(p.address):''}</span>
        <div class="prog"><span style="width:${prog}%"></span></div>
        <div class="row small muted" style="gap:10px">
          <span>진행 ${prog}%</span><span>공정 ${(p.tasks||[]).length}</span>
          <span>사진 ${imgs}</span>${docs?`<span>도면 ${docs}</span>`:''}
          ${e?`<span class="spacer"></span><span>견적 ${won(calcEst(e).total)}원</span>`:''}
        </div>
        ${next?`<span class="small" style="color:var(--accent)">다음: ${esc(next.name)} ${esc(next.start||'')}</span>`:''}
      </div>`;}).join('')}</div>`
    :`<div class="panel"><div class="empty"><h3 style="margin-bottom:6px">아직 현장이 없습니다</h3>
      <p>현장을 만들면 일정, 사진, 공유 링크, 견적이 이 화면에 모입니다.</p></div></div>`}

    ${loose.length?`<section class="panel">
      <div class="panel-h"><h3>현장에 연결되지 않은 견적 ${loose.length}</h3></div>
      <div class="panel-b" style="display:flex;flex-direction:column;gap:8px">
        ${loose.map(e=>`<div class="row" style="gap:10px;border:1px solid var(--line2);border-radius:8px;padding:8px 10px">
          <div style="flex:1;min-width:0"><b>${esc(e.title)}</b><div class="muted small">${esc(e.client?.name||'')} · ${won(calcEst(e).total)}원</div></div>
          <button class="btn sm" data-act="openEst" data-id="${e.id}">견적 열기</button>
          <button class="btn sm pri" data-act="projFromEstId" data-id="${e.id}">현장 만들기</button>
        </div>`).join('')}
      </div></section>`:''}
  </div>`;
}
function renderHub(p){
  const r=projRange(p), prog=projProgress(p), e=p.estimateId&&S.estimates.get(p.estimateId);
  const imgs=(p.files||[]).filter(f=>fileKind(f)==='img');
  const tile=(act,extra,icon,title,desc,badge)=>`<button class="tile" data-act="${act}" ${extra||''}>
    <span class="tile-i">${icon}</span><b>${title}${badge?` <span class="badge">${badge}</span>`:''}</b><span class="muted small">${desc}</span></button>`;
  return `<div class="stack">
    <div class="row"><button class="btn ghost" data-act="homeBack">‹ 현장 목록</button><span class="spacer"></span>
      <span class="badge${p.status==='준공'?'':' warn'}">${esc(p.status||'준비')}</span></div>
    <section class="panel"><div class="panel-b">
      <h2>${esc(siteName(p))}</h2>
      <div class="muted small" style="margin-top:4px">${[p.client&&p.client+' 님',p.phone,p.address].filter(Boolean).map(esc).join(' · ')||'고객 정보 없음'}</div>
      <div class="prog" style="margin:12px 0 6px"><span style="width:${prog}%"></span></div>
      <div class="row small muted" style="gap:12px">
        <span>${r?`${dstr(r.from)} ~ ${dstr(r.to)}`:'일정 없음'}</span><span>진행 ${prog}%</span>
        ${p.startedAt?`<span>착공 ${esc(p.startedAt)}</span>`:''}${p.endedAt?`<span>준공 ${esc(p.endedAt)}</span>`:''}
      </div>
    </div></section>

    <div class="tiles">
      ${e ? tile('openEst',`data-id="${e.id}"`,'🧾','견적서',`${esc(e.title||'제목 없음')} · ${won(calcEst(e).total)}원`)
          : tile('newEstForSite','','🧾','견적서 만들기','이 현장의 견적을 새로 만듭니다')}
      ${tile('openSched','','📅','공정 일정','공정 추가·날짜 수정·사진 첨부',(p.tasks||[]).length||'')}
      ${p.share?.on&&p.share?.token
        ? tile('copyShare','','🔗','링크 열기','고객·작업자에게 보낼 주소 복사','열림')
        : tile('startWork','','🔗','링크 열기','착공 처리하고 공유 주소를 만듭니다')}
      ${tile('openFiles','','🖼','사진 · 도면','공정별 사진과 도면 보기',(p.files||[]).length||'')}
      ${tile('reportPdf','','📕','공사 보고서','일정·지시사항·사진 정리본 PDF')}
      ${tile('archiveProj','','📦','자료 내려받기','ZIP으로 통째로 보관')}
      ${p.status==='착공'?tile('endWork','','✅','준공 처리','공유 링크를 닫습니다')
        :p.status==='준공'?tile('startWork','','↺','다시 열기','A/S 등으로 공유를 다시 켭니다'):''}
    </div>

    ${imgs.length?`<section class="panel"><div class="panel-h"><h3>최근 사진</h3><span class="spacer"></span>
      <button class="btn sm" data-act="openFiles">모두 보기</button></div>
      <div class="panel-b"><div class="files">${imgs.slice(-6).reverse().map(f=>`<figure class="file">
        <a href="${esc(f.url)}" target="_blank" rel="noopener"><img src="${esc(f.url)}" alt="" loading="lazy"></a>
        <figcaption>${f.memo?`<b>${esc(f.memo)}</b>`:`<span class="muted small">${esc(f.name)}</span>`}</figcaption></figure>`).join('')}</div></div>
    </section>`:''}
  </div>`;
}

/* ---------- 현장 일정 · 공유 · 도면 ---------- */
const DAY = 86400000;
const dstr = d => { const x=new Date(d); return isNaN(x)?'':x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0'); };
const dnum = s => { const x=new Date(s+'T00:00:00'); return isNaN(x)?null:x.getTime(); };
const addDays = (s,n) => dstr(new Date(dnum(s)+n*DAY));
const STATUS = {예정:'#8a949013',진행:'var(--accent)',완료:'var(--muted)'};
const siteName = p => (p && p.name || '').trim() || (p && p.address || '').trim() || ((p && p.client || '').trim() ? p.client + ' 고객님 현장' : '') || '이름 없는 현장';
function newProject(from){
  const p={id:uid(),name:from?.title||'',client:from?.client?.name||'',phone:from?.client?.phone||'',address:from?.client?.address||'',
    note:'',estimateId:from?.id||null,tasks:[],files:[],share:{on:false,token:'',showMemo:true},updated:Date.now()};
  return p;
}
function projRange(p){
  const ds=(p.tasks||[]).flatMap(t=>[dnum(t.start),dnum(t.end)]).filter(Boolean);
  if(!ds.length) return null;
  return {from:Math.min(...ds), to:Math.max(...ds)};
}
function projProgress(p){
  const t=p.tasks||[]; if(!t.length) return 0;
  return Math.round(t.filter(x=>x.status==='완료').length/t.length*100);
}
const fileKind = f => /^image\//.test(f.type)?'img' : f.type==='application/pdf'?'pdf' : /\.(glb|gltf)$/i.test(f.name)?'glb' : 'other';
const KIND_LABEL = {img:'사진',pdf:'PDF',glb:'3D 모델',other:'파일'};

/* 공유 링크 */
const shareUrl = t => location.origin + location.pathname + '?s=' + t;
function sharePayload(p){
  const r=projRange(p);
  return {v:1, updatedAt:new Date().toISOString(),
    site:{name:siteName(p),address:p.address,note:p.note,client:p.client,
      from:r?dstr(r.from):'', to:r?dstr(r.to):'', progress:projProgress(p)},
    showMemo:p.share?.showMemo!==false,
    tasks:(p.tasks||[]).map(t=>({id:t.id,name:t.name,proc:t.proc,start:t.start,end:t.end,worker:t.worker,status:t.status||'예정',memo:p.share?.showMemo!==false?(t.memo||''):''})),
    files:(p.files||[]).filter(f=>f.shared!==false).map(f=>({name:f.name,url:f.url,type:f.type,size:f.size,taskId:f.taskId||'',memo:f.memo||''})),
    company:{name:S.company?.name||'',phone:S.company?.phone||''}};
}
const pubTimers={};
function schedulePublish(pid){ clearTimeout(pubTimers[pid]); pubTimers[pid]=setTimeout(()=>publishShare(S.projects.get(pid)),1200); }
async function publishShare(p){
  if(!p||!sb||!session||!p.share?.on||!p.share?.token) return;
  try{
    const {error}=await sb.from('shares').upsert({token:p.share.token,user_id:session.user.id,payload:sharePayload(p),updated_at:new Date().toISOString()},{onConflict:'token'});
    if(error) throw error;
    p.share.publishedAt=Date.now();
  }catch(e){ console.warn('share',e); toast('공유 링크 갱신에 실패했습니다: '+(e.message||'')); }
}
async function unpublishShare(token){ if(!sb||!session||!token) return; try{ await sb.from('shares').delete().eq('token',token); }catch(e){ console.warn(e); } }
/* 준공: 링크는 살아 있지만 안내만 보이게 내용을 비웁니다 */
async function closeShare(p){
  if(!sb||!session||!p.share?.token) return;
  try{ await sb.from('shares').upsert({token:p.share.token,user_id:session.user.id,
    payload:{v:1,closed:true,site:{name:siteName(p)},endedAt:p.endedAt,company:{name:S.company?.name||'',phone:S.company?.phone||''}},
    updated_at:new Date().toISOString()},{onConflict:'token'}); }catch(e){ console.warn(e); }
}
async function startWork(p){
  if(!sb||!session){ toast('로그인한 상태에서만 공유 링크를 만들 수 있습니다.'); return; }
  p.status='착공'; p.startedAt=today(); p.endedAt='';
  p.share={...(p.share||{}),on:true,token:p.share?.token||(uid()+uid()),showMemo:p.share?.showMemo!==false};
  saveProj(p); await publishShare(p); render(); toast('착공했습니다. 공유 링크가 열렸어요.');
}
async function endWork(p){
  if(!confirm(`“${siteName(p)}” 준공 처리할까요?\n고객·작업자 링크는 바로 닫히고, 자료는 그대로 남습니다.`)) return;
  p.status='준공'; p.endedAt=today(); p.share={...(p.share||{}),on:false};
  saveProj(p); await closeShare(p); render(); toast('준공 처리했습니다. 공유 링크가 닫혔어요.');
}
async function toggleShare(p,on){
  if(on){
    if(!sb||!session){ toast('로그인한 상태에서만 공유 링크를 만들 수 있습니다.'); return; }
    p.share={...(p.share||{}),on:true,token:p.share?.token||(uid()+uid()),showMemo:p.share?.showMemo!==false};
    saveProj(p); await publishShare(p); toast('공유 링크를 만들었습니다');
  }else{
    const t=p.share?.token; p.share={...(p.share||{}),on:false}; saveProj(p); await unpublishShare(t); toast('공유를 껐습니다. 기존 링크는 더 이상 열리지 않습니다.');
  }
  render();
}
async function copyShare(p){
  const url=shareUrl(p.share.token);
  try{ await navigator.clipboard.writeText(url); toast('링크를 복사했습니다'); }
  catch{ prompt('이 주소를 복사해서 보내세요',url); }
}

/* 도면 파일 */
async function uploadPlans(files,p,taskId){
  if(!sb||!session){ toast('로그인한 상태에서만 파일을 올릴 수 있습니다.'); return; }
  for(const f of [...files]){
    if(f.size>50*1024*1024){ toast(`${f.name}: 50MB가 넘어 올리지 못했습니다.`); continue; }
    const safe=f.name.replace(/[^\w.\-가-힣 ]/g,'_');
    const path=`${session.user.id}/${p.id}/${uid()}-${safe}`;
    try{
      const {error}=await sb.storage.from('plans').upload(path,f,{contentType:f.type||'application/octet-stream'});
      if(error) throw error;
      const {data}=sb.storage.from('plans').getPublicUrl(path);
      p.files=p.files||[]; p.files.push({id:uid(),name:f.name,path,url:data.publicUrl,type:f.type||'',size:f.size,shared:true,at:Date.now(),taskId:taskId||'',memo:''});
      saveProj(p); render(); toast(`${f.name} 올렸습니다`);
    }catch(e){ toast(`${f.name} 올리지 못했습니다: ${e.message||e}`); }
  }
}
/* 현장 자료 내려받기(ZIP) · 정리 */
async function archiveProject(p,thenDelete){
  const files=p.files||[];
  toast('자료를 모으는 중입니다…');
  try{
    if(!window.JSZip) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
    const zip=new JSZip();
    zip.file('현장정보.json',JSON.stringify({...strip(p),id:undefined},null,2));
    zip.file('공정일정.csv','﻿'+['작업,시작,종료,담당,상태,작업 메모',
      ...(p.tasks||[]).map(t=>[t.name,t.start,t.end,t.worker,t.status,t.memo].map(v=>`"${String(v||'').replace(/"/g,'""')}"`).join(','))].join('\r\n'));
    zip.file('보고서.html',reportHTML(p,true));
    let failed=0;
    for(const f of files){
      try{ const res=await fetch(f.url); if(!res.ok) throw new Error(res.status);
        const t=(p.tasks||[]).find(x=>x.id===f.taskId);
        const dir=fileKind(f)==='img' ? ('사진/'+(t?t.name.replace(/[\\/]/g,'_')+'/':'')) : '도면/';
        zip.file(dir+(f.memo?f.memo.replace(/[\\/:*?"<>|]/g,'_')+'_':'')+f.name.replace(/[\\/]/g,'_'),await res.blob()); }
      catch{ failed++; }
    }
    const blob=await zip.generateAsync({type:'blob'});
    await shareOrDownload(`${siteName(p).replace(/[\\/:*?"<>|]/g,'')}_자료.zip`,blob);
    if(failed) toast(`파일 ${failed}개는 내려받지 못했습니다.`);
    if(thenDelete){
      if(!confirm(`ZIP을 저장하셨나요?\n확인을 누르면 “${siteName(p)}” 현장과 올린 파일 ${files.length}개를 서버에서 지웁니다. 되돌릴 수 없습니다.`)) return;
      if(files.length) try{ await sb?.storage.from('plans').remove(files.map(f=>f.path)); }catch(e){ console.warn(e); }
      deleteProj(p.id); S.curPid=[...S.projects.keys()][0]||null; ls.set('curPid',S.curPid); render(); toast('현장을 정리했습니다.');
    }
  }catch(e){ toast('내려받지 못했습니다: '+(e.message||e)); }
}
async function removePlan(p,fid){
  const f=(p.files||[]).find(x=>x.id===fid); if(!f) return;
  if(!confirm(`“${f.name}”을(를) 지울까요?`)) return;
  try{ await sb?.storage.from('plans').remove([f.path]); }catch(e){ console.warn(e); }
  p.files=p.files.filter(x=>x.id!==fid); saveProj(p); render();
}

/* 일정 화면 */
let SCHED_MODE=ls.get('schedMode','site');
let MONTH=(()=>{ const d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); })();
function renderSched(){
  const list=[...S.projects.values()].sort((a,b)=>(b.updated||0)-(a.updated||0));
  const head=`<div class="row">
    <h2 style="flex:1">현장 일정</h2>
    <div class="chips">
      <button class="chip" data-act="schedMode" data-m="site" aria-pressed="${SCHED_MODE==='site'}">현장별</button>
      <button class="chip" data-act="schedMode" data-m="month" aria-pressed="${SCHED_MODE==='month'}">전체 달력</button>
    </div></div>`;
  if(SCHED_MODE==='month') return `<div class="stack">${head}${renderMonth()}</div>`;
  if(!list.length) return `<div class="stack">${head}<div class="panel"><div class="empty">
    <h3 style="margin-bottom:6px">아직 현장이 없습니다</h3><p>현장을 만들면 공정별 일정과 도면을 고객·작업자에게 링크로 공유할 수 있어요.</p>
    <div class="row" style="justify-content:center;margin-top:12px"><button class="btn pri" data-act="newProj">+ 새 현장</button>
    ${cur()?`<button class="btn" data-act="projFromEst">“${esc(cur().title)}” 견적에서 만들기</button>`:''}</div></div></div></div>`;
  const p=curProj()||list[0];
  return `<div class="stack">${head}
    <div class="row">
      <select class="f" id="projSel" data-act-change="pickProj" style="width:auto;max-width:280px">${list.map(x=>`<option value="${x.id}" ${x.id===p.id?'selected':''}>${esc(siteName(x))}${x.share?.on?' · 공유중':''}</option>`).join('')}</select>
      <button class="btn" data-act="newProj">+ 새 현장</button>
      ${cur()?`<button class="btn" data-act="projFromEst">견적에서 만들기</button>`:''}
      <span class="spacer"></span><button class="btn ghost danger" data-act="delProj">현장 삭제</button>
    </div>
    ${renderProject(p)}</div>`;
}
function renderProject(p){
  const r=projRange(p), prog=projProgress(p), used=new Set((p.tasks||[]).map(t=>t.proc));
  return `<section class="panel"><div class="panel-b client-grid">
      <label class="fl span2">현장 이름<input class="f" id="pj-name" data-bind="proj:name" value="${esc(p.name)}" placeholder="현장 이름"></label>
      <label class="fl">고객명<input class="f" id="pj-client" data-bind="proj:client" value="${esc(p.client)}"></label>
      <label class="fl">연락처<input class="f" type="tel" id="pj-phone" data-bind="proj:phone" value="${esc(p.phone)}"></label>
      <label class="fl span2">현장 주소<input class="f" id="pj-addr" data-bind="proj:address" value="${esc(p.address)}"></label>
      <label class="fl span2">고객·작업자에게 보일 안내<input class="f" id="pj-note" data-bind="proj:note" value="${esc(p.note)}" placeholder="예: 주차는 지하 2층, 자재는 엘리베이터 이용"></label>
    </div></section>

    <section class="panel">
      <div class="panel-h"><h3>공정 일정</h3><span class="muted small">${r?`${dstr(r.from)} ~ ${dstr(r.to)} · ${Math.round((r.to-r.from)/DAY)+1}일`:'일정 없음'}</span>
        <span class="spacer"></span><span class="badge">진행률 ${prog}%</span></div>
      ${(p.tasks||[]).length?`<div class="gantt">${ganttHTML(p,r)}</div>
      ${SEL_DAY?dayPanel((p.tasks||[]).filter(t=>onDay(t,SEL_DAY)).map(t=>({t,p})),SEL_DAY):''}`:''}
      <div class="tbl-wrap"><table class="t resp">
        <thead><tr><th class="w-name">작업</th><th>담당</th><th>시작</th><th>종료</th><th>상태</th><th>작업 메모</th><th></th></tr></thead>
        <tbody>${(p.tasks||[]).map((t,ti)=>`<tr>
          <td class="c-name"><input class="f" id="t${ti}-name" data-bind="task:${ti}:name" value="${esc(t.name)}" placeholder="작업 이름" style="font-weight:500"></td>
          <td data-l="담당"><input class="f" id="t${ti}-w" data-bind="task:${ti}:worker" value="${esc(t.worker||'')}" placeholder="예: 김반장"></td>
          <td data-l="시작"><input class="f" type="date" id="t${ti}-s" data-bind="task:${ti}:start" value="${esc(t.start||'')}"></td>
          <td data-l="종료"><input class="f" type="date" id="t${ti}-e" data-bind="task:${ti}:end" value="${esc(t.end||'')}"></td>
          <td data-l="상태"><select class="f" id="t${ti}-st" data-bind="task:${ti}:status">${['예정','진행','완료'].map(s=>`<option ${s===(t.status||'예정')?'selected':''}>${s}</option>`).join('')}</select></td>
          <td data-l="작업 메모"><input class="f" id="t${ti}-m" data-bind="task:${ti}:memo" value="${esc(t.memo||'')}" placeholder="작업자에게 전할 말"></td>
          <td class="c-act"><button class="btn ghost sm" data-act="taskPhoto" data-ti="${ti}" title="이 공정 사진 올리기">📷 사진${(p.files||[]).filter(f=>f.taskId===t.id).length||''}</button><button class="btn ghost sm" data-act="dupTask" data-ti="${ti}" title="같은 작업을 다른 날짜에 한 번 더 넣기">한 번 더</button><button class="btn ghost sm danger" data-act="delTask" data-ti="${ti}" aria-label="삭제">✕ 삭제</button></td></tr>`).join('')
          || `<tr><td colspan="7" class="muted small c-empty" style="padding:12px 8px">아래에서 공정을 눌러 일정을 추가하세요.</td></tr>`}</tbody>
      </table></div>
      <div class="proc-f"><b class="small">공정 추가</b><div class="chips">
        ${PROCS.map(x=>`<button class="chip${used.has(x.k)?' used':''}" data-act="addTask" data-k="${x.k}">+ ${x.n}</button>`).join('')}
        <button class="chip" data-act="addTask" data-k="">+ 직접 입력</button></div>
        <span class="spacer"></span>
        ${(p.tasks||[]).length>1?`<button class="btn ghost sm" data-act="sortTasks">날짜순 정렬</button>`:''}</div>
    </section>

    <section class="panel">
      <div class="panel-h"><h3>도면 · 사진</h3><span class="muted small">사진과 PDF는 링크에서 바로 보이고, 스케치업·캐드 파일은 내려받기로 열립니다.</span></div>
      <div class="panel-b">
        <div class="dropzone" id="pdz" style="padding:16px">
          <div style="flex:1;min-width:180px"><b>파일 올리기</b><div class="muted small">사진, PDF, .skp, .dwg, .dxf, .glb — 한 개당 50MB까지</div></div>
          <button class="btn" data-act="pickPlan">파일 선택</button>
        </div>
        ${(p.files||[]).length?`<div class="files">${p.files.map(f=>{const k=fileKind(f); return `<figure class="file">
          ${k==='img'?`<a href="${esc(f.url)}" target="_blank" rel="noopener"><img src="${esc(f.url)}" alt="${esc(f.name)}" loading="lazy"></a>`
            :`<a class="fi" href="${esc(f.url)}" target="_blank" rel="noopener"><span>${KIND_LABEL[k]}</span></a>`}
          <figcaption><b title="${esc(f.name)}">${esc(f.name)}</b>
            <select class="f small" data-bind="file:${f.id}:taskId" style="padding:3px 5px">
              <option value="">공정 미지정</option>
              ${(p.tasks||[]).map(t=>`<option value="${t.id}" ${f.taskId===t.id?'selected':''}>${esc(t.name)}</option>`).join('')}
            </select>
            <input class="f small" data-bind="file:${f.id}:memo" value="${esc(f.memo||'')}" placeholder="사진 설명 (예: 방수 2회차 완료)" style="padding:3px 5px">
            <div class="row" style="gap:6px;justify-content:space-between">
              <label class="small row" style="gap:5px"><input type="checkbox" data-bind="file:${f.id}:shared" ${f.shared!==false?'checked':''}> 공유</label>
              <span class="muted small">${(f.size/1024/1024).toFixed(1)}MB</span>
              <button class="btn ghost sm danger" data-act="delPlan" data-fid="${f.id}">삭제</button></div></figcaption></figure>`;}).join('')}</div>`:''}
      </div>
    </section>

    <section class="panel">
      <div class="panel-h"><h3>공사 상태</h3><span class="spacer"></span><span class="badge${p.status==='준공'?'':' warn'}">${esc(p.status||'준비')}</span></div>
      <div class="panel-b">
        <div class="row">
          ${p.status!=='착공'?`<button class="btn pri" data-act="startWork">착공 — 공유 링크 열기</button>`:''}
          ${p.status==='착공'?`<button class="btn" data-act="endWork">준공 — 공유 링크 닫기</button>`:''}
          ${p.status==='준공'?`<button class="btn" data-act="reportPdf">공사 보고서 PDF</button>`:''}
        </div>
        <p class="muted small" style="margin:10px 0 0">
          ${p.status==='착공'?`${esc(p.startedAt||'')} 착공 · 고객과 작업자가 링크로 일정을 보고 있습니다.`
            :p.status==='준공'?`${esc(p.endedAt||'')} 준공 · 링크를 열면 “공사가 끝났습니다” 안내만 보이고 일정·사진은 보이지 않습니다.`
            :'착공을 누르면 공유 링크가 만들어지고, 준공을 누르면 링크가 자동으로 닫힙니다.'}</p>
      </div>
    </section>

    <section class="panel">
      <div class="panel-h"><h3>보관 · 정리</h3></div>
      <div class="panel-b">
        <p class="muted small" style="margin:0">현장 자료는 계속 남아 있습니다. 정리하고 싶을 때 먼저 내려받고 지우세요.</p>
        <div class="row" style="margin-top:10px">
          <button class="btn" data-act="reportPdf">공사 보고서 PDF</button>
          <button class="btn" data-act="archiveProj">현장 자료 내려받기 (ZIP)</button>
          <span class="spacer"></span>
          <button class="btn ghost danger" data-act="purgeProj">내려받고 현장 지우기</button>
        </div>
        <p class="muted small" style="margin:10px 0 0">ZIP에는 일정·지시사항 정리본과 올린 파일 원본이 모두 들어갑니다. 사진 ${(p.files||[]).filter(f=>fileKind(f)==='img').length}장, 도면·기타 ${(p.files||[]).filter(f=>fileKind(f)!=='img').length}개.</p>
      </div>
    </section>

    <section class="panel">
      <div class="panel-h"><h3>고객·작업자 공유</h3><span class="muted small">일정과 도면만 보입니다. 견적과 원가는 절대 나오지 않습니다.</span></div>
      <div class="panel-b">
        <label class="row" style="gap:8px"><input type="checkbox" id="sh-on" ${p.share?.on?'checked':''} data-act-change="shareOn"> <b>공유 링크 켜기</b></label>
        ${p.share?.on&&p.share?.token?`
          <div class="row" style="margin-top:10px"><input class="f" id="sh-url" readonly value="${esc(shareUrl(p.share.token))}" style="flex:1;min-width:220px" onclick="this.select()">
            <button class="btn pri" data-act="copyShare">링크 복사</button>
            <a class="btn" href="${esc(shareUrl(p.share.token))}" target="_blank" rel="noopener">미리보기</a></div>
          <label class="row small" style="gap:6px;margin-top:10px"><input type="checkbox" id="sh-memo" ${p.share?.showMemo!==false?'checked':''} data-act-change="shareMemo"> 작업 메모도 함께 보여주기</label>
          <p class="muted small" style="margin:8px 0 0">일정을 고치면 링크 내용도 자동으로 바뀝니다. 링크를 끄면 그 주소는 바로 안 열립니다.</p>`
        :'<p class="muted small" style="margin:8px 0 0">켜면 주소가 만들어져요. 그 주소를 아는 사람만 볼 수 있고, 아무것도 수정할 수 없어요.</p>'}
      </div>
    </section>`;
}
const DAYW=34;               // 하루 한 칸의 너비(px)
const WD=['일','월','화','수','목','금','토'];
let SEL_DAY=null;            // 눌러서 펼쳐 본 날짜
const onDay=(t,key)=>{ const s=dnum(t.start),e=dnum(t.end),d=dnum(key); return s&&e&&d>=s&&d<=e; };
function ganttBars(tasks,r,sel){
  if(!r) return '';
  const span=Math.max(1,(r.to-r.from)/DAY+1), t0=dnum(today());
  const days=[...Array(span)].map((_,i)=>{ const ms=r.from+i*DAY, d=new Date(ms); return {ms,key:dstr(ms),d}; });
  const head=`<div class="g-row g-head"><span class="g-name">날짜</span><span class="g-track" style="width:${span*DAYW}px">${
    days.map(x=>`<button class="g-day${x.key===today()?' today':''}${x.key===sel?' sel':''}${x.d.getDay()===0?' sun':x.d.getDay()===6?' sat':''}" style="left:${(x.ms-r.from)/DAY*DAYW}px;width:${DAYW}px" data-act="selDay" data-d="${x.key}" title="${x.key}">
      <b>${x.d.getDate()}</b><i>${WD[x.d.getDay()]}</i></button>`).join('')}</span></div>`;
  const rows=tasks.filter(t=>dnum(t.start)&&dnum(t.end)).map(t=>{
    const s=(dnum(t.start)-r.from)/DAY, w=Math.max(1,(dnum(t.end)-dnum(t.start))/DAY+1), st=t.status||'예정';
    const now=(t0>=r.from&&t0<=r.to)?`<span class="g-now" style="left:${(t0-r.from)/DAY*DAYW}px;width:${DAYW}px"></span>`:'';
    const selm=sel&&dnum(sel)>=r.from&&dnum(sel)<=r.to?`<span class="g-sel" style="left:${(dnum(sel)-r.from)/DAY*DAYW}px;width:${DAYW}px"></span>`:'';
    return `<div class="g-row"><span class="g-name" title="${esc(t.name)}">${esc(t.name)}</span>
      <span class="g-track" style="width:${span*DAYW}px">${now}${selm}<span class="g-bar ${st==='완료'?'done':st==='진행'?'now':''}" style="left:${s*DAYW}px;width:${w*DAYW}px" title="${esc(t.start)} ~ ${esc(t.end)} · ${esc(t.worker||'담당 미정')}"><b>${esc(t.name)}</b></span></span></div>`;
  }).join('');
  return `<div class="gantt-scroll">${head}${rows}</div>`;
}
function ganttHTML(p,r){ return ganttBars(p.tasks||[],r,SEL_DAY); }
function dayPanel(items,key,opts={}){
  if(!key) return '';
  const d=new Date(dnum(key));
  return `<div class="dayp">
    <div class="row"><b>${d.getMonth()+1}월 ${d.getDate()}일 (${WD[d.getDay()]}) 작업</b>
      <span class="muted small">${items.length?items.length+'건':'작업 없음'}</span>
      <span class="spacer"></span><button class="btn ghost sm" data-act="selDay" data-d="">닫기</button></div>
    ${items.length?`<ul class="dayl">${items.map(({t,p})=>`<li>
      <span class="badge${t.status==='완료'?'':' warn'}">${esc(t.status||'예정')}</span>
      <b>${p&&opts.showProject?esc(siteName(p))+' · ':''}${esc(t.name)}</b>
      <span class="muted">${esc(t.worker||'담당 미정')}</span>
      <span class="muted small">${esc(t.start)}${t.end&&t.end!==t.start?' ~ '+esc(t.end):''}</span>
      ${t.memo&&opts.showMemo!==false?`<span class="small" style="flex-basis:100%">${esc(t.memo)}</span>`:''}
    </li>`).join('')}</ul>`:'<p class="muted small" style="margin:8px 0 0">이 날은 잡힌 작업이 없습니다.</p>'}
  </div>`;
}
function renderMonth(){
  const [y,m]=MONTH.split('-').map(Number);
  const first=new Date(y,m-1,1), start=new Date(first); start.setDate(1-first.getDay());
  const projs=[...S.projects.values()];
  const cells=[];
  for(let i=0;i<42;i++){
    const d=new Date(start); d.setDate(start.getDate()+i);
    const key=dstr(d), t=d.getTime();
    const items=[];
    projs.forEach((p,pi)=>(p.tasks||[]).forEach(task=>{ const s=dnum(task.start),e=dnum(task.end);
      if(s&&e&&t>=s&&t<=e) items.push({p,task,pi}); }));
    cells.push({d,key,items,other:d.getMonth()!==m-1});
  }
  const todayKey=today();
  return `<section class="panel">
    <div class="panel-h"><button class="btn sm" data-act="month" data-d="-1">‹</button>
      <b>${y}년 ${m}월</b><button class="btn sm" data-act="month" data-d="1">›</button>
      <span class="spacer"></span><button class="btn sm" data-act="month" data-d="0">이번 달</button></div>
    <div class="cal">
      ${['일','월','화','수','목','금','토'].map((d,i)=>`<div class="cal-h${i===0?' sun':i===6?' sat':''}">${d}</div>`).join('')}
      ${cells.map(c=>`<div class="cal-d${c.other?' out':''}${c.key===todayKey?' today':''}${c.key===SEL_DAY?' sel':''}" data-act="selDay" data-d="${c.key}">
        <span class="cal-n">${c.d.getDate()}</span>
        ${c.items.slice(0,4).map(({p,task,pi})=>`<span class="cal-i c${pi%6}" title="${esc(siteName(p))} · ${esc(task.name)}${task.worker?' · '+esc(task.worker):''}">${esc(siteName(p))} ${esc(task.name)}</span>`).join('')}
        ${c.items.length>4?`<span class="cal-i more">+${c.items.length-4}</span>`:''}
      </div>`).join('')}
    </div>
    ${SEL_DAY?`<div class="panel-b" style="padding-top:12px">${dayPanel(
      projs.flatMap(p=>(p.tasks||[]).filter(t=>onDay(t,SEL_DAY)).map(t=>({t,p}))),SEL_DAY,{showProject:true})}</div>`:''}
    ${projs.length?`<div class="panel-b row small">${projs.map((p,i)=>`<span class="legend c${i%6}">${esc(siteName(p))}</span>`).join('')}</div>`:'<div class="empty">현장을 먼저 만들어주세요.</div>'}
  </section>`;
}

/* 공사 보고서 (인쇄 → PDF로 저장) */
const REPORT_CSS=`
#report{--r-ink:#1a1a1a;--r-mut:#5f6360;--r-line:#cfd3d0;background:#fff;color:var(--r-ink);max-width:794px;margin:0 auto;padding:40px;
  font-family:"IBM Plex Sans KR","Apple SD Gothic Neo","Malgun Gothic",sans-serif;font-size:12.5px;line-height:1.55;font-variant-numeric:tabular-nums}
#report h1{font-size:26px;margin:0 0 4px}
#report .r-sub{color:var(--r-mut);margin-bottom:20px}
#report h2{font-size:14px;margin:26px 0 8px;padding-bottom:5px;border-bottom:1px solid var(--r-ink)}
#report dl.r-kv{display:grid;grid-template-columns:90px 1fr 90px 1fr;gap:4px 10px;margin:0 0 6px;font-size:12px}
#report dl.r-kv dt{color:var(--r-mut)}#report dl.r-kv dd{margin:0}
#report table{width:100%;border-collapse:collapse;font-size:11.5px}
#report th{background:#f1f4f2;text-align:left;padding:6px 7px;border-top:1px solid var(--r-line);border-bottom:1px solid var(--r-line)}
#report td{padding:6px 7px;border-bottom:1px solid var(--r-line);vertical-align:top}
#report .done{color:var(--r-mut)}
#report ul.r-memo{margin:0;padding-left:18px}
#report ul.r-memo li{margin-bottom:5px}
#report .r-photos{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:8px}
#report figure{margin:0;break-inside:avoid;page-break-inside:avoid}
#report figure img{width:100%;aspect-ratio:4/3;object-fit:cover;border:1px solid var(--r-line)}
#report figcaption{font-size:10.5px;color:var(--r-mut);margin-top:3px;word-break:break-all}
#report .r-foot{margin-top:28px;text-align:center;color:var(--r-mut);font-size:11px}
@media print{@page{size:A4;margin:12mm} #report{padding:0;max-width:none}}`;
(()=>{ const st=document.createElement('style'); st.textContent=REPORT_CSS+
  '\n#reportStage{display:none}\n@media print{body.printing > *{display:none!important} body.printing #reportStage{display:block!important}}';
  document.head.appendChild(st); })();
function reportHTML(p,forZip){
  const co=S.company||{}, r=projRange(p), tasks=(p.tasks||[]).slice().sort((a,b)=>String(a.start||'').localeCompare(String(b.start||'')));
  const imgs=(p.files||[]).filter(f=>fileKind(f)==='img'), others=(p.files||[]).filter(f=>fileKind(f)!=='img');
  const safe=s=>String(s||'').replace(/[\\/:*?"<>|]/g,'_');
  const src=f=>{ if(!forZip) return f.url;
    const t=tasks.find(x=>x.id===f.taskId);
    return '사진/'+(t?safe(t.name)+'/':'')+(f.memo?safe(f.memo)+'_':'')+safe(f.name); };
  const body=`<article id="report">
    <h1>${esc(siteName(p))} 공사 보고서</h1>
    <div class="r-sub">${esc(co.name||'')}${co.phone?' · '+esc(co.phone):''} · 출력일 ${today()}</div>
    <dl class="r-kv">
      <dt>고객</dt><dd>${esc(p.client||'-')}</dd><dt>연락처</dt><dd>${esc(p.phone||'-')}</dd>
      <dt>현장</dt><dd>${esc(p.address||'-')}</dd><dt>상태</dt><dd>${esc(p.status||'준비')}</dd>
      <dt>착공</dt><dd>${esc(p.startedAt||'-')}</dd><dt>준공</dt><dd>${esc(p.endedAt||'-')}</dd>
      <dt>공사 기간</dt><dd>${r?`${dstr(r.from)} ~ ${dstr(r.to)} (${Math.round((r.to-r.from)/DAY)+1}일)`:'-'}</dd>
      <dt>진행률</dt><dd>${projProgress(p)}% (${tasks.filter(t=>t.status==='완료').length}/${tasks.length})</dd>
    </dl>
    ${p.note?`<p>${esc(p.note)}</p>`:''}

    <h2>공정 일정</h2>
    <table><thead><tr><th style="width:26px">No</th><th>작업</th><th style="width:170px">기간</th><th style="width:80px">담당</th><th style="width:52px">상태</th></tr></thead>
      <tbody>${tasks.map((t,i)=>`<tr class="${t.status==='완료'?'done':''}"><td>${i+1}</td><td>${esc(t.name)}</td>
        <td>${esc(t.start||'')}${t.end&&t.end!==t.start?' ~ '+esc(t.end):''}${t.start&&t.end?` (${Math.round((dnum(t.end)-dnum(t.start))/DAY)+1}일)`:''}</td>
        <td>${esc(t.worker||'-')}</td><td>${esc(t.status||'예정')}</td></tr>`).join('')||'<tr><td colspan="5">등록된 일정이 없습니다.</td></tr>'}</tbody></table>

    ${tasks.some(t=>t.memo)?`<h2>작업 지시사항</h2><ul class="r-memo">${tasks.filter(t=>t.memo).map(t=>`<li><b>${esc(t.name)}</b> (${esc(t.start||'')}${t.worker?' · '+esc(t.worker):''}) — ${esc(t.memo)}</li>`).join('')}</ul>`:''}

    ${imgs.length?(()=>{
      const groups=tasks.map(t=>({t,fs:imgs.filter(f=>f.taskId===t.id)})).filter(g=>g.fs.length);
      const rest=imgs.filter(f=>!f.taskId||!tasks.some(t=>t.id===f.taskId));
      const grid=fs=>`<div class="r-photos">${fs.map(f=>`<figure><img src="${esc(src(f))}" alt=""><figcaption>${f.memo?esc(f.memo)+'<br>':''}${esc(f.name)}</figcaption></figure>`).join('')}</div>`;
      return `<h2>현장 사진 ${imgs.length}장</h2>
        ${groups.map(g=>`<h3 style="font-size:12.5px;margin:12px 0 4px">${esc(g.t.name)} <span style="color:var(--r-mut);font-weight:400">${esc(g.t.start||'')}${g.t.worker?' · '+esc(g.t.worker):''} · ${g.fs.length}장</span></h3>${grid(g.fs)}`).join('')}
        ${rest.length?`<h3 style="font-size:12.5px;margin:12px 0 4px">${groups.length?'기타':'전체'} <span style="color:var(--r-mut);font-weight:400">${rest.length}장</span></h3>${grid(rest)}`:''}`;})():''}

    ${others.length?`<h2>도면 · 첨부 파일</h2><table><thead><tr><th>파일</th><th style="width:80px">종류</th><th style="width:70px">크기</th></tr></thead>
      <tbody>${others.map(f=>`<tr><td>${esc(f.name)}</td><td>${KIND_LABEL[fileKind(f)]}</td><td>${(f.size/1024/1024).toFixed(1)}MB</td></tr>`).join('')}</tbody></table>
      ${forZip?'<p class="r-sub">원본 파일은 이 ZIP의 “도면” 폴더에 있습니다.</p>':''}`:''}

    <div class="r-foot">${esc(co.name||'')}${co.phone?' · '+esc(co.phone):''}${co.address?' · '+esc(co.address):''}</div>
  </article>`;
  if(!forZip) return body;
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${esc(siteName(p))} 공사 보고서</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;600;700&display=swap">
<style>body{margin:0;background:#eef0ed;padding:20px 0}${REPORT_CSS}</style></head><body>${body}
<p style="text-align:center;font-size:12px;color:#666">PDF로 저장하려면 이 파일을 브라우저에서 열고 Ctrl+P(맥은 ⌘P) → “PDF로 저장”을 고르세요.</p></body></html>`;
}
async function reportPdf(p){
  const old=document.getElementById('reportStage'); if(old) old.remove();
  const stage=document.createElement('div'); stage.id='reportStage'; stage.innerHTML=reportHTML(p,false);
  document.body.appendChild(stage); document.body.classList.add('printing');
  const imgs=[...stage.querySelectorAll('img')];
  await Promise.all(imgs.map(im=>im.complete?Promise.resolve():new Promise(r=>{im.onload=im.onerror=r;})));
  try{ window.print(); }catch{ toast('인쇄 창을 열지 못했습니다.'); }
  setTimeout(()=>{ document.body.classList.remove('printing'); stage.remove(); },800);
}

/* 공유 링크로 열었을 때 보이는 화면 (로그인 없음, 수정 불가) */
async function renderViewer(token){
  window.__viewerMode=true;
  const app=$('#app'); $('#tabs').hidden=true; $('#syncPill').hidden=true;
  app.innerHTML=`<div class="empty"><span class="spin"></span> 불러오는 중</div>`;
  const {url,key}=sbConf();
  let payload=null, err='';
  try{
    const client=window.supabase.createClient(url,key,{auth:{persistSession:false}});
    const {data,error}=await client.rpc('get_share',{p_token:token});
    if(error) throw error; payload=data;
  }catch(e){ err=e.message||String(e); }
  if(!payload){ app.innerHTML=`<div class="panel" style="max-width:520px;margin:6vh auto"><div class="empty">
    <h2 style="margin-bottom:8px">링크를 열 수 없습니다</h2>
    <p>주소가 바뀌었거나 공유가 꺼졌을 수 있어요. 보내주신 분께 새 링크를 요청해주세요.</p>
    ${err?`<p class="small muted">(${esc(err)})</p>`:''}</div></div>`; return; }
  window.__viewerPayload=payload;
  paintViewer();
}
function paintViewer(){
  const app=$('#app'), payload=window.__viewerPayload; if(!payload) return;
  if(payload.closed){
    app.innerHTML=`<div class="panel" style="max-width:520px;margin:6vh auto"><div class="empty">
      <h2 style="margin-bottom:8px">공사가 끝났습니다</h2>
      <p>${esc(payload.site?.name||'')}${payload.endedAt?` · ${esc(payload.endedAt)} 준공`:''}</p>
      <p class="small">그동안 협조해주셔서 감사합니다. 문의는 ${esc(payload.company?.name||'담당자')}${payload.company?.phone?` (${esc(payload.company.phone)})`:''}에게 연락해주세요.</p>
    </div></div>`; return;
  }
  const s=payload.site||{}, tasks=payload.tasks||[], files=payload.files||[];
  const r=tasks.length?{from:Math.min(...tasks.map(t=>dnum(t.start)).filter(Boolean)),to:Math.max(...tasks.map(t=>dnum(t.end)).filter(Boolean))}:null;
  const todayT=dnum(today());
  app.innerHTML=`<div class="stack viewer">
    <section class="panel"><div class="panel-b">
      <div class="eyebrow">공사 일정 안내</div>
      <h1 style="font-size:24px;margin:4px 0 6px">${esc(s.name||'현장')}</h1>
      <div class="muted small">${[s.address,s.client?s.client+' 님':''].filter(Boolean).map(esc).join(' · ')}</div>
      <div class="row" style="margin-top:12px">
        ${s.from?`<span class="badge">${esc(s.from)} ~ ${esc(s.to)}</span>`:''}
        <span class="badge">진행률 ${s.progress||0}%</span>
        ${payload.company?.name?`<span class="spacer"></span><span class="small muted">${esc(payload.company.name)}${payload.company.phone?' · '+esc(payload.company.phone):''}</span>`:''}
      </div>
      ${s.note?`<p class="status" style="margin-top:12px">${esc(s.note)}</p>`:''}
    </div></section>

    <section class="panel"><div class="panel-h"><h3>공정 일정</h3><span class="muted small">보기 전용입니다</span></div>
      ${r?`<div class="gantt">${ganttBars(tasks,r,SEL_DAY)}</div>
      ${SEL_DAY?dayPanel(tasks.filter(t=>onDay(t,SEL_DAY)).map(t=>({t})),SEL_DAY,{showMemo:payload.showMemo}):''}`:''}
      <div class="tbl-wrap"><table class="t resp"><thead><tr><th>작업</th><th>기간</th><th>담당</th><th>상태</th>${payload.showMemo?'<th>안내</th>':''}</tr></thead>
        <tbody>${tasks.map(t=>{const s2=dnum(t.start),e2=dnum(t.end);
          const on=s2&&e2&&todayT>=s2&&todayT<=e2;
          return `<tr${on?' class="on"':''}><td class="c-name"><b>${esc(t.name)}</b></td>
          <td data-l="기간">${esc(t.start||'')}${t.end&&t.end!==t.start?' ~ '+esc(t.end):''}</td>
          <td data-l="담당">${esc(t.worker||'-')}</td>
          <td data-l="상태"><span class="badge${t.status==='완료'?'':' warn'}">${esc(t.status||'예정')}</span></td>
          ${payload.showMemo?`<td data-l="안내" class="small muted">${esc(t.memo||'')}</td>`:''}</tr>`;}).join('')
          || '<tr><td colspan="5" class="empty c-empty">아직 등록된 일정이 없습니다.</td></tr>'}</tbody></table></div>
    </section>

    ${files.length?(()=>{
      const card=(f,i)=>{ const k=fileKind(f); return `<figure class="file">
        ${k==='img'?`<a href="${esc(f.url)}" target="_blank" rel="noopener"><img src="${esc(f.url)}" alt="${esc(f.name)}" loading="lazy"></a>`
          :k==='glb'?`<button class="fi glb" data-act="view3d" data-i="${i}"><span>3D 보기</span></button>`
          :`<a class="fi" href="${esc(f.url)}" target="_blank" rel="noopener"><span>${KIND_LABEL[k]}</span></a>`}
        <figcaption>${f.memo?`<b>${esc(f.memo)}</b>`:''}<span class="muted small" title="${esc(f.name)}">${esc(f.name)}</span>
          <a class="btn sm" href="${esc(f.url)}" target="_blank" rel="noopener" download>${k==='pdf'||k==='img'?'열기':'내려받기'}</a></figcaption></figure>`; };
      const idx=new Map(files.map((f,i)=>[f,i]));
      const groups=tasks.map(t=>({t,fs:files.filter(f=>f.taskId&&f.taskId===t.id)})).filter(g=>g.fs.length);
      const rest=files.filter(f=>!f.taskId||!tasks.some(t=>t.id===f.taskId));
      return `<section class="panel"><div class="panel-h"><h3>공정별 사진 · 도면</h3><span class="muted small">사진을 누르면 크게 볼 수 있습니다</span></div><div class="panel-b">
        ${groups.map(g=>`<div class="fgroup"><div class="row" style="gap:8px"><b>${esc(g.t.name)}</b>
          <span class="muted small">${esc(g.t.start||'')}${g.t.end&&g.t.end!==g.t.start?' ~ '+esc(g.t.end):''}</span>
          <span class="badge${g.t.status==='완료'?'':' warn'}">${esc(g.t.status||'예정')}</span></div>
          <div class="files">${g.fs.map(f=>card(f,idx.get(f))).join('')}</div></div>`).join('')}
        ${rest.length?`<div class="fgroup"><b>${groups.length?'기타 자료':'현장 자료'}</b><div class="files">${rest.map(f=>card(f,idx.get(f))).join('')}</div></div>`:''}
        <p class="muted small" style="margin:10px 0 0">스케치업(.skp)·캐드(.dwg) 파일은 내려받아 해당 프로그램에서 열어주세요.</p>
      </div></section>`;})():''}
    <p class="muted small" style="text-align:center">${esc(payload.company?.name||'')} · 이 화면은 보기 전용입니다. 문의는 담당자에게 연락해주세요.</p>
  </div>`;
  window.__viewerFiles=files;
}
async function view3d(i){
  const f=(window.__viewerFiles||[])[i]; if(!f) return;
  const box=document.createElement('div'); box.className='modal';
  box.innerHTML=`<div class="modal-b"><div class="row"><b style="flex:1">${esc(f.name)}</b><button class="btn sm" data-act="close3d">닫기</button></div><div class="v3d" id="v3d"><div class="empty"><span class="spin"></span> 3D 모델을 여는 중</div></div></div>`;
  document.body.appendChild(box);
  try{
    if(!window.THREE){ await loadScript('https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js'); }
    if(!window.THREE.GLTFLoader){ await loadScript('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js'); }
    if(!window.THREE.OrbitControls){ await loadScript('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js'); }
    const el=$('#v3d'); el.innerHTML='';
    const W=el.clientWidth||600,H=el.clientHeight||420;
    const scene=new THREE.Scene(); scene.background=new THREE.Color(0xf2f4f2);
    const cam=new THREE.PerspectiveCamera(50,W/H,.1,5000); const rnd=new THREE.WebGLRenderer({antialias:true});
    rnd.setSize(W,H); rnd.setPixelRatio(Math.min(2,devicePixelRatio)); el.appendChild(rnd.domElement);
    scene.add(new THREE.HemisphereLight(0xffffff,0x888888,1.1));
    const dl=new THREE.DirectionalLight(0xffffff,.8); dl.position.set(5,10,7); scene.add(dl);
    const ctr=new THREE.OrbitControls(cam,rnd.domElement);
    const gltf=await new Promise((res,rej)=>new THREE.GLTFLoader().load(f.url,res,undefined,rej));
    scene.add(gltf.scene);
    const b=new THREE.Box3().setFromObject(gltf.scene), c=b.getCenter(new THREE.Vector3()), sz=b.getSize(new THREE.Vector3()).length();
    cam.position.set(c.x+sz*.7,c.y+sz*.5,c.z+sz*.7); cam.far=sz*10; cam.updateProjectionMatrix(); ctr.target.copy(c); ctr.update();
    (function loop(){ if(!document.body.contains(box)) return; ctr.update(); rnd.render(scene,cam); requestAnimationFrame(loop); })();
  }catch(e){ $('#v3d').innerHTML=`<div class="empty">3D로 열지 못했습니다. 아래 내려받기로 확인해주세요.<br><span class="small">${esc(e.message||e)}</span></div>`; }
}
function loadScript(src){ return new Promise((res,rej)=>{ const s=document.createElement('script'); s.src=src; s.onload=res; s.onerror=()=>rej(new Error('불러오지 못함: '+src)); document.head.appendChild(s); }); }

/* ---------- settings ---------- */
function renderSettings(){
  const {url,key}=sbConf(), fromFile=!!(CFG.SUPABASE_URL&&CFG.SUPABASE_KEY);
  const apiKey=ls.get('anthropic_key')||'';
  return `<div class="stack"><h2>설정</h2><div class="set-grid">
    <section class="panel"><div class="panel-h"><h3>계정 · 동기화</h3></div><div class="panel-b">
      ${!sb?`<p class="muted small" style="margin:0">서버가 연결되지 않아 이 기기에만 저장되고 있습니다. 아래 “서버 연결”을 먼저 채워주세요.</p>`
        : session?`<dl class="kv"><dt>로그인</dt><dd>${esc(session.user.email)}</dd><dt>마지막 동기화</dt><dd>${lastSyncAt?lastSyncAt.toLocaleString('ko-KR'):'—'}</dd>${syncErr?`<dt>오류</dt><dd style="color:var(--bad)">${esc(syncErr)}</dd>`:''}</dl>
          <label class="row" style="gap:8px;font-size:13px"><input type="checkbox" id="set-auto" ${ls.get('autoLogin')!=='0'&&ls.get('autoPw')?'checked':''} data-act-change="autoLogin"> 이 기기에서 자동 로그인 ${ls.get('autoPw')?'':'<span class="muted small">(다음 로그인 때 켜집니다)</span>'}</label>
          <div class="row"><button class="btn" data-act="syncNow">지금 동기화</button><button class="btn ghost danger" data-act="logout">로그아웃</button></div>
          <p class="muted small" style="margin:0">로그아웃하면 이 기기의 데이터는 지워지고, 다시 로그인하면 클라우드에서 받아옵니다.</p>`
        : `<p class="muted small" style="margin:0">로그인하지 않아 이 기기에만 저장되고 있습니다. 로그인하면 지금 데이터가 계정으로 올라갑니다.</p><div><button class="btn pri" data-act="showLogin">로그인</button></div>`}
    </div></section>

    <section class="panel"><div class="panel-h"><h3>AI 단가표 읽기</h3></div><div class="panel-b">
      <p class="muted small" style="margin:0">Anthropic API 키를 넣으면 단가표 사진을 자동으로 정리합니다. 사용한 만큼 Anthropic 계정에서 요금이 나갑니다. 키는 이 기기에만 저장되고 동기화되지 않으니, 기기마다 한 번씩 넣어주세요.</p>
      <label class="fl">API 키<input class="f" type="password" id="set-akey" autocomplete="off" placeholder="sk-ant-..." value="${esc(apiKey)}"></label>
      <div class="row"><button class="btn pri" data-act="saveAKey">저장</button>${apiKey?`<button class="btn ghost danger" data-act="clearAKey">키 지우기</button>`:''}</div>
    </div></section>

    <section class="panel"><div class="panel-h"><h3>백업</h3></div><div class="panel-b">
      <p class="muted small" style="margin:0">견적·단가표·사진·업체 정보를 파일 하나로 저장합니다. 불러오면 더 최근에 고친 내용이 남습니다.</p>
      <div class="row"><button class="btn" data-act="exportBackup">백업 파일 만들기</button><button class="btn" data-act="importBackup">백업 불러오기</button></div>
    </div></section>

    <section class="panel"><div class="panel-h"><h3>서버 연결</h3></div><div class="panel-b">
      ${fromFile?`<dl class="kv"><dt>주소</dt><dd>${esc(url)}</dd><dt>설정 위치</dt><dd>config.js</dd></dl>`
      :`<p class="muted small" style="margin:0">Supabase 프로젝트의 Project URL과 Publishable key(또는 anon key)를 넣습니다. config.js에 넣어두면 기기마다 입력하지 않아도 됩니다.</p>
        <label class="fl">Project URL<input class="f" id="set-sburl" placeholder="https://xxxx.supabase.co" value="${esc(url)}"></label>
        <label class="fl">Publishable key<input class="f" id="set-sbkey" value="${esc(key)}"></label>
        <div><button class="btn pri" data-act="saveSb">연결</button></div>`}
    </div></section>

    <section class="panel"><div class="panel-h"><h3>앱 정보</h3></div><div class="panel-b">
      <dl class="kv"><dt>버전</dt><dd>${APP_VERSION}</dd><dt>저장된 견적</dt><dd>${S.estimates.size}건</dd><dt>저장된 자재</dt><dd>${S.materials.size}개</dd></dl>
      <div><button class="btn" data-act="checkUpdate">업데이트 확인</button></div>
    </div></section>
  </div></div>`;
}
async function exportBackup(){
  flushWrites();
  const recs=(await idb.all()).filter(r=>!r.deleted).map(({col,id,data,updated})=>({col,id,data,updated}));
  const blob=new Blob([JSON.stringify({app:'interior-estimate',version:1,exportedAt:new Date().toISOString(),records:recs})],{type:'application/json'});
  const d=new Date(), stamp=`${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  await shareOrDownload(`견적앱_백업_${stamp}.json`,blob);
}
async function importBackup(file){
  try{
    const j=JSON.parse(await file.text());
    if(j.app!=='interior-estimate'||!Array.isArray(j.records)) throw new Error('견적 앱 백업 파일이 아닙니다.');
    let n=0;
    for(const r of j.records){
      const key=r.col+'/'+r.id, local=await idb.get(key);
      if(local && local.updated>=r.updated) continue;
      await idb.put({key,col:r.col,id:r.id,data:r.data,updated:r.updated,dirty:true,deleted:false});
      applyRecord(r.col,r.id,r.data); n++;
    }
    if(!S.estimates.has(S.curId)) setCur([...S.estimates.keys()][0]||null);
    render(); scheduleSync(300);
    toast(n?`${n}건을 불러왔습니다`:'새로 불러올 내용이 없습니다 (이미 최신)');
  }catch(e){ toast('불러오지 못했습니다: '+(e.message||e)); }
}

/* ---------- photo handling ---------- */
let photoTarget=null;
async function fileToThumb(file){
  const img=await loadImage(file);
  const W=480,H=360,c=document.createElement('canvas'); c.width=W;c.height=H; const g=c.getContext('2d');
  const s=Math.max(W/img.width,H/img.height), w=img.width*s, h=img.height*s; g.drawImage(img,(W-w)/2,(H-h)/2,w,h);
  return c.toDataURL('image/jpeg',.78);
}
async function applyPhoto(file){
  if(!file||!photoTarget) return;
  let data; try{ data=await fileToThumb(file); }catch(e){ toast(e.message); return; }
  const t=photoTarget; photoTarget=null;
  if(t.kind==='mat'){ const m=S.materials.get(t.id); if(m){ m.image=data; saveMat(m); } }
  else { const e=cur(); const p=e.processes[t.pi]; const l=p.lines[t.li];
    let m=l.mid&&S.materials.get(l.mid);
    if(!m){ m={id:uid(),name:l.name||'자재',spec:l.spec,process:p.k,unit:l.unit,unitPrice:num(l.unitPrice),coverage:num(l.coverage),loss:num(l.loss),mode:l.mode||'area',note:'견적에서 추가',updated:Date.now()}; S.materials.set(m.id,m); l.mid=m.id; saveEst(e); }
    m.image=data; saveMat(m); }
  render(); toast('사진을 넣었습니다');
}

/* ---------- events ---------- */
function setPath(obj,path,val){ const ks=path.split('.'); let o=obj; ks.slice(0,-1).forEach(k=>o=o[k]??=({})); o[ks.at(-1)]=val; }
document.addEventListener('input',ev=>{
  const t=ev.target;
  if(t.type==='tel'){                       // 연락처는 적는 대로 - 를 넣어줍니다
    const before=t.value, pos=t.selectionStart??before.length, f=formatPhone(before);
    if(f!==before){
      const atEnd=pos>=before.length; t.value=f;
      try{ const c=atEnd?f.length:Math.min(pos+(f.length-before.length),f.length); t.setSelectionRange(c,c); }catch{}
    }
  }
  if(t.dataset?.size){                      // 면적: 숫자 칸 + 단위 선택
    const e=cur(); if(!e) return;
    if(t.dataset.size==='val') e.client.sizeVal=t.value.replace(/[^\d.]/g,'');
    else e.client.sizeUnit=t.value;
    e.client.size=sizeText(e.client);       // 견적서에 찍히는 문구
    saveEst(e);
    const el=document.getElementById('o-size-conv'); if(el) el.textContent=sizeConv(e.client);
    return;
  }
  if(t.dataset?.area!==undefined){          // 한 칸에서 ㎡·평 둘 다 입력 (평은 올림 표시)
    const pi=+t.dataset.area, e=cur(), p=e?.processes[pi]; if(!p) return;
    const a=parseArea(t.value);
    p.areaText=t.value; p.area=a.m2; saveEst(e);
    const hint=document.getElementById(`o-p${pi}-unit`); if(hint) hint.textContent=areaHint(t.value);
    recalc(); return;
  }
  const b=t.dataset?.bind; if(!b) return;
  let val = t.type==='checkbox' ? t.checked : t.value;
  if('num' in t.dataset) val=num(val);
  if('numEmpty' in t.dataset) val = t.value===''?'':num(t.value);
  const [kind,...rest]=b.split(':');
  if(kind==='est'){ const e=cur(); setPath(e,rest[0],val); saveEst(e);
    if(rest[0]==='client.size'){ const el=document.getElementById('o-size-conv'); if(el) el.textContent=sizeHint(val); }
    if(VIEW==='doc') refreshDoc(); else { recalc(); if(rest[0]==='title'){ const o=document.querySelector(`#estSel option[value="${e.id}"]`); if(o) o.textContent=`${e.title} · ${e.client.name||''}`; } } }
  else if(kind==='proc'){ const e=cur(); e.processes[+rest[0]][rest[1]]=val; saveEst(e); recalc(); }
  else if(kind==='line'){ const e=cur(); e.processes[+rest[0]].lines[+rest[1]][rest[2]]=val; saveEst(e); recalc(); }
  else if(kind==='mat'){ const m=S.materials.get(rest[0]); if(!m) return; m[rest[1]]=val;
    if(rest[1]==='coverage'){ m.mode=val>0?'area':'qty'; m.coverageBasis=''; }
    m.updated=Date.now(); saveMat(m);
    const o=document.getElementById('o-m-'+m.id); if(o) o.innerHTML=perM2Html(matPerM2(m)); }
  else if(kind==='rev'){ const it=IMPORT.items[+rest[0]]; it[rest[1]]=val; if(rest[1]==='coverage') it.mode=val>0?'area':'qty';
    const o=document.getElementById('o-rv-'+rest[0]); if(o) o.innerHTML=perM2Html(matPerM2(it)); }
  else if(kind==='co'){ S.company[rest[0]]=val; saveCo(); refreshDoc(); }
  else if(kind==='proj'){ const p=curProj(); if(!p) return; p[rest[0]]=val; saveProj(p);
    if(rest[0]==='name'){ const o=document.querySelector(`#projSel option[value="${p.id}"]`); if(o) o.textContent=val+(p.share?.on?' · 공유중':''); } }
  else if(kind==='task'){ const p=curProj(); const t=p?.tasks?.[+rest[0]]; if(!t) return; t[rest[1]]=val;
    if(rest[1]==='start'&&(!t.end||dnum(t.end)<dnum(val))) t.end=val;
    saveProj(p);
    const g=document.querySelector('.gantt'); if(g) g.innerHTML=ganttHTML(p,projRange(p)); }
  else if(kind==='file'){ const p=curProj(); const f=(p?.files||[]).find(x=>x.id===rest[0]); if(!f) return; f[rest[1]]=val; saveProj(p); }
});
document.addEventListener('change',ev=>{
  const t=ev.target, a=t.dataset?.actChange;
  if(t.dataset?.bind?.startsWith('mat:')&&t.tagName==='SELECT') render();
  if(!a) return;
  if(a==='pick'){ setCur(t.value); render(); }
  if(a==='addLine'&&t.value){ const e=cur(), p=e.processes[+t.dataset.pi], m=S.materials.get(t.value); if(m){ p.lines.push(lineFromMat(m)); saveEst(e); render(); } }
  if(a==='revAll'){ IMPORT.items.forEach(x=>x.on=t.checked); render(); }
  if(a==='pickProj'){ selectSite(t.value); render(); }
  if(a==='autoLogin'){ ls.set('autoLogin',t.checked?'1':'0'); if(!t.checked) ls.set('autoPw',null); toast(t.checked?'다음 로그인 때부터 자동으로 들어갑니다':'자동 로그인을 껐습니다'); render(); }
  if(a==='shareOn'){ toggleShare(curProj(),t.checked); }
  if(a==='shareMemo'){ const p=curProj(); p.share={...(p.share||{}),showMemo:t.checked}; saveProj(p); publishShare(p); }
});
document.addEventListener('submit',async ev=>{
  if(ev.target.id==='newSiteForm'){
    ev.preventDefault();
    const name=$('#ns-name').value.trim(), addr0=$('#ns-addr').value.trim();
    if(!name && !addr0){ toast('현장 이름이나 주소 중 하나는 적어주세요'); $('#ns-name').focus(); return; }
    const estId=$('#ns-est')?.value||'';
    const src=estId?S.estimates.get(estId):null;
    const n=newProject(src||undefined);
    n.name=name;                                   // 사용자가 쓴 이름을 현장 제목으로
    n.client=$('#ns-client').value.trim()||n.client;
    n.phone=$('#ns-phone').value.trim()||n.phone;
    n.address=$('#ns-addr').value.trim()||n.address;
    if(src) src.processes.forEach((pr,i)=>{ const P=PMAP[pr.k]||PMAP.etc; const st=addDays(today(),i*2);
      n.tasks.push({id:uid(),proc:pr.k,name:P.n,start:st,end:addDays(st,1),worker:'',status:'예정',memo:''}); });
    S.projects.set(n.id,n); S.curPid=n.id; ls.set('curPid',n.id); saveProj(n);
    HOME_NEW=false; HOME_SEL=n.id; render(); window.scrollTo(0,0);
    toast(`“${siteName(n)}” 현장을 만들었습니다`);
    return;
  }
  if(ev.target.id!=='loginForm') return;
  ev.preventDefault();
  const email=$('#lg-email').value.trim(), password=$('#lg-pw').value, auto=$('#lg-auto')?.checked!==false;
  AUTH.busy=true; AUTH.err=''; render();
  const {data,error}=await sb.auth.signInWithPassword({email,password});
  AUTH.busy=false;
  if(error){ AUTH.err = /invalid/i.test(error.message)?'이메일 또는 비밀번호가 맞지 않습니다.':(!navigator.onLine?'인터넷에 연결된 상태에서 처음 로그인해주세요.':error.message); render(); return; }
  ls.set('lastEmail',email); session=data.session; AUTH.skipped=false; ls.set('skipLogin',null);
  ls.set('autoLogin',auto?'1':'0');
  ls.set('autoPw',auto?btoa(unescape(encodeURIComponent(password))):null);
  render(); sync();
});
document.addEventListener('click',async ev=>{
  const t=ev.target.closest('[data-act]'); if(!t) return;
  if(t.tagName==='A') ev.preventDefault();
  const a=t.dataset.act, e=cur();
  switch(a){
    case 'view': VIEW=t.dataset.v; ls.set('view',VIEW);
      if(VIEW==='home'){ HOME_NEW=false; HOME_SEL=(S.curPid&&S.projects.has(S.curPid))?S.curPid:null; }   // 아래 “현장” 탭 = 지금 현장 메뉴
      render(); window.scrollTo(0,0); break;
    case 'renameSite': { ev.stopPropagation(); const p=S.projects.get(t.dataset.id); if(p && await editSiteBox(p)) render(); break; }
    case 'homeList': VIEW='home'; ls.set('view',VIEW); HOME_SEL=null; HOME_NEW=false; render(); window.scrollTo(0,0); break;  // 위 배너 = 전체 현장 목록
    case 'newEst': { const n=newEstimate(); S.estimates.set(n.id,n); setCur(n.id); saveEst(n); VIEW='est'; render(); break; }
    case 'dupEst': { const n=clone(e); n.id=uid(); n.title=e.title+' (복사)'; n.no=newEstimate().no; S.estimates.set(n.id,n); setCur(n.id); saveEst(n); render(); toast('복제했습니다'); break; }
    case 'delEst': if(await askConfirm({title:`“${e.title||'제목 없는 견적'}” 견적을 삭제할까요?`,lines:['되돌릴 수 없습니다'],ok:'네, 삭제합니다',cancel:'아니요'})){ deleteEst(e.id); setCur([...S.estimates.keys()][0]||null); render(); } break;
    case 'seed': seedExample(); break;
    case 'addProc': ensureProc(e,t.dataset.k); saveEst(e); render(); break;
    case 'delProc': { const p=e.processes[+t.dataset.pi]; if(!p.lines.length||confirm(`${PMAP[p.k].n} 공정을 삭제할까요?`)){ e.processes.splice(+t.dataset.pi,1); saveEst(e); render(); } break; }
    case 'addBlank': e.processes[+t.dataset.pi].lines.push({name:'',spec:'',unit:'개',unitPrice:0,coverage:0,loss:0,mode:'qty',qty:1,area:''}); saveEst(e); render(); break;
    case 'delLine': e.processes[+t.dataset.pi].lines.splice(+t.dataset.li,1); saveEst(e); render(); break;
    case 'toggleMode': { const p=e.processes[+t.dataset.pi], l=p.lines[+t.dataset.li]; if(l.mode==='qty'){ l.mode='area'; if(!num(l.coverage)) l.coverage=1; } else { l.qty=calcLine({...l,mode:'area'},num(p.area)).qty; l.mode='qty'; } saveEst(e); render(); break; }
    case 'refreshPrices': { let n=0; e.processes.forEach(p=>p.lines.forEach(l=>{ const m=l.mid&&S.materials.get(l.mid); if(m&&num(m.unitPrice)!==num(l.unitPrice)){ l.unitPrice=num(m.unitPrice); n++; } })); saveEst(e); render(); toast(n?`${n}개 자재 단가를 바꿨습니다`:'바뀐 단가가 없습니다'); break; }
    case 'goImport': VIEW='mat'; render(); if(ls.get('anthropic_key')) $('#fileSheet').click(); break;
    case 'pickSheet': $('#fileSheet').click(); break;
    case 'parse': parseSheets(); break;
    case 'revSave': saveReviewed(false); break;
    case 'revSaveAdd': saveReviewed(true); break;
    case 'revCancel': IMPORT={files:[],urls:[],busy:false,items:null,memo:'',err:''}; render(); break;
    case 'matFilter': MAT_FILTER=t.dataset.k; render(); break;
    case 'addMat': { const m={id:uid(),name:'',spec:'',process:MAT_FILTER==='all'?'etc':MAT_FILTER,unit:'박스',unitPrice:0,coverage:1,loss:5,mode:'area',note:'',updated:Date.now()}; S.materials.set(m.id,m); saveMat(m); render(); document.getElementById('m-'+m.id+'-name')?.select(); break; }
    case 'delMat': { const m=S.materials.get(t.dataset.id);
      if(await askConfirm({title:`“${m.name||'이름 없는 자재'}”을(를) 단가표에서 지울까요?`,lines:['이미 만든 견적의 금액은 그대로 유지됩니다'],ok:'네, 지웁니다',cancel:'아니요'})){ deleteMat(m.id); render(); } break; }
    case 'matPhoto': photoTarget={kind:'mat',id:t.dataset.id}; $('#filePhoto').click(); break;
    case 'linePhoto': photoTarget={kind:'line',pi:+t.dataset.pi,li:+t.dataset.li}; $('#filePhoto').click(); break;
    case 'print': flushWrites(); window.print(); break;
    case 'download': downloadDoc(); break;
    case 'syncNow': if(!sb||!session){ VIEW='set'; render(); } else sync(); break;
    case 'skipLogin': AUTH.skipped=true; ls.set('skipLogin','1'); render(); break;
    case 'showLogin': AUTH.skipped=false; ls.set('skipLogin',null); render(); break;
    case 'logout': if(confirm('로그아웃할까요? 올리지 못한 변경사항이 있으면 먼저 올린 뒤 이 기기의 데이터를 지웁니다.')) logout(); break;
    case 'saveAKey': { const v=$('#set-akey').value.trim(); ls.set('anthropic_key',v||null); toast(v?'API 키를 저장했습니다':'키를 지웠습니다'); render(); break; }
    case 'clearAKey': ls.set('anthropic_key',null); render(); toast('키를 지웠습니다'); break;
    case 'saveSb': { ls.set('sb_url',$('#set-sburl').value.trim()||null); ls.set('sb_key',$('#set-sbkey').value.trim()||null); await connectSupabase(); render(); toast(sb?'서버에 연결했습니다':'연결 정보를 확인해주세요'); break; }
    case 'exportBackup': exportBackup(); break;
    case 'importBackup': $('#fileBackup').click(); break;
    case 'checkUpdate': checkUpdate(true); break;
    case 'applyUpdate': applyUpdate(); break;
    case 'schedMode': SCHED_MODE=t.dataset.m; ls.set('schedMode',SCHED_MODE); render(); break;
    case 'newProj': {
      if(VIEW==='home'){ HOME_NEW=true; HOME_SEL=null; render(); setTimeout(()=>document.getElementById('ns-name')?.focus(),60); break; }
      const n=newProject(); S.projects.set(n.id,n); S.curPid=n.id; ls.set('curPid',n.id); saveProj(n); SCHED_MODE='site';
      render(); setTimeout(()=>document.getElementById('pj-name')?.select(),80); break; }
    case 'projFromEst': { const n=newProject(e); e.processes.forEach((pr,i)=>{ const P=PMAP[pr.k]||PMAP.etc; const st=addDays(today(),i*2);
        n.tasks.push({id:uid(),proc:pr.k,name:P.n,start:st,end:addDays(st,1),worker:'',status:'예정',memo:''}); });
      S.projects.set(n.id,n); S.curPid=n.id; ls.set('curPid',n.id); saveProj(n); VIEW='sched'; SCHED_MODE='site'; ls.set('view',VIEW); render(); toast('견적의 공정으로 일정을 만들었습니다. 날짜를 고쳐주세요.'); break; }
    case 'delProj': { const p=curProj(); if(!p) break;
      const n=(p.files||[]).length;
      if(await askConfirm({title:`“${siteName(p)}” 현장을 삭제할까요?`,
        lines:[`일정 ${(p.tasks||[]).length}건${n?`, 사진·도면 ${n}개`:''} 모두 지워집니다`,
               p.share?.on?'고객·작업자 공유 링크도 닫힙니다':'되돌릴 수 없습니다',
               '자료를 남기려면 취소하고 “자료 내려받기”를 먼저 하세요'],
        ok:'네, 삭제합니다', cancel:'아니요, 그대로 둡니다'})){
        if(n) try{ await sb?.storage.from('plans').remove(p.files.map(f=>f.path)); }catch(err){ console.warn(err); }
        deleteProj(p.id); S.curPid=[...S.projects.keys()][0]||null; ls.set('curPid',S.curPid); HOME_SEL=null; render(); } break; }
    case 'addTask': { const p=curProj(); const k=t.dataset.k; const P=PMAP[k];
      const last=(p.tasks||[]).map(x=>x.end).filter(Boolean).sort().pop();
      const st=last?addDays(last,1):today();
      p.tasks=p.tasks||[];
      const same=k?p.tasks.filter(x=>x.proc===k).length:0;
      p.tasks.push({id:uid(),proc:k||'',name:P?(same?`${P.n} ${same+1}차`:P.n):'',start:st,end:addDays(st,1),worker:'',status:'예정',memo:''});
      saveProj(p); render(); if(!P) setTimeout(()=>document.getElementById(`t${p.tasks.length-1}-name`)?.focus(),60); break; }
    case 'dupTask': { const p=curProj(); const src=p.tasks[+t.dataset.ti];
      const last=p.tasks.map(x=>x.end).filter(Boolean).sort().pop();
      const st=last?addDays(last,1):today(), len=Math.max(0,(dnum(src.end)-dnum(src.start))/DAY||0);
      const same=p.tasks.filter(x=>x.proc?x.proc===src.proc:x.name.replace(/ \d+차$/,'')===src.name.replace(/ \d+차$/,'')).length;
      p.tasks.push({...src,id:uid(),name:src.name.replace(/ \d+차$/,'')+` ${same+1}차`,start:st,end:addDays(st,len),status:'예정'});
      saveProj(p); render(); toast('같은 작업을 뒤쪽 날짜로 하나 더 넣었습니다. 날짜를 고쳐주세요.'); break; }
    case 'sortTasks': { const p=curProj(); p.tasks.sort((a,b)=>String(a.start||'').localeCompare(String(b.start||''))); saveProj(p); render(); break; }
    case 'openSite': HOME_SEL=t.dataset.id; selectSite(t.dataset.id); render(); window.scrollTo(0,0); break;
    case 'linkEstToSite': { const p=curProj(); if(!p||!e) break; p.estimateId=e.id; saveProj(p); render(); toast(`“${siteName(p)}” 현장에 연결했습니다`); break; }
    case 'delSite': { ev.stopPropagation(); const p=S.projects.get(t.dataset.id); if(!p) break;
      const n=(p.files||[]).length;
      const ok=await askConfirm({title:`“${siteName(p)}” 현장을 삭제할까요?`,
        lines:[`일정 ${(p.tasks||[]).length}건${n?`, 사진·도면 ${n}개`:''} 모두 지워집니다`,
               p.share?.on?'고객·작업자 공유 링크도 닫힙니다':'되돌릴 수 없습니다',
               '자료를 남기려면 취소하고 현장 화면에서 “자료 내려받기”를 먼저 하세요'],
        ok:'네, 삭제합니다', cancel:'아니요, 그대로 둡니다'});
      if(!ok) break;
      if(n) try{ await sb?.storage.from('plans').remove(p.files.map(f=>f.path)); }catch(err){ console.warn(err); }
      deleteProj(p.id);
      if(S.curPid===p.id){ S.curPid=[...S.projects.keys()][0]||null; ls.set('curPid',S.curPid); }
      if(HOME_SEL===p.id) HOME_SEL=null;
      render(); toast('현장을 삭제했습니다'); break; }
    case 'homeBack': HOME_SEL=null; HOME_NEW=false; render(); break;
    case 'openSched': VIEW='sched'; SCHED_MODE='site'; ls.set('view',VIEW); render(); window.scrollTo(0,0); break;
    case 'openFiles': VIEW='sched'; SCHED_MODE='site'; ls.set('view',VIEW); render();
      setTimeout(()=>document.querySelector('.files')?.scrollIntoView({block:'center',behavior:'smooth'})||document.getElementById('pdz')?.scrollIntoView({block:'center'}),80); break;
    case 'openEst': if(t.dataset.id){ setCur(t.dataset.id); } VIEW='est'; ls.set('view',VIEW); render(); window.scrollTo(0,0); break;
    case 'openDoc': if(t.dataset.id){ setCur(t.dataset.id); } VIEW='doc'; ls.set('view',VIEW); render(); window.scrollTo(0,0); break;
    case 'newEstForSite': { const p=curProj(); const n=newEstimate();
      n.title=siteName(p); n.client={name:p.client||'',phone:p.phone||'',address:p.address||'',size:''};
      S.estimates.set(n.id,n); setCur(n.id); saveEst(n); p.estimateId=n.id; saveProj(p);
      VIEW='est'; ls.set('view',VIEW); render(); toast('이 현장의 견적을 만들었습니다'); break; }
    case 'projFromEstId': { const src=S.estimates.get(t.dataset.id); if(!src) break;
      const n=newProject(src); src.processes.forEach((pr,i)=>{ const P=PMAP[pr.k]||PMAP.etc; const st=addDays(today(),i*2);
        n.tasks.push({id:uid(),proc:pr.k,name:P.n,start:st,end:addDays(st,1),worker:'',status:'예정',memo:''}); });
      S.projects.set(n.id,n); S.curPid=n.id; ls.set('curPid',n.id); saveProj(n); HOME_SEL=n.id; render(); toast('견적의 공정으로 현장을 만들었습니다'); break; }
    case 'startWork': startWork(curProj()); break;
    case 'endWork': endWork(curProj()); break;
    case 'reportPdf': reportPdf(curProj()); break;
    case 'archiveProj': archiveProject(curProj(),false); break;
    case 'purgeProj': archiveProject(curProj(),true); break;
    case 'delTask': { const p=curProj(); p.tasks.splice(+t.dataset.ti,1); saveProj(p); render(); break; }
    case 'pickPlan': PLAN_TASK=''; $('#filePlan').click(); break;
    case 'taskPhoto': { const p=curProj(); PLAN_TASK=p.tasks[+t.dataset.ti]?.id||''; $('#filePlan').setAttribute('accept','image/*'); $('#filePlan').click(); break; }
    case 'delPlan': removePlan(curProj(),t.dataset.fid); break;
    case 'copyShare': copyShare(curProj()); break;
    case 'month': { if(t.dataset.d==='0'){ const d=new Date(); MONTH=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); }
      else { const [y,m]=MONTH.split('-').map(Number); const d=new Date(y,m-1+ +t.dataset.d,1); MONTH=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); }
      render(); break; }
    case 'selDay': { const d=t.dataset.d||''; SEL_DAY = (!d||d===SEL_DAY) ? null : d;
      if(window.__viewerMode) paintViewer(); else render();
      if(SEL_DAY) setTimeout(()=>document.querySelector('.dayp')?.scrollIntoView({block:'nearest',behavior:'smooth'}),60);
      break; }
    case 'view3d': view3d(+t.dataset.i); break;
    case 'close3d': document.querySelector('.modal')?.remove(); break;
  }
});
$('#filePhoto').addEventListener('change',ev=>{ applyPhoto(ev.target.files[0]); ev.target.value=''; });
$('#fileSheet').addEventListener('change',ev=>{ setSheetFiles(ev.target.files); ev.target.value=''; });
$('#fileBackup').addEventListener('change',ev=>{ if(ev.target.files[0]) importBackup(ev.target.files[0]); ev.target.value=''; });
let PLAN_TASK='';
$('#filePlan').addEventListener('change',ev=>{ if(ev.target.files.length) uploadPlans(ev.target.files,curProj(),PLAN_TASK); ev.target.value=''; ev.target.removeAttribute('accept'); PLAN_TASK=''; });
document.addEventListener('dragover',ev=>{ const dz=ev.target.closest?.('#dz'); if(dz){ ev.preventDefault(); dz.classList.add('drag'); } });
document.addEventListener('dragleave',ev=>{ ev.target.closest?.('#dz')?.classList.remove('drag'); });
document.addEventListener('drop',ev=>{ const dz=ev.target.closest?.('#dz'); if(dz){ ev.preventDefault(); dz.classList.remove('drag'); if(ls.get('anthropic_key')) setSheetFiles(ev.dataTransfer.files); }
  const pdz=ev.target.closest?.('#pdz'); if(pdz){ ev.preventDefault(); pdz.classList.remove('drag'); uploadPlans(ev.dataTransfer.files,curProj()); } });
document.addEventListener('dragover',ev=>{ const pdz=ev.target.closest?.('#pdz'); if(pdz){ ev.preventDefault(); pdz.classList.add('drag'); } });
document.addEventListener('paste',ev=>{ if(VIEW!=='mat'||!ls.get('anthropic_key')) return; const fs=[...(ev.clipboardData?.files||[])]; if(fs.length){ ev.preventDefault(); setSheetFiles(fs); } });
document.addEventListener('visibilitychange',()=>{ if(window.__viewerMode) return; if(document.visibilityState==='hidden') flushWrites(); else { scheduleSync(200); checkUpdate(false); } });
window.addEventListener('pagehide',flushWrites);
window.addEventListener('online',()=>scheduleSync(200));
window.addEventListener('offline',updatePill);
setInterval(()=>{ if(document.visibilityState==='visible') sync(); },60000);

async function logout(){
  flushWrites();
  try{ await push(); }catch(e){ if(!confirm('변경사항을 올리지 못했습니다. 그래도 로그아웃하면 이 기기에만 있던 변경사항이 사라집니다. 계속할까요?')) return; }
  ls.set('autoPw',null); ls.set('autoLogin','0');
  await sb.auth.signOut();
  await idb.clear(); S.materials.clear(); S.estimates.clear(); S.company={}; setCur(null);
  session=null; lastSyncAt=null; render();
}

/* ---------- example data (only on request) ---------- */
function seedExample(){
  const mk=(process,name,spec,unit,unitPrice,coverage,loss,tone,note)=>({id:uid(),process,name,spec,unit,unitPrice,coverage,loss,tone,note:'예시 단가 · '+note,mode:coverage>0?'area':'qty',coverageBasis:'',updated:Date.now()});
  const ms=[
    mk('paper','실크벽지','폭 1.06m × 15.6m','롤',38000,16.5,12,'#ece8e1','1.06×15.6≈16.5㎡'),
    mk('paper','초배지·풀','부자재 세트','롤',15000,50,5,'#f3f1ec','1롤 약 50㎡'),
    mk('floor','강마루','8×95×800mm 내추럴 오크','박스',48000,1.6,6,'#b98a5c','박스당 약 1.6㎡'),
    mk('tile','포세린 타일','600×600 무광 그레이, 4장/박스','박스',32000,1.44,10,'#cfccc5','0.6×0.6×4=1.44㎡'),
    mk('tile','타일 접착제','드라이픽스 25kg','포',12000,5,5,'#d9d6d0','25kg 약 5㎡'),
    mk('tile','줄눈 (에폭시)','2kg','통',28000,10,5,'#e7e5e0','2kg 약 10㎡'),
    mk('paint','수성 페인트','친환경 18L 화이트','통',85000,60,5,'#f1efe9','18L 1회 약 60㎡'),
    mk('carp','석고보드','9.5T 900×1800','장',4200,1.62,5,'#e6e3dd','0.9×1.8=1.62㎡'),
    mk('plumb','액체 방수제','18kg (2회 도포)','통',45000,10,5,'#8a9aa3','2회 도포 약 10㎡'),
    mk('elec','LED 다운라이트','3인치 8W 주광색','개',12000,0,0,'#f2f2f0','수량 기준'),
    mk('demo','폐기물 처리','1톤 차량','대',350000,0,0,'#9a9892','수량 기준'),
  ];
  ms.forEach(m=>{ S.materials.set(m.id,m); saveMat(m); });
  const by=n=>ms.find(m=>m.name===n);
  const e=newEstimate(); e.title='84㎡ 아파트 부분 리모델링 (예시)'; e.client={name:'김예시',phone:'010-1234-5678',address:'서울시 ○○구 ○○아파트 101동 1203호',size:'32평 (전용 84㎡)'};
  const P=(k,area,lab,lump,names,qtys={})=>{ const p=ensureProc(e,k); p.area=area; p.laborPerM2=lab; p.laborLump=lump; names.forEach(n=>{ const l=lineFromMat(by(n)); if(qtys[n]!=null) l.qty=qtys[n]; p.lines.push(l); }); };
  P('demo',0,0,600000,['폐기물 처리'],{'폐기물 처리':2});
  P('plumb',8,25000,0,['액체 방수제']);
  P('tile',32,38000,0,['포세린 타일','타일 접착제','줄눈 (에폭시)']);
  P('floor',84,15000,0,['강마루']);
  P('paper',230,7000,0,['실크벽지','초배지·풀']);
  P('elec',0,0,450000,['LED 다운라이트'],{'LED 다운라이트':18});
  S.estimates.set(e.id,e); setCur(e.id); saveEst(e); render(); toast('예시 데이터를 넣었습니다');
}

/* ---------- service worker (offline + updates) ---------- */
let swReg=null;
async function registerSW(){
  if(!('serviceWorker' in navigator) || location.protocol==='file:') return;
  // 내 컴퓨터에서 고치며 확인할 때는 저장본 때문에 헷갈리지 않도록 끔 (?sw=1 로 켤 수 있음)
  if(location.hostname==='localhost' && !location.search.includes('sw=1')) return;
  try{
    swReg=await navigator.serviceWorker.register('sw.js');
    const showIfWaiting=()=>{ if(swReg.waiting && navigator.serviceWorker.controller) $('#updateBar').hidden=false; };
    showIfWaiting();
    swReg.addEventListener('updatefound',()=>{ const w=swReg.installing; w?.addEventListener('statechange',()=>{ if(w.state==='installed') showIfWaiting(); }); });
    let reloaded=false;
    navigator.serviceWorker.addEventListener('controllerchange',()=>{ if(reloaded) return; reloaded=true; location.reload(); });
  }catch(e){ console.warn('sw',e); }
}
async function checkUpdate(manual){
  if(!swReg){ if(manual) toast('이 화면에서는 업데이트 확인을 쓸 수 없습니다.'); return; }
  try{ await swReg.update(); }catch{}
  if(manual) setTimeout(()=>toast(swReg.waiting||swReg.installing?'새 버전을 받는 중입니다. 위의 “지금 적용”을 눌러주세요.':'최신 버전입니다.'),800);
}
function applyUpdate(){ flushWrites(); swReg?.waiting?.postMessage('skipWaiting'); }

/* ---------- boot ---------- */
async function autoLogin(){
  // 세션이 만료됐을 때, 이 기기에 저장해둔 정보로 조용히 다시 로그인
  if(session||!sb||!navigator.onLine) return;
  const email=ls.get('lastEmail'), pw=ls.get('autoPw');
  if(!email||!pw||ls.get('autoLogin')==='0') return;
  try{
    const {data,error}=await sb.auth.signInWithPassword({email,password:decodeURIComponent(escape(atob(pw)))});
    if(error) throw error;
    session=data.session;
  }catch(e){ if(/invalid/i.test(e?.message||'')) ls.set('autoPw',null); }
}
async function connectSupabase(){
  sb=initSupabase(); session=null;
  if(!sb) return;
  try{ const {data}=await sb.auth.getSession(); session=data.session; }catch{}
  await autoLogin();
  sb.auth.onAuthStateChange(async (_ev,s)=>{
    session=s; updatePill();
    if(!s && !window.__viewerMode){ await autoLogin(); if(session){ updatePill(); sync(); } else safeRender(); }
  });
}
(async()=>{
  const shareToken=new URLSearchParams(location.search).get('s');
  if(shareToken){ await renderViewer(shareToken); registerSW(); return; }
  await loadLocal();
  await connectSupabase();
  render();
  registerSW();
  if(session) sync();
})();
