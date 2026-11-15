const GROQ_URL='https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_GROQ_MODEL='openai/gpt-oss-20b';

function extractJson(text=''){
 const trimmed=String(text||'').trim();
 if(!trimmed)throw apiError('AI 응답이 비어 있습니다. 다시 시도해주세요.',502);
 const fenced=trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
 const candidate=(fenced?fenced[1]:trimmed).trim();
 try{return JSON.parse(candidate)}catch{}
 const start=candidate.indexOf('{'),end=candidate.lastIndexOf('}');
 if(start!==-1&&end>start){
  try{return JSON.parse(candidate.slice(start,end+1))}catch{}
 }
 throw apiError('AI 응답 형식을 해석하지 못했습니다. 다시 시도해주세요.',502);
}

async function callGroq(env,messages,{maxTokens=1400,temperature=0.4}={}){
 const apiKey=env?.GROQ_API_KEY;
 if(!apiKey)throw apiError('AI 기능 설정(GROQ_API_KEY)이 필요합니다. 환경 변수를 설정해주세요.',503);
 const model=env?.GROQ_MODEL||DEFAULT_GROQ_MODEL;
 const res=await fetch(GROQ_URL,{
  method:'POST',
  headers:{'Authorization':'Bearer '+apiKey,'Content-Type':'application/json'},
  body:JSON.stringify({model,messages,max_completion_tokens:maxTokens,reasoning_effort:'low',temperature}),
  signal:AbortSignal.timeout(25000)
 });
 if(!res.ok){
  if(res.status===429)throw apiError('AI 요청이 많아 잠시 후 다시 시도해주세요.',429);
  if(res.status===401||res.status===403)throw apiError('AI API 인증에 실패했습니다. 키 설정을 확인해주세요.',502);
  throw apiError('AI 서비스 응답 오류가 발생했습니다. ('+res.status+')',502);
 }
 const payload=await res.json();
 const content=payload?.choices?.[0]?.message?.content;
 if(!content)throw apiError('AI 응답을 생성하지 못했습니다. 다시 시도해주세요.',502);
 return content;
}

function selectRelevantItems(items,queryText='',limit=24){
 const tokens=[...new Set(String(queryText||'').toLowerCase().split(/[\s,./·\-()]+/).map(t=>t.trim()).filter(t=>t.length>=2))];
 const scored=items.map((item,idx)=>{
  const hay=[item.title,item.category,item.scope,item.department,item.summary,item.target,item.source].filter(Boolean).join(' ').toLowerCase();
  let score=item.featured?4:0;
  for(const t of tokens){if(hay.includes(t))score+=3}
  if(!item.is_snapshot&&!item.is_union_event)score+=1;
  return {item,score,idx};
 });
 scored.sort((a,b)=>b.score-a.score||a.idx-b.idx);
 return scored.slice(0,limit).map(({item})=>({
  id:item.id,
  title:item.title,
  category:item.category,
  scope:item.scope,
  date:item.date,
  source:item.source,
  department:item.department||undefined,
  recruitment_end:item.recruitment_end||undefined,
  operation_start:item.operation_start||undefined,
  operation_end:item.operation_end||undefined,
  summary:item.summary?String(item.summary).slice(0,120):undefined
 }));
}

async function loadSchoolItems(school,origin,env,ctx){
 const res=await feed(new Request(origin+'/api/activities?school='+encodeURIComponent(school)),env,ctx);
 if(!res.ok)throw apiError('프로그램 목록을 불러오지 못했습니다.',503);
 const data=await res.json();
 return Array.isArray(data.items)?data.items:[];
}

