const SCHOOLS=[{id:'ks',name:'경성대학교',live:true},{id:'pknu',name:'국립부경대학교',live:true},{id:'tongmyong',name:'동명대학교',live:true}];
const UNION_COLLECTION={id:'namgu-union',name:'부산 남구 대학 연합 행사',is_collection:true};
const apiError=(message,status=400)=>Object.assign(new Error(message),{status});
const schoolId=v=>{if(![...SCHOOLS,UNION_COLLECTION].some(s=>s.id===v))throw apiError('학교를 선택해주세요.');return v};
const textValue=(v,min,max,name)=>{if(typeof v!=='string'||v.trim().length<min||v.trim().length>max)throw apiError(name+'을(를) '+min+'~'+max+'자로 입력해주세요.');return v.trim()};
const normalizedTopic=v=>textValue(v,2,60,'관심 주제').normalize('NFKC').replace(/\s+/g,' ').toLowerCase();
async function plannerSessionToken(env){
 const id=env?.PLANNER_ID||'admin',pw=env?.PLANNER_PASSWORD||'0000',salt=env?.GROQ_API_KEY||'moyeobom-local';
 const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(id+':'+pw+':'+salt));
 return [...new Uint8Array(hash)].map(n=>n.toString(16).padStart(2,'0')).join('');
}
async function isPlanner(request,env){
 const email=request.headers.get('oai-authenticated-user-email');
 if(email&&env?.PLANNER_EMAIL&&email.toLowerCase()===env.PLANNER_EMAIL.toLowerCase())return true;
 const token=request.headers.get('cookie')?.match(/(?:^|;\s*)planner_session=([a-f0-9]{64})(?:;|$)/)?.[1];
 if(!token)return false;
 return token===(await plannerSessionToken(env));
}
async function identity(request){const existing=request.headers.get('cookie')?.match(/(?:^|;\s*)campus_actor=([a-f0-9]{32})(?:;|$)/)?.[1];const raw=existing||crypto.randomUUID().replace(/-/g,'');const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw));return {actor:[...new Uint8Array(hash)].map(n=>n.toString(16).padStart(2,'0')).join(''),cookie:existing?null:`campus_actor=${raw}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`}}
async function bodyJson(request){if(request.headers.get('origin')!==new URL(request.url).origin)throw apiError('이 앱에서 다시 시도해주세요.',403);if(!request.headers.get('content-type')?.includes('application/json'))throw apiError('JSON 요청이 필요합니다.',415);const raw=await request.text();if(raw.length>8000)throw apiError('입력 내용이 너무 깁니다.',413);try{return JSON.parse(raw)}catch{throw apiError('입력 형식을 확인해주세요.')}}
const rows=async(stmt)=>(await stmt.all()).results||[];
async function topicSummary(db,school){return rows(db.prepare("SELECT topic, COUNT(DISTINCT actor_id) AS browsers, SUM(CASE WHEN kind='search' THEN 1 ELSE 0 END) AS searches, SUM(CASE WHEN kind='wish' THEN 1 ELSE 0 END) AS wishes FROM demand_signals WHERE school_id=? AND updated_at>=datetime('now','-90 days') GROUP BY topic ORDER BY wishes DESC, browsers DESC, searches DESC LIMIT 30").bind(school))}
function publicSurvey(row){const {created_by,options_json,...rest}=row;return {...rest,options:JSON.parse(options_json)}}
async function ensureDefaultSurveys(db){
 const c=await db.prepare('SELECT COUNT(*) AS n FROM planning_surveys').first();
 if((c?.n||0)>0)return;
 const closes=new Date(Date.now()+14*864e5).toISOString();
 const defaults=[
  ['ks','AI 포트폴리오·실무 특강 사전 수요조사','시험 기간 이후 진행할 실무 특강 수요를 파악합니다. 비전공자도 참여 가능한 실습 위주 구성을 검토 중입니다.','생성형 ai 포트폴리오'],
  ['pknu','현직자 멘토링·자소서 실전 워크숍 수요조사','방학 전 취·창업 집중 기간에 맞춘 직무별 현직자 멘토링과 자소서 첨삭 특강 수요를 확인합니다.','자소서·면접 실전 특강'],
  ['tongmyong','로컬·AI 프로젝트 미니 해커톤 사전 수요조사','학생들이 팀을 이뤄 주말 1박 2일 또는 원데이로 진행하는 실전 미니 해커톤 참여 의향을 조사합니다.','로컬 프로젝트 해커톤'],
  ['namgu-union','부산 남구 3개 대학 연합 네트워킹 데이 수요조사','경성대·국립부경대·동명대 학생이 함께 참여하는 연합 네트워킹 및 팀 빌딩 행사 기획안을 준비 중입니다.','남구 대학 연합 네트워킹']
 ];
 const opts=JSON.stringify(['참여하고 싶어요','일정이 맞으면 참여하고 싶어요','관심이 없어요']);
 for(const [school,title,desc,topic] of defaults){
  await db.prepare('INSERT OR IGNORE INTO planning_surveys (id,school_id,title,description,topic,options_json,status,closes_at,created_by) VALUES (?,?,?,?,?,?,?,?,?)').bind('sample-survey-'+school,school,title,desc,topic,opts,'published',closes,'system-sample').run();
 }
}
async function demandApi(request,env){
 const url=new URL(request.url),path=url.pathname;const id=await identity(request);let out;
 const respond=(v,status=200)=>{const r=json(v,status);if(id.cookie)r.headers.set('Set-Cookie',id.cookie);return r};
 try{
 if(path==='/api/me'){if(request.method!=='GET')throw apiError('지원하지 않는 요청입니다.',405);return respond({planner:await isPlanner(request,env),signed_in:Boolean(request.headers.get('oai-authenticated-user-id')),schools:SCHOOLS,collections:[UNION_COLLECTION]})}
 if(path==='/api/planner-login'&&request.method==='POST'){
  const b=await bodyJson(request),idInput=textValue(b.id,1,50,'아이디'),pwInput=textValue(b.password,1,100,'비밀번호');
  const expectedId=env?.PLANNER_ID||'admin',expectedPw=env?.PLANNER_PASSWORD||'0000';
  if(idInput!==expectedId||pwInput!==expectedPw)throw apiError('아이디 또는 비밀번호가 올바르지 않습니다.',401);
  const tok=await plannerSessionToken(env),r=respond({ok:true,planner:true});
  r.headers.append('Set-Cookie',`planner_session=${tok}; Path=/; Max-Age=86400; HttpOnly; Secure; SameSite=Lax`);
  return r;
 }
 if(path==='/api/planner-logout'&&request.method==='POST'){
  const r=respond({ok:true,planner:false});
  r.headers.append('Set-Cookie','planner_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax');
  return r;
 }
 if(!env.DB)throw apiError('수요·설문 저장소 연결을 준비하고 있습니다. 잠시 후 다시 시도해주세요.',503);
 if(path.startsWith('/api/planner/')&&!(await isPlanner(request,env)))throw apiError('설문 발행 권한이 있는 담당자로 로그인해주세요.',403);
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
  const school=schoolId(url.searchParams.get('school'));await ensureDefaultSurveys(env.DB);const results=await rows(env.DB.prepare("SELECT s.*,r.choice AS my_choice,r.note AS my_note FROM planning_surveys s LEFT JOIN survey_responses r ON s.id=r.survey_id AND r.actor_id=? WHERE s.school_id=? AND s.status='published' AND s.closes_at>? ORDER BY s.created_at DESC").bind(id.actor,school,new Date().toISOString()));return respond({surveys:results.map(publicSurvey)});
 }
 if(path==='/api/responses'&&request.method==='POST'){
  const b=await bodyJson(request),survey=await env.DB.prepare('SELECT * FROM planning_surveys WHERE id=?').bind(textValue(b.survey_id,1,80,'설문 ID')).first();if(!survey||survey.status!=='published'||survey.closes_at<=new Date().toISOString())throw apiError('응답 가능한 설문이 아닙니다.',409);
  const existingResp=await env.DB.prepare('SELECT 1 AS ok FROM survey_responses WHERE survey_id=? AND actor_id=?').bind(survey.id,id.actor).first();if(existingResp)throw apiError('이미 참여 완료한 설문입니다. 응답은 수정할 수 없습니다.',409);
  const choices=JSON.parse(survey.options_json);if(!Number.isInteger(b.choice)||b.choice<0||b.choice>=choices.length)throw apiError('응답을 선택해주세요.');const note=typeof b.note==='string'?b.note.trim():'';if(note.length>200)throw apiError('제안은 200자 이내로 작성해주세요.');await env.DB.prepare('INSERT INTO survey_responses(survey_id,actor_id,choice,note) VALUES(?,?,?,?)').bind(survey.id,id.actor,b.choice,note).run();return respond({saved:true});
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
 if(path==='/api/planner/seed-demo'&&request.method==='POST'){
  const b=await bodyJson(request),school=schoolId(b.school);
  const demoTopics=[['생성형 ai 포트폴리오',7,4],['자소서·면접 실전 특강',6,3],['부산 기업 직무 박람회',5,3],['데이터 분석 기초 부트캠프',4,2],['남구 대학 연합 해커톤',4,2]];
  for(const [topic,wishes,searches] of demoTopics){
   for(let i=1;i<=wishes;i++)await env.DB.prepare('INSERT INTO demand_signals (id,school_id,actor_id,topic,kind) VALUES (?,?,?,?,?) ON CONFLICT(school_id,actor_id,topic,kind) DO UPDATE SET updated_at=CURRENT_TIMESTAMP').bind(crypto.randomUUID(),school,'demo-wish-'+i,topic,'wish').run();
   for(let i=1;i<=searches;i++)await env.DB.prepare('INSERT INTO demand_signals (id,school_id,actor_id,topic,kind) VALUES (?,?,?,?,?) ON CONFLICT(school_id,actor_id,topic,kind) DO UPDATE SET updated_at=CURRENT_TIMESTAMP').bind(crypto.randomUUID(),school,'demo-search-'+i,topic,'search').run();
  }
  const sid='demo-survey-'+school,closes=new Date(Date.now()+7*864e5).toISOString();
  await env.DB.prepare('INSERT OR IGNORE INTO planning_surveys (id,school_id,title,description,topic,options_json,status,closes_at,created_by) VALUES (?,?,?,?,?,?,?,?,?)').bind(sid,school,'AI 포트폴리오·실무 특강 사전 수요조사','시험 기간 이후 진행할 실무 특강 수요를 파악합니다.','생성형 ai 포트폴리오',JSON.stringify(['참여하고 싶어요','일정이 맞으면 참여하고 싶어요','관심이 없어요']),'published',closes,'demo-seed').run();
  const demoNotes=[[0,'목요일 저녁 6시 이후나 금요일 오후가 좋겠어요.'],[0,'비전공자도 들을 수 있게 기초부터 다뤄주면 좋겠습니다.'],[1,'부산 지역 IT 기업 현직자 멘토링도 같이 있으면 좋겠어요.'],[0,'수료증이나 비교과 마일리지 연계되면 꼭 신청할게요.']];
  for(let i=0;i<demoNotes.length;i++){
   await env.DB.prepare('INSERT OR IGNORE INTO survey_responses (survey_id,actor_id,choice,note) VALUES (?,?,?,?)').bind(sid,'demo-resp-'+(i+1),demoNotes[i][0],demoNotes[i][1]).run();
  }
  return respond({seeded:true});
 }
 throw apiError('요청 경로를 찾을 수 없습니다.',404);
 }catch(e){if(!e.status)console.error('demand_api_failed',path,e.message);return respond({error:e.status?e.message:'데이터를 처리하지 못했습니다. 잠시 후 다시 시도해주세요.'},e.status||503)}
}
