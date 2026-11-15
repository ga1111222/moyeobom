import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker from '../dist/server/index.js';

const sqlite=new DatabaseSync(':memory:');
sqlite.exec(readFileSync('drizzle/0000_demand_surveys.sql','utf8'));
const DB={prepare(sql){const statement=sqlite.prepare(sql);let values=[];const q={bind(...v){values=v;return q},async first(){return statement.get(...values)||null},async all(){return {results:statement.all(...values)}},async run(){return statement.run(...values)}};return q}};

const makeReq=(path,body,planner=false)=>new Request('https://test.example'+path,{
 method:'POST',
 headers:{
  Cookie:'campus_actor=0123456789abcdef0123456789abcdef',
  Origin:'https://test.example',
  'Content-Type':'application/json',
  ...(planner?{'oai-authenticated-user-email':'planner@test.example','oai-authenticated-user-id':'planner-id'}:{})
 },
 body:JSON.stringify(body)
});

test('AI endpoints reject missing GROQ_API_KEY and unauthorized planner insights',async()=>{
 const envNoKey={DB,PLANNER_EMAIL:'planner@test.example'};
 const r1=await worker.fetch(makeReq('/api/ai/recommend',{school:'namgu-union',interests:'공모전'}),envNoKey);
 assert.equal(r1.status,503);
 const r2=await worker.fetch(makeReq('/api/ai/planner-insights',{school:'ks'}),{...envNoKey,GROQ_API_KEY:'test-key'});
 assert.equal(r2.status,403);
});

test('AI recommend, chat, and planner-insights parse Groq JSON and hydrate items',async()=>{
 const origFetch=globalThis.fetch;
 globalThis.fetch=async(url,opts)=>{
  assert.equal(String(url),'https://api.groq.com/openai/v1/chat/completions');
  const body=JSON.parse(opts.body);
  const userContent=body.messages[body.messages.length-1].content;
  if(userContent.includes('"demand_topics"')){
   return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({
    overview:'AI 실습 수요가 가장 높습니다.',
    categories:[{name:'AI·데이터',demand_level:'높음',topics:['ai 실습'],insight:'실무 중심 교육 희망'}],
    proposals:[{title:'생성형 AI 포트폴리오 워크숍',target:'전공 무관 재학생',summary:'실습 위주 2시간 특강',expected_effect:'참여율 상승',survey_draft:{topic:'생성형 AI 실습',title:'생성형 AI 워크숍 관심 있으신가요?',description:'실습 중심 특강을 준비 중입니다.',options:['참여하고 싶어요','보통이에요']}}]
   })}}]}),{status:200,headers:{'Content-Type':'application/json'}});
  }
  if(userContent.includes('"question"')){
   return new Response(JSON.stringify({choices:[{message:{content:'```json\n{"reply":"부산 지산학 혁신대전 공모전을 추천합니다.","recommended_ids":["union:bix-2026"],"follow_ups":["일정이 어떻게 되나요?"]}\n```'}}]}),{status:200,headers:{'Content-Type':'application/json'}});
  }
  return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({
   summary:'공모전과 창업 프로그램을 추천합니다.',
   recommendations:[{id:'union:bix-2026',reason:'지역 기업과 연계된 실전 공모전입니다.',match_tags:['공모전','지산학']}]
  })}}]}),{status:200,headers:{'Content-Type':'application/json'}});
 };
 try{
  const env={DB,PLANNER_EMAIL:'planner@test.example',GROQ_API_KEY:'test-key'};
  const rec=await worker.fetch(makeReq('/api/ai/recommend',{school:'namgu-union',major:'컴퓨터공학',grade:'3학년',interests:'공모전'}),env);
  assert.equal(rec.status,200);
  const recData=await rec.json();
  assert.equal(recData.recommendations.length,1);
  assert.equal(recData.recommendations[0].item.id,'union:bix-2026');

  const chat=await worker.fetch(makeReq('/api/ai/chat',{school:'namgu-union',message:'공모전 추천해줘'}),env);
  assert.equal(chat.status,200);
  const chatData=await chat.json();
  assert.equal(chatData.programs.length,1);
  assert.equal(chatData.programs[0].id,'union:bix-2026');

  await worker.fetch(makeReq('/api/signals',{school:'ks',topic:'AI 실습',kind:'wish'}),env);
  const ins=await worker.fetch(makeReq('/api/ai/planner-insights',{school:'ks'},true),env);
  assert.equal(ins.status,200);
  const insData=await ins.json();
  assert.equal(insData.categories.length,1);
  assert.equal(insData.proposals.length,1);
  assert.equal(insData.proposals[0].survey_draft.topic,'생성형 AI 실습');

  const badLogin=await worker.fetch(makeReq('/api/planner-login',{id:'admin',password:'wrong'}),env);
  assert.equal(badLogin.status,401);
  const okLogin=await worker.fetch(makeReq('/api/planner-login',{id:'admin',password:'0000'}),env);
  assert.equal(okLogin.status,200);
  const sessionCookie=okLogin.headers.get('set-cookie').match(/planner_session=[a-f0-9]{64}/)?.[0];
  assert.ok(sessionCookie);
  const meAfter=await worker.fetch(new Request('https://test.example/api/me',{headers:{Cookie:sessionCookie}}),env);
  assert.equal((await meAfter.json()).planner,true);
 }finally{
  globalThis.fetch=origFetch;
 }
});
