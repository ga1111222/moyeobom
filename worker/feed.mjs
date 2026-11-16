export const PKNU_PROGRAM_URL='https://pknuai.pknu.ac.kr/web/nonSbjt/program.do?mId=216&rstOk=1&order=3';
export const BASE='https://kscms.ks.ac.kr/kor/CMS/Board/Board.do';
export const SOURCES=[
 {id:'campus',school_id:'ks',name:'교내소식',scope:'교내',code:'MN091',pages:3},
 {id:'outside',school_id:'ks',name:'교외소식',scope:'교외',code:'MN092',pages:3},
 {id:'programs',school_id:'ks',name:'비교과 교육과정',scope:'교내',code:'MN197',pages:2},
 {id:'pknu-notice',school_id:'pknu',name:'국립부경대 공지사항',scope:'교내외',type:'pknu',base:'https://www.pknu.ac.kr/main/163',pages:3},
 {id:'pknu-outside',school_id:'pknu',name:'부경대 공모전·대외활동',scope:'교외',type:'pknu',base:'https://pknujob.pknu.ac.kr/main/43',pages:3},
 {id:'tu-events',school_id:'tongmyong',name:'동명대 행사·모집',scope:'교내외',type:'tu',base:'https://www.tu.ac.kr/tuhome/sub07_01_05.do',pages:3},
 {id:'tu-notice',school_id:'tongmyong',name:'동명대 일반공지',scope:'교내외',type:'tu',base:'https://www.tu.ac.kr/tuhome/sub07_01_01.do',pages:2},
 {id:'tu-volunteer',school_id:'tongmyong',name:'동명대 봉사·대외활동',scope:'교내외',type:'tu',base:'https://www.tu.ac.kr/tuhome/sub07_01_06.do',pages:2},
 {id:'wevity-ks',school_id:'ks',name:'위비티 대학생 공모전·대외활동',scope:'교외',type:'wevity',base:'https://www.wevity.com/?c=find&s=1&gub=2&cidx=5',pages:1},
 {id:'wevity-pknu',school_id:'pknu',name:'위비티 대학생 공모전·대외활동',scope:'교외',type:'wevity',base:'https://www.wevity.com/?c=find&s=1&gub=2&cidx=5',pages:1},
 {id:'wevity-tu',school_id:'tongmyong',name:'위비티 대학생 공모전·대외활동',scope:'교외',type:'wevity',base:'https://www.wevity.com/?c=find&s=1&gub=2&cidx=5',pages:1}
];
export function sourceUrl(source,page=1){const u=new URL(source.base||BASE);if(source.type==='pknu'){u.searchParams.set('pageIndex',String(page))}else if(source.type==='tu'){u.searchParams.set('mode','list');u.searchParams.set('article.offset',String((page-1)*10));u.searchParams.set('articleLimit','10')}else if(source.type==='wevity'){u.searchParams.set('gp',String(page))}else{u.searchParams.set('mCode',source.code);u.searchParams.set('page',String(page));u.searchParams.set('mode','list')}return u}
export function allowedSourceUrl(value){try{const u=new URL(value);return u.protocol==='https:'&&((u.origin==='https://pknuai.pknu.ac.kr'&&u.pathname==='/web/nonSbjt/program.do')||SOURCES.some(s=>{const b=new URL(s.base||BASE);return u.origin===b.origin&&u.pathname===b.pathname}))}catch{return false}}

