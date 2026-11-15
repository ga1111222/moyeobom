import {readFile,writeFile} from 'node:fs/promises';import {parseBoard,SOURCES,deduplicate} from '../worker/feed.mjs';
const seed=[];
for(const source of SOURCES){for(let page=1;page<=source.pages;page++){const parsed=parseBoard(await readFile('/tmp/'+source.code+'-'+page+'.html','utf8'),source,page);seed.push({source_id:source.id,page,...parsed,checked_at:new Date().toISOString()});console.log(source.name,page,parsed.listed,parsed.items.length)}}
await writeFile('worker/seed.json',JSON.stringify(seed));console.log('Unique activities',deduplicate(seed.flatMap(p=>p.items)).length);
