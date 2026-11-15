export const PKNU_PROGRAM_URL='https://pknuai.pknu.ac.kr/web/nonSbjt/program.do?mId=216&rstOk=1&order=3';
export const BASE='https://kscms.ks.ac.kr/kor/CMS/Board/Board.do';
export const SOURCES=[
 {id:'campus',school_id:'ks',name:'교내소식',scope:'교내',code:'MN091',pages:3},
 {id:'outside',school_id:'ks',name:'교외소식',scope:'교외',code:'MN092',pages:3},
 {id:'programs',school_id:'ks',name:'비교과 교육과정',scope:'교내',code:'MN197',pages:2},
 {id:'pknu-notice',school_id:'pknu',name:'국립부경대 공지사항',scope:'교내외',type:'pknu',base:'https://www.pknu.ac.kr/main/163',pages:3},
 {id:'tu-events',school_id:'tongmyong',name:'동명대 행사·모집',scope:'교내외',type:'tu',base:'https://www.tu.ac.kr/tuhome/sub07_01_05.do',pages:3},
 {id:'tu-notice',school_id:'tongmyong',name:'동명대 일반공지',scope:'교내외',type:'tu',base:'https://www.tu.ac.kr/tuhome/sub07_01_01.do',pages:2}
];
export function sourceUrl(source,page=1){const u=new URL(source.base||BASE);if(source.type==='pknu'){u.searchParams.set('pageIndex',String(page))}else if(source.type==='tu'){u.searchParams.set('mode','list');u.searchParams.set('article.offset',String((page-1)*10));u.searchParams.set('articleLimit','10')}else{u.searchParams.set('mCode',source.code);u.searchParams.set('page',String(page));u.searchParams.set('mode','list')}return u}
export function allowedSourceUrl(value){try{const u=new URL(value);return u.protocol==='https:'&&((u.origin==='https://pknuai.pknu.ac.kr'&&u.pathname==='/web/nonSbjt/program.do')||SOURCES.some(s=>{const b=new URL(s.base||BASE);return u.origin===b.origin&&u.pathname===b.pathname}))}catch{return false}}

export function plain(s=''){return s.replace(/<!--[\s\S]*?-->/g,'').replace(/<[^>]*>/g,' ').replace(/&#(x[0-9a-f]+|\d+);/gi,(_,n)=>{const v=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):parseInt(n,10);return v>0&&v<=0x10ffff?String.fromCodePoint(v):''}).replace(/&(amp|lt|gt|quot|apos|nbsp);/g,(_,k)=>({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '})[k]).replace(/\s+/g,' ').trim()}
export function classify(t,source){
 if(/채용공고|채용\s*공고|조교.*채용|계약교수.*채용|면접.*대상자|합격자|병력동원|신입생 모집|수강신청|이수구분 변경|직원|연구원.*채용|교원|신규강사|교수.*초빙|시간제등록|서비스.*중단|안전수칙|행동요령|예방수칙|참여기업|실습기관|불법복제|만족도.*조사|장학금.*조건|충족.*독려/.test(t))return null;
 if(/드래프톤|공모|경진|아이디어.*대회|콘테스트|논문.*대회|해커톤|챌린지|경연|Art Award/.test(t))return '공모전·대회';
 if(/봉사|캠프/.test(t))return '봉사·캠프';
 if(/서포터|홍보대사|명예기자|대표단|기자단|모니터링단|체험단|대외활동|디깅클럽|청년.*단/.test(t))return '서포터즈·대외활동';
 if(/봉사|캠프/.test(t))return '봉사·캠프';
 if(/특강|강연|세미나|워크숍|설명회|교육|아카데미|토크|포럼|연수/.test(t))return '특강·교육';
 if(/현장실습|인턴십|인턴|일경험/.test(t))return '현장실습·경험';
 if(/상영회|이벤트|행사|프로그램|프로젝트|참가자|참여자|동아리|스터디|멘토|멘티|탐방|모집|페스티벌|축제|대회|선발/.test(t)||source.id==='programs')return '프로그램';
 return null;
}
export function parseBoard(html,source,page=1,checkedAt=new Date().toISOString()){
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
  if(isPknu){url.search='';url.searchParams.set('action','view');url.searchParams.set('no',seq)}
  if(isTu){url.search='';url.searchParams.set('mode','view');url.searchParams.set('articleNo',seq)}
  const scope=source.scope==='교내외'?(/교외|외부/.test(title)?'교외':/교내/.test(title)?'교내':'교내외'):source.scope;
  records.push({id:source.id+':'+seq,school_id:source.school_id||'ks',title,date,category,source:source.name,source_id:source.id,scope,url:url.href,views:Number(plain(cell(isPknu?'bdlCount':isTu?'hit':'cnt')).replace(/,/g,''))||0,author:isPknu||isTu?'':plain(cell('writer')),has_attachment:/ico_file|파일첨부|첨부파일|board_file/.test(row),checked_at:checkedAt,page});
 }
 if(!listed&&!/등록된.*없|게시물.*없|게시글.*없|자료.*없/.test(plain(body)))throw new Error('목록을 읽지 못했습니다.');
 return {items:records,listed};
}
export function deduplicate(items){return [...new Map(items.map(d=>[d.id,d])).values()].sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(a.id))}