async function aiApi(request,env,ctx){
 const url=new URL(request.url),path=url.pathname,origin=url.origin;
 const id=await identity(request);
 const respond=(v,status=200)=>{const r=json(v,status);if(id.cookie)r.headers.set('Set-Cookie',id.cookie);return r};
 try{
  if(request.method!=='POST')throw apiError('지원하지 않는 요청입니다.',405);

  if(path==='/api/ai/recommend'){
   const b=await bodyJson(request);
   const school=schoolId(b.school);
   const major=typeof b.major==='string'?b.major.trim().slice(0,50):'';
   const grade=typeof b.grade==='string'?b.grade.trim().slice(0,20):'';
   const interests=textValue(b.interests||b.goal||'',2,120,'관심 분야');
   const goal=typeof b.goal==='string'?b.goal.trim().slice(0,80):'';
   const items=await loadSchoolItems(school,origin,env,ctx);
   if(!items.length)return respond({summary:'현재 등록된 프로그램이 없어 추천할 항목이 없습니다.',recommendations:[]});
   const candidates=selectRelevantItems(items,[major,grade,interests,goal].join(' '),24);
   const raw=await callGroq(env,[
    {role:'system',content:'너는 부산 남구 대학생(경성대, 국립부경대, 동명대)을 위한 비교과·교내외 행사 추천 도우미 "모여봄 AI"다. 반드시 제공된 후보 목록의 id만 사용하여 JSON으로만 응답해라.'},
    {role:'user',content:JSON.stringify({
     student:{school:schoolNameForAi(school),major:major||'미입력',grade:grade||'미입력',interests,goal:goal||'미입력'},
     candidates,
     output_format:{summary:'학생 상황에 맞춘 한 줄 추천 요약 (한국어)',recommendations:[{id:'후보 목록의 정확한 id',reason:'왜 이 학생에게 맞는지 1~2문장',match_tags:['핵심 태그 1~2개']}]}
    })}
   ],{maxTokens:1200,temperature:0.3});
   const parsed=extractJson(raw);
   const byId=new Map(items.map(i=>[i.id,i]));
   const recs=(Array.isArray(parsed.recommendations)?parsed.recommendations:[])
    .map(r=>{const item=byId.get(r?.id);return item?{id:item.id,reason:String(r.reason||'관심 분야와 잘 맞는 활동입니다.'),match_tags:Array.isArray(r.match_tags)?r.match_tags.slice(0,3).map(String):[],item}:null})
    .filter(Boolean).slice(0,5);
   return respond({summary:String(parsed.summary||'입력하신 관심 분야에 맞는 활동을 골랐습니다.'),recommendations:recs});
  }

  if(path==='/api/ai/chat'){
   const b=await bodyJson(request);
   const school=schoolId(b.school);
   const message=textValue(b.message,1,400,'질문 내용');
   const history=Array.isArray(b.history)?b.history.slice(-6).filter(h=>h&&['user','assistant'].includes(h.role)&&typeof h.content==='string').map(h=>({role:h.role,content:h.content.slice(0,300)})):[];
   const items=await loadSchoolItems(school,origin,env,ctx);
   const queryContext=[message,...history.filter(h=>h.role==='user').map(h=>h.content)].join(' ');
   const candidates=selectRelevantItems(items,queryContext,20);
   const schoolLabel=schoolNameForAi(school);
   const raw=await callGroq(env,[
    {role:'system',content:`너는 "${schoolLabel}" 전용 프로그램 안내 AI 챗봇이다. 반드시 현재 선택된 "${schoolLabel}"의 제공된 프로그램 목록(candidates) 안에서만 사실대로 답변하고, 다른 학교의 행사나 없는 링크를 지어내지 마라. 반드시 JSON으로만 답해라: {"reply":"친절하고 간결한 한국어 답변","recommended_ids":["관련 프로그램 id 최대 3개"],"follow_ups":["후속 질문 2개"]}`},
    ...history,
    {role:'user',content:JSON.stringify({school:schoolLabel,question:message,candidates})}
   ],{maxTokens:1200,temperature:0.4});
   const parsed=extractJson(raw);
   const byId=new Map(items.map(i=>[i.id,i]));
   const programs=(Array.isArray(parsed.recommended_ids)?parsed.recommended_ids:[]).map(pid=>byId.get(pid)).filter(Boolean).slice(0,3);
   const follow_ups=Array.isArray(parsed.follow_ups)?parsed.follow_ups.slice(0,2).map(x=>String(x).slice(0,50)):[];
   return respond({reply:String(parsed.reply||'관련 프로그램을 확인해 보았습니다.'),programs,follow_ups});
  }

  if(path==='/api/ai/planner-insights'){
   if(!(await isPlanner(request,env)))throw apiError('설문 발행 권한이 있는 담당자로 로그인해주세요.',403);
   if(!env.DB)throw apiError('수요·설문 저장소 연결을 준비하고 있습니다. 잠시 후 다시 시도해주세요.',503);
   const b=await bodyJson(request);
   const school=schoolId(b.school);
   const topics=await topicSummary(env.DB,school);
   const surveys=await rows(env.DB.prepare('SELECT id,title,topic,status FROM planning_surveys WHERE school_id=? ORDER BY created_at DESC LIMIT 10').bind(school));
   const notes=await rows(env.DB.prepare("SELECT r.note,s.topic FROM survey_responses r JOIN planning_surveys s ON s.id=r.survey_id WHERE s.school_id=? AND r.note<>'' ORDER BY r.updated_at DESC LIMIT 30").bind(school));
   if(!topics.length&&!notes.length){
    return respond({
     overview:'아직 집계된 검색·관심 수요나 학생 의견이 없습니다. 학생들의 수요가 모이면 AI가 카테고리별 분석과 프로그램 기획안을 제안해 드립니다.',
     categories:[],
     proposals:[]
    });
   }
   const raw=await callGroq(env,[
    {role:'system',content:'너는 대학 비교과·청년 교육 프로그램 기획자를 돕는 "모여봄 AI 수요 분석가"다. 학생들의 검색/관심 주제와 설문 주관식 의견을 분석해 카테고리별로 묶고, 바로 설문으로 만들 수 있는 프로그램 기획안 2~3개를 JSON으로 제안해라.'},
    {role:'user',content:JSON.stringify({
     school:schoolNameForAi(school),
     demand_topics:topics.slice(0,20),
     existing_surveys:surveys,
     student_notes:notes,
     output_format:{
      overview:'전체 수요 흐름 요약 (2~3문장)',
      categories:[{name:'카테고리명',demand_level:'높음 또는 보통',topics:['관련 주제들'],insight:'수요 해석 1문장'}],
      proposals:[{title:'추천 프로그램명',target:'추천 대상',summary:'프로그램 구성 및 핵심 내용',expected_effect:'기대 효과',survey_draft:{topic:'기획 주제(2~40자)',title:'설문 제목(예: ~ 관심 있으신가요?)',description:'설문 설명(20~200자)',options:['참여하고 싶어요','일정이 맞으면 참여하고 싶어요','관심이 없어요']}}]
     }
    })}
   ],{maxTokens:1600,temperature:0.4});
   const parsed=extractJson(raw);
   return respond({
    overview:String(parsed.overview||'수요 분석 결과를 정리했습니다.'),
    categories:Array.isArray(parsed.categories)?parsed.categories.slice(0,5):[],
    proposals:Array.isArray(parsed.proposals)?parsed.proposals.slice(0,3):[]
   });
  }

  if(path==='/api/ai/topic-plan'){
   if(!(await isPlanner(request,env)))throw apiError('설문 발행 권한이 있는 담당자로 로그인해주세요.',403);
   const b=await bodyJson(request),school=schoolId(b.school),topic=textValue(b.topic,1,80,'기획 주제');
   const stats=b.stats&&typeof b.stats==='object'?b.stats:{};
   const notes=Array.isArray(b.notes)?b.notes.slice(0,15).map(n=>String(n).slice(0,200)):[];
   const items=await loadSchoolItems(school,origin,env,ctx);
   const related=selectRelevantItems(items,topic,8);
   const raw=await callGroq(env,[
    {role:'system',content:'너는 대학 비교과·청년 교육 프로그램 기획서를 작성하는 "모여봄 AI 기획 도우미"다. 주어진 주제, 수요 수치, 학생 의견, 참고 프로그램을 바탕으로 인쇄용 프로그램 기획안을 JSON으로 작성해라.'},
    {role:'user',content:JSON.stringify({
     school:schoolNameForAi(school),topic,stats,student_notes:notes,related_programs:related.map(r=>({title:r.title,category:r.category,date:r.date})),
     output_format:{
      program_title:'공식 프로그램명(안)',
      background:'추진 배경 및 필요성 (2~3문장)',
      target:'추천 참여 대상',
      curriculum:['1차시/단계 내용','2차시/단계 내용','3차시/단계 내용'],
      expected_effect:'기대 효과 (1~2문장)',
      survey_description:'사전 설문용 1~2문장 설명'
     }
    })}
   ],{maxTokens:1200,temperature:0.4});
   const parsed=extractJson(raw);
   return respond({
    program_title:String(parsed.program_title||topic+' 프로그램'),
    background:String(parsed.background||''),
    target:String(parsed.target||'재학생 전체'),
    curriculum:Array.isArray(parsed.curriculum)?parsed.curriculum.slice(0,5).map(String):[],
    expected_effect:String(parsed.expected_effect||''),
    survey_description:String(parsed.survey_description||''),
    related_programs:related.slice(0,4)
   });
  }

  throw apiError('요청 경로를 찾을 수 없습니다.',404);
 }catch(e){
  if(!e.status)console.error('ai_api_failed',path,e.message);
  return respond({error:e.status?e.message:'AI 요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.'},e.status||503);
 }
}

function schoolNameForAi(id){
 return [...SCHOOLS,UNION_COLLECTION].find(s=>s.id===id)?.name||id;
}
