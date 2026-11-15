"""Import a supplied PKNU non-curricular text export without inventing detail URLs."""
import argparse,hashlib,json,re,datetime,pathlib
URL='https://pknuai.pknu.ac.kr/web/nonSbjt/program.do?mId=216&rstOk=1&order=3'
def parse(text):
 text=text.replace('\r\n','\n').replace('\ufeff','')
 headers=list(re.finditer(r'^(.+?)\s*>\s*(\S+형)([^\n]*)$',text,re.M));records={}
 date_pattern=r'(\d{4})\.(\d{2})\.(\d{2})\s*~\s*(\d{4})\.(\d{2})\.(\d{2})'
 def dates(label,body):
  m=re.search(label+r'\s*:\s*'+date_pattern,body)
  if not m:raise ValueError('Missing '+label+' in '+body[:100])
  v=m.groups();return '-'.join(v[:3]),'-'.join(v[3:])
 for i,h in enumerate(headers):
  body=text[h.end():headers[i+1].start() if i+1<len(headers) else len(text)].strip()
  title=body.split('모집기간',1)[0].strip().replace('\n',' ')
  if not title:raise ValueError('Missing program title')
  department,format,status=[x.strip() for x in h.groups()]
  rs,re_=dates('모집기간',body);os,oe=dates('운영기간',body)
  for date in [rs,re_,os,oe]:datetime.date.fromisoformat(date)
  count=re.search(r'모집인원\s*(\d+)명\s*(\d+)명\s*지원 중(?:\s*대기\s*(\d+)명)?',body)
  if not count:raise ValueError('Missing capacity: '+title)
  key='|'.join([department,title,rs,re_,os,oe]);id='pknu-import:'+hashlib.sha256(key.encode()).hexdigest()[:20]
  if format=='대회형':category='공모전·대회'
  elif format=='봉사형':category='봉사·캠프'
  elif re.search('공모|경진|해커톤|챌린지',title):category='공모전·대회'
  elif format=='강의형' or re.search('특강|강연|세미나|아카데미',title):category='특강·교육'
  elif re.search('서포터|기자단|홍보대사',title):category='서포터즈·대외활동'
  elif re.search('인턴십|현장실습',title):category='현장실습·경험'
  else:category='프로그램'
  records[id]=dict(id=id,school_id='pknu',title=title,date=rs,category=category,source='부경아이 비교과 · 제공 자료',source_id='pknu-import',scope='교내',url=URL,views=None,author='',has_attachment=False,is_snapshot=True,imported_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),checked_at=None,page=0,department=department,program_format=format,recruitment_start=rs,recruitment_end=re_,operation_start=os,operation_end=oe,capacity=int(count[1]),applicants=int(count[2]),waiting=int(count[3] or 0),status_as_provided=status)
 return list(records.values()),len(headers)
if __name__=='__main__':
 ap=argparse.ArgumentParser();ap.add_argument('file');ap.add_argument('--output',default='data/pknu-programs.json');a=ap.parse_args()
 records,raw=parse(pathlib.Path(a.file).read_text(encoding='utf-8'));pathlib.Path(a.output).write_text(json.dumps(records,ensure_ascii=False,indent=2))
 print('Imported',len(records),'programs from',raw,'entries; exact duplicates:',raw-len(records))
 print('Enrollment dates:',min(x['recruitment_start'] for x in records),'to',max(x['recruitment_end'] for x in records))
