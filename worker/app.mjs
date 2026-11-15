const TTL=600, STALE_TTL=86400;
function json(value,status=200){return new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}})}
async function loadPage(source,page,origin){
 const cache=globalThis.caches?.default,key=new Request(origin+'/__feed_cache/'+source.id+'/'+page);let stored=null;
 if(cache){try{const r=await cache.match(key);if(r)stored=await r.json()}catch{}}
 if(stored&&Date.now()-Date.parse(stored.checked_at)<TTL*1000)return {...stored,state:'live',cached:true};
 try{
  const url=sourceUrl(source,page);
  const r=await fetch(url,{headers:{Accept:'text/html','User-Agent':'Moyeobom/3.0 (+https://moyeobom-campus.gayoungk1.chatgpt.site)','Accept-Language':'ko-KR,ko;q=0.9'},signal:AbortSignal.timeout(12000),redirect:'follow'});
  if(!r.ok)throw new Error('원본 HTTP '+r.status);
  const checked_at=new Date().toISOString(),parsed=parseBoard(await r.text(),source,page,checked_at);
  const value={...parsed,source_id:source.id,page,checked_at,state:'live'};
  if(cache){try{await cache.put(key,new Response(JSON.stringify(value),{headers:{'Cache-Control':'public, max-age='+STALE_TTL,'Content-Type':'application/json'}}))}catch{}}
  return value;
 }catch(e){
  console.error('feed_fetch_failed',source.id,page,e.name,e.message);
  const fallback=stored||SEED.find(x=>x.source_id===source.id&&x.page===page);
  return {items:fallback?.items||[],listed:fallback?.listed||0,source_id:source.id,page,checked_at:fallback?.checked_at||null,state:fallback?'stale':'error',error:e.name==='TimeoutError'?'원본 응답 시간 초과':'원본 연결 또는 목록 읽기 실패',diagnostic:(e.name+': '+e.message).slice(0,180)};
 }
}
// Durable host-wide refresh leases keep visitors and edge locations from hammering the origin.
function retryAfterMs(value,now=Date.now()){
 if(!value)return 600000;
 const seconds=Number(value);if(Number.isFinite(seconds))return Math.max(600000,seconds*1000);
 const date=Date.parse(value);return Number.isFinite(date)?Math.max(600000,date-now):600000;
}
async function durablePages(selectedSources,origin,db,ctx){
 const jobs=selectedSources.flatMap(source=>Array.from({length:source.pages},(_,i)=>({source,page:i+1})));
 const saved=await Promise.all(jobs.map(async({source,page})=>{
  const key='page:'+source.id+':'+page,row=await db.prepare('SELECT value_json FROM feed_refresh_state WHERE key=?').bind(key).first();
  let value=null;try{value=row?.value_json?JSON.parse(row.value_json):null}catch{}
  if(!value){try{const edge=await globalThis.caches?.default?.match(new Request(origin+'/__feed_cache/'+source.id+'/'+page));if(edge)value=await edge.json()}catch{}}
  value=value||SEED.find(s=>s.source_id===source.id&&s.page===page);
  return {...value,items:value?.items||[],listed:value?.listed||0,source_id:source.id,page,checked_at:value?.checked_at||null,state:value&&Date.now()-Date.parse(value.checked_at)<TTL*1000?'live':value?'stale':'error'};
 }));
 if(saved.every(p=>p.state==='live'))return saved;
 const host='host:'+new URL(sourceUrl(selectedSources[0])).hostname,now=Date.now();
 const lock=await db.prepare('INSERT INTO feed_refresh_state(key,retry_at,lease_until) VALUES(?,0,?) ON CONFLICT(key) DO UPDATE SET lease_until=excluded.lease_until WHERE feed_refresh_state.retry_at<=? AND feed_refresh_state.lease_until<=? RETURNING key').bind(host,now+180000,now,now).first();
 if(!lock){const state=await db.prepare('SELECT value_json,retry_at,lease_until FROM feed_refresh_state WHERE key=?').bind(host).first();let info={};try{info=JSON.parse(state?.value_json||'{}')}catch{}return saved.map(p=>p.state==='live'?p:{...p,reason:state?.lease_until>now?'updating':info.reason||'cooldown',retry_at:state?.retry_at||0})}
 const refresh=async()=>{
  let cooldown=0,reason='';const results=[...saved];
  try{
   for(let i=0;i<jobs.length;i++){
    const {source,page}=jobs[i];if(results[i].state==='live')continue;
    if(cooldown){results[i]={...results[i],reason,retry_at:cooldown};continue}
    try{
     const r=await fetch(sourceUrl(source,page),{headers:{Accept:'text/html','User-Agent':'Moyeobom/3.0 (+https://moyeobom-campus.gayoungk1.chatgpt.site)','Accept-Language':'ko-KR,ko;q=0.9'},signal:AbortSignal.timeout(12000),redirect:'follow'});
     if(!r.ok){const error=new Error('원본 HTTP '+r.status);error.status=r.status;error.retry=r.headers.get('Retry-After');throw error}
     const checked_at=new Date().toISOString(),parsed=parseBoard(await r.text(),source,page,checked_at),value={...parsed,source_id:source.id,page,checked_at,state:'live'};
     await db.prepare('INSERT INTO feed_refresh_state(key,value_json) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json').bind('page:'+source.id+':'+page,JSON.stringify(value)).run();results[i]=value;
     if(ctx&&i<jobs.length-1)await new Promise(resolve=>setTimeout(resolve,350));
    }catch(e){reason=e.status===429?'rate_limit':'origin_error';cooldown=Date.now()+(e.status===429?retryAfterMs(e.retry):300000);results[i]={...results[i],reason,retry_at:cooldown};console.error('feed_refresh_paused',source.id,page,reason,e.message)}
   }
  }finally{await db.prepare('UPDATE feed_refresh_state SET value_json=?,retry_at=?,lease_until=0 WHERE key=?').bind(JSON.stringify({reason}),cooldown||Date.now()+TTL*1000,host).run()}
  return results;
 };
 if(ctx?.waitUntil){ctx.waitUntil(refresh());return saved.map(p=>p.state==='live'?p:{...p,reason:'updating'})}
 return await refresh();
}
async function feed(request,env,ctx){
 const requestUrl=new URL(request.url),origin=requestUrl.origin,school=requestUrl.searchParams.get('school')||'ks';
 if(![...SCHOOLS,UNION_COLLECTION].some(s=>s.id===school))return json({error:'학교를 선택해주세요.'},400);
 if(school===UNION_COLLECTION.id)return json({school_id:school,items:UNION_EVENTS.filter(e=>e.school_id===school),sources:[],provided_count:0,generated_at:new Date().toISOString(),cache_seconds:TTL,total_listed:UNION_EVENTS.length,coverage:'부산 남구 대학 연합 행사',live:true});
 const selectedSources=SOURCES.filter(s=>s.school_id===school);
 const pages=env?.DB?await durablePages(selectedSources,origin,env.DB,ctx):await Promise.all(selectedSources.flatMap(s=>Array.from({length:s.pages},(_,i)=>loadPage(s,i+1,origin))));
 const provided=IMPORTED_PROGRAMS.filter(p=>p.school_id===school);
 const items=deduplicate([...pages.flatMap(p=>p.items),...provided]);
 const sources=selectedSources.map(s=>{const ps=pages.filter(p=>p.source_id===s.id),live=ps.filter(p=>p.state==='live').length;return {...s,url:sourceUrl(s).href,state:live===ps.length?'live':live?'partial':ps.some(p=>p.state==='stale')?'stale':'error',live_pages:live,reasons:[...new Set(ps.map(p=>p.reason).filter(Boolean))],retry_at:Math.max(0,...ps.map(p=>p.retry_at||0)),checked_at:ps.map(p=>p.checked_at).filter(Boolean).sort()[0]||null,pages_detail:ps.map(({items,listed,...p})=>({...p,listed,count:items.length}))}});
 if(provided.length)sources.push({id:'pknu-import',school_id:school,name:'부경아이 비교과 · 제공 자료',url:PKNU_PROGRAM_URL,state:'provided',is_snapshot:true,count:provided.length,checked_at:null,imported_at:provided[0].imported_at,pages_detail:[]});
 return json({school_id:school,items,sources,provided_count:provided.length,generated_at:new Date().toISOString(),cache_seconds:TTL,total_listed:pages.reduce((n,p)=>n+p.listed,0),coverage:selectedSources.map(s=>s.name+' 최근 '+s.pages+'페이지').join(' · '),live:sources.filter(s=>!s.is_snapshot).every(s=>s.state==='live')});
}
export default {async fetch(request,env,ctx){
 const path=new URL(request.url).pathname;
 if(path.startsWith('/api/')&&path!=='/api/activities')return demandApi(request,env);
 if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405,headers:{Allow:'GET, HEAD'}});
 if(path==='/api/activities'){try{return await feed(request,env,ctx)}catch{return json({error:'소식을 불러오지 못했습니다. 잠시 후 다시 시도하세요.'},503)}}
 if(path==='/'||path==='/index.html')return new Response(request.method==='HEAD'?null:HTML,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin'}});
 if(path==='/health')return json({ok:true,version:2});
 return new Response('Not found',{status:404});
}};
