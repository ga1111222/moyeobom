const SCHOOLS=[{id:'ks',name:'경성대학교',live:true},{id:'pknu',name:'국립부경대학교',live:true},{id:'tongmyong',name:'동명대학교',live:true}];
const UNION_COLLECTION={id:'namgu-union',name:'부산 남구 대학 연합 행사',is_collection:true};
const apiError=(message,status=400)=>Object.assign(new Error(message),{status});
const schoolId=v=>{if(![...SCHOOLS,UNION_COLLECTION].some(s=>s.id===v))throw apiError('학교를 선택해주세요.');return v};
const textValue=(v,min,max,name)=>{if(typeof v!=='string'||v.trim().length<min||v.trim().length>max)throw apiError(name+'을(를) '+min+'~'+max+'자로 입력해주세요.');return v.trim()};
const normalizedTopic=v=>textValue(v,2,60,'관심 주제').normalize('NFKC').replace(/\s+/g,' ').toLowerCase();
function isPlanner(request,env){const email=request.headers.get('oai-authenticated-user-email');return Boolean(email&&env.PLANNER_EMAIL&&email.toLowerCase()===env.PLANNER_EMAIL.toLowerCase())}
async function identity(request){const existing=request.headers.get('cookie')?.match(/(?:^|;\s*)campus_actor=([a-f0-9]{32})(?:;|$)/)?.[1];const raw=existing||crypto.randomUUID().replace(/-/g,'');const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw));return {actor:[...new Uint8Array(hash)].map(n=>n.toString(16).padStart(2,'0')).join(''),cookie:existing?null:`campus_actor=${raw}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`}}
async function bodyJson(request){if(request.headers.get('origin')!==new URL(request.url).origin)throw apiError('이 앱에서 다시 시도해주세요.',403);if(!request.headers.get('content-type')?.includes('application/json'))throw apiError('JSON 요청이 필요합니다.',415);const raw=await request.text();if(raw.length>8000)throw apiError('입력 내용이 너무 깁니다.',413);try{return JSON.parse(raw)}catch{throw apiError('입력 형식을 확인해주세요.')}}
const rows=async(stmt)=>(await stmt.all()).results||[];
async function topicSummary(db,school){return rows(db.prepare("SELECT topic, COUNT(DISTINCT actor_id) AS browsers, SUM(CASE WHEN kind='search' THEN 1 ELSE 0 END) AS searches, SUM(CASE WHEN kind='wish' THEN 1 ELSE 0 END) AS wishes FROM demand_signals WHERE school_id=? AND updated_at>=datetime('now','-90 days') GROUP BY topic ORDER BY wishes DESC, browsers DESC, searches DESC LIMIT 30").bind(school))}
function publicSurvey(row){const {created_by,options_json,...rest}=row;return {...rest,options:JSON.parse(options_json)}}
async function demandApi(request,env){
 const url=new URL(request.url),path=url.pathname;const id=await identity(request);let out;
 const respond=(v,status=200)=>{const r=json(v,status);if(id.cookie)r.headers.set('Set-Cookie',id.cookie);return r};
 try{
 if(path==='/api/me'){if(request.method!=='GET')throw apiError('지원하지 않는 요청입니다.',405);return respond({planner:isPlanner(request,env),signed_in:Boolean(request.headers.get('oai-authenticated-user-id')),schools:SCHOOLS,collections:[UNION_COLLECTION]})}
 if(!env.DB)throw apiError('수요·설문 저장소 연결을 준비하고 있습니다. 잠시 후 다시 시도해주세요.',503);
 if(path.startsWith('/api/planner/')&&!isPlanner(request,env))throw apiError('설문 발행 권한이 있는 담당자로 로그인해주세요.',403);
 if(path==='/api/demand'&&request.method==='GET'){
  const school=schoolId(url.searchParams.get('school'));return respond({topics:await topicSummary(env.DB,school),window_days:90,counting:'브라우저 기준, 같은 주제의 중복 검색·관심 등록은 각각 1회 집계'});
 }
 if(path==='/api/signals'&&request.method==='POST'){
  const b=await bodyJson(request),school=schoolId(b.school),topic=normalizedTopic(b.topic);if(!['search','wish'].includes(b.kind))throw apiError('관심 등록 유형을 확인해주세요.');
  const current=await env.DB.prepare('SELECT id FROM demand_signals WHERE school_id=? AND actor_id=? AND topic=? AND kind=?').bind(school,id.actor,topic,b.kind).first();
  if(!current){const n=await env.DB.prepare("SELECT COUNT(*) AS n FROM demand_signals WHERE actor_id=? AND created_at>=datetime('now','-1 day')").bind(id.actor).first();if(n.n>=40)throw apiError('오늘 등록 가능한 주제 수를 초과했습니다.',429)}
  await env.DB.prepare('INSERT INTO demand_signals (id,school_id,actor_id,topic,kind) VALUES (?,?,?,?,?) ON CONFLICT(school_id,actor_id,topic,kind) DO UPDATE SET updated_at=CURRENT_TIMESTAMP').bind(crypto.randomUUID(),school,id.actor,topic,b.kind).run();return respond({saved:true,topic});
 }
 if(path==='/api/surveys'&&request.method==='GET'){
  const school=schoolId(url.searchParams.get('school'));const results=await rows(env.DB.prepare("SELECT s.*,r.choice AS my_choice,r.note AS my_note FROM planning_surveys s LEFT JOIN survey_responses r ON s.id=r.survey_id AND r.actor_id=? WHERE s.school_id=? AND s.status='published' AND s.closes_at>? ORDER BY s.created_at DESC").bind(id.actor,school,new Date().toISOString()));return respond({surveys:results.map(publicSurvey)});
 }
 if(path==='/api/responses'&&request.method==='POST'){
  const b=await bodyJson(request),survey=await env.DB.prepare('SELECT * FROM planning_surveys WHERE id=?').bind(textValue(b.survey_id,1,80,'설문 ID')).first();if(!survey||survey.status!=='published'||survey.closes_at<=new Date().toISOString())throw apiError('응답 가능한 설문이 아닙니다.',409);
  const choices=JSON.parse(survey.options_json);if(!Number.isInteger(b.choice)||b.choice<0||b.choice>=choices.length)throw apiError('응답을 선택해주세요.');const note=typeof b.note==='string'?b.note.trim():'';if(note.length>200)throw apiError('제안은 200자 이내로 작성해주세요.');await env.DB.prepare('INSERT INTO survey_responses(survey_id,actor_id,choice,note) VALUES(?,?,?,?) ON CONFLICT(survey_id,actor_id) DO UPDATE SET choice=excluded.choice,note=excluded.note,updated_at=CURRENT_TIMESTAMP').bind(survey.id,id.actor,b.choice,note).run();return respond({saved:true});
 }
 if(path==='/api/planner/overview'&&request.method==='GET'){
  const school=schoolId(url.searchParams.get('school'));const surveys=await rows(env.DB.prepare('SELECT s.*,COUNT(r.actor_id) AS response_count FROM planning_surveys s LEFT JOIN survey_responses r ON r.survey_id=s.id WHERE s.school_id=? GROUP BY s.id ORDER BY s.created_at DESC').bind(school));const results=[];for(const s of surveys){const votes=await rows(env.DB.prepare('SELECT choice,COUNT(*) AS n FROM survey_responses WHERE survey_id=? GROUP BY choice').bind(s.id));const notes=await rows(env.DB.prepare("SELECT note,updated_at FROM survey_responses WHERE survey_id=? AND note<>'' ORDER BY updated_at DESC LIMIT 30").bind(s.id));results.push({...publicSurvey(s),votes,notes})}return respond({topics:await topicSummary(env.DB,school),surveys:results});
 }
 if(path==='/api/planner/surveys'&&request.method==='POST'){
  const b=await bodyJson(request),school=schoolId(b.school),title=textValue(b.title,3,100,'설문 제목'),description=textValue(b.description,5,1000,'기획 내용'),topic=normalizedTopic(b.topic);if(!Array.isArray(b.options)||b.options.length<2||b.options.length>8)throw apiError('선택지를 2~8개 입력해주세요.');const options=b.options.map(o=>textValue(o,1,80,'선택지'));if(new Set(options).size!==options.length)throw apiError('중복 선택지를 제거해주세요.');const close=new Date(b.closes_at);if(!Number.isFinite(close.getTime())||close.getTime()<Date.now()+60000||close.getTime()>Date.now()+366*864e5)throw apiError('설문 종료일을 1분 이후부터 1년 이내로 지정해주세요.');const sid=crypto.randomUUID();await env.DB.prepare('INSERT INTO planning_surveys(id,school_id,title,description,topic,options_json,closes_at,created_by) VALUES(?,?,?,?,?,?,?,?)').bind(sid,school,title,description,topic,JSON.stringify(options),close.toISOString(),request.headers.get('oai-authenticated-user-id')||'authorized-planner').run();return respond({id:sid,status:'draft'},201);
 }
 if(path==='/api/planner/status'&&request.method==='POST'){
  const b=await bodyJson(request);if(!['published','closed'].includes(b.status))throw apiError('설문 상태를 확인해주세요.');const s=await env.DB.prepare('SELECT * FROM planning_surveys WHERE id=?').bind(textValue(b.id,1,80,'설문 ID')).first();if(!s)throw apiError('설문을 찾을 수 없습니다.',404);if(b.status==='published'&&(s.status!=='draft'||s.closes_at<=new Date().toISOString()))throw apiError('발행 가능한 초안이 아닙니다.',409);await env.DB.prepare('UPDATE planning_surveys SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(b.status,b.id).run();return respond({id:b.id,status:b.status});
 }
 throw apiError('요청 경로를 찾을 수 없습니다.',404);
 }catch(e){if(!e.status)console.error('demand_api_failed',path,e.message);return respond({error:e.status?e.message:'데이터를 처리하지 못했습니다. 잠시 후 다시 시도해주세요.'},e.status||503)}
}