export function plain(s=''){return s.replace(/<!--[\s\S]*?-->/g,'').replace(/<[^>]*>/g,' ').replace(/&#(x[0-9a-f]+|\d+);/gi,(_,n)=>{const v=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):parseInt(n,10);return v>0&&v<=0x10ffff?String.fromCodePoint(v):''}).replace(/&(amp|lt|gt|quot|apos|nbsp);/g,(_,k)=>({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '})[k]).replace(/\s+/g,' ').trim()}
export function classify(t,source){
 if(/채용공고|채용\s*공고|조교.*채용|계약교수.*채용|면접.*대상자|합격자|병력동원|동원소집|통지서|신입생 모집|수강신청|이수구분 변경|직원|연구원.*채용|교원|신규강사|교수.*초빙|시간제등록|서비스.*중단|안전수칙|행동요령|예방수칙|참여기업|실습기관|불법복제|만족도.*조사|장학금.*조건|충족.*독려|당선작|수상작|선정결과|결과\s*발표|선발\s*공지/.test(t))return null;
 if(/드래프톤|공모|경진|아이디어.*대회|콘테스트|논문.*대회|해커톤|챌린지|경연|Art Award/.test(t))return '공모전·대회';
 if(/봉사|캠프/.test(t))return '봉사·캠프';
 if(/서포터|홍보대사|명예기자|대표단|기자단|모니터링단|체험단|대외활동|디깅클럽|청년.*단/.test(t))return '서포터즈·대외활동';
 if(/봉사|캠프/.test(t))return '봉사·캠프';
 if(/특강|강연|세미나|워크숍|설명회|교육|아카데미|토크|포럼|연수/.test(t))return '특강·교육';
 if(/현장실습|인턴십|인턴|일경험/.test(t))return '현장실습·경험';
 if(/상영회|이벤트|행사|프로그램|프로젝트|참가자|참여자|동아리|스터디|멘토|멘티|탐방|모집|페스티벌|축제|대회|선발/.test(t)||source.id==='programs')return '프로그램';
 return null;
}
export function parseWevity(html,source,page=1,checkedAt=new Date().toISOString()){
 const list=html.match(/<ul\b[^>]*class\s*=\s*["']list["'][^>]*>([\s\S]*?)<\/ul>/i)?.[1];
 if(!list)throw new Error('공모전 목록 구조를 확인할 수 없습니다.');
 const records=[];let listed=0;const today=new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Seoul'});
 for(const match of list.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)){
  const li=match[1];
  const anchor=li.match(/<div\b[^>]*class\s*=\s*["']tit["'][^>]*>[\s\S]*?<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
  if(!anchor)continue;listed++;
  const title=plain(anchor[2].replace(/<span\b[^>]*>[\s\S]*?<\/span>/gi,''));
  if(!title||/기념\s*이벤트|설문\s*이벤트|투표\s*이벤트|교정의 신|준비 중이라면/.test(title))continue;
  const sub=plain(li.match(/<div\b[^>]*class\s*=\s*["']sub-tit["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]||'');
  const organ=plain(li.match(/<div\b[^>]*class\s*=\s*["']organ["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]||'');
  const day=plain(li.match(/<div\b[^>]*class\s*=\s*["']day["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]||'');
  if(day&&!/접수중|마감임박|접수예정/.test(day))continue;
  const views=Number(plain(li.match(/<div\b[^>]*class\s*=\s*["']read["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]||'0').replace(/,/g,''))||0;
  const dMatch=day.match(/D-(\d+)/i);
  const addDays=(ymd,n)=>{const dt=new Date(ymd+'T00:00:00+09:00');dt.setUTCDate(dt.getUTCDate()+n);return dt.toISOString().slice(0,10)};
  const deadline_end=dMatch?addDays(today,Number(dMatch[1])):(/D-?day/i.test(day)?today:'');
  const url=new URL(anchor[1].replace(/&amp;/g,'&'),source.base);if(!allowedSourceUrl(url.href))continue;
  const ix=url.searchParams.get('ix')||String(listed);
  const category=/봉사활동/.test(sub)?'봉사·캠프':(/대외활동\/서포터즈/.test(sub)&&!/공모전|대회/.test(title))?'서포터즈·대외활동':'공모전·대회';
  records.push({id:'wevity:'+ix,school_id:source.school_id,title,date:today,category,source:[source.name,organ,day].filter(Boolean).join(' · '),source_id:source.id,scope:'교외',url:url.href,views,author:organ,has_attachment:false,checked_at:checkedAt,page,...(deadline_end?{deadline_end}:{})});
 }
 return {items:records,listed};
}
export function parseBoard(html,source,page=1,checkedAt=new Date().toISOString()){
 if(source.type==='wevity')return parseWevity(html,source,page,checkedAt);
 const body=html.match(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/i)?.[1];
 if(!body)throw new Error('게시판 목록 구조를 확인할 수 없습니다.');
 const records=[];let listed=0;
 for(const match of body.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)){
  const row=match[0].replace(/<!--[\s\S]*?-->/g,'');
  const cell=c=>{for(const m of row.matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/gi)){const classes=m[1].match(/class\s*=\s*["']([^"']*)["']/i)?.[1].split(/\s+/)||[];if(classes.includes(c))return m[2]}return ''};
  const isPknu=source.type==='pknu',isTu=source.type==='tu';
  const subject=cell(isPknu?'bdlTitle':'subject');
  const idKey=isPknu?'no':isTu?'articleNo':'board_seq';
  const anchor=[...subject.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)].find(a=>new RegExp('(?:[?&]|&amp;)'+idKey+'=\\d+').test(a[1]));
  if(!anchor)continue;listed++;
  const title=plain(anchor[2]),category=classify(title,source);if(!category)continue;
  const url=new URL(anchor[1].replace(/&amp;/g,'&'),source.base||BASE);if(!allowedSourceUrl(url.href))continue;
  const seq=url.searchParams.get(idKey),date=plain(cell(isPknu?'bdlDate':isTu?'data':'date'));if(!/^\d{4}-\d{2}-\d{2}$/.test(date))continue;
  // Keep canonical record links independent of the source pagination.
  if(isPknu){const bbs=url.searchParams.get('bbsId');url.search='';url.searchParams.set('action','view');url.searchParams.set('no',seq);if(bbs)url.searchParams.set('bbsId',bbs)}
  if(isTu){url.search='';url.searchParams.set('mode','view');url.searchParams.set('articleNo',seq)}
  const scope=source.scope==='교내외'?(/교외|외부|대외활동|서포터즈|기자단|명예기자|모니터링단|소방서|부산시|부산광역시|진흥원|공단|청년.*단|전국|대구|전북|UN\s*청소년|해외\s*봉사|해외봉사/.test(title)?'교외':'교내'):source.scope;
  const pknuDeadline=isPknu?[...row.matchAll(/<td\b[^>]*class\s*=\s*["'][^"']*\bbdlCount\b[^"']*["'][^>]*>([\s\S]*?)<\/td>/gi)].map(m=>plain(m[1]).match(/(\d{4}-\d{2}-\d{2})/)?.[1]).find(Boolean)||'':'';
  records.push({id:source.id+':'+seq,school_id:source.school_id||'ks',title,date,category,source:source.name,source_id:source.id,scope,url:url.href,views:Number(plain(cell(isPknu?'bdlCount':isTu?'hit':'cnt')).replace(/,/g,''))||0,author:isPknu||isTu?'':plain(cell('writer')),has_attachment:/ico_file|파일첨부|첨부파일|board_file/.test(row),checked_at:checkedAt,page,...(pknuDeadline?{deadline_end:pknuDeadline}:{})});
 }
 if(!listed&&!/등록된.*없|게시물.*없|게시글.*없|자료.*없/.test(plain(body)))throw new Error('목록을 읽지 못했습니다.');
 return {items:records,listed};
}
export function deduplicate(items){return [...new Map(items.map(d=>[d.id,d])).values()].sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(a.id))}
