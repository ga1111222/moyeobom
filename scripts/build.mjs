import {readFile,writeFile,mkdir,rm,copyFile} from 'node:fs/promises';
const feed=await readFile('worker/feed.mjs','utf8'),app=await readFile('worker/app.mjs','utf8'),html=await readFile('worker/frontend.html','utf8'),seed=await readFile('worker/seed.json','utf8');
const demand=await readFile('worker/demand.mjs','utf8');
const ai=await readFile('worker/ai.mjs','utf8');
const programs=await readFile('data/pknu-programs.json','utf8');
const union=await readFile('data/union-events.json','utf8');
const source='const UNION_EVENTS='+union+';\nconst IMPORTED_PROGRAMS='+programs+';\n'+demand+'\n'+feed+'\n'+ai+'\nconst HTML='+JSON.stringify(html)+';\nconst SEED='+seed+';\n'+app;
await writeFile('worker/index.js',source);await rm('dist',{recursive:true,force:true});await mkdir('dist/server',{recursive:true});await mkdir('dist/.openai',{recursive:true});await writeFile('dist/server/index.js',source);await copyFile('.openai/hosting.json','dist/.openai/hosting.json');await mkdir('dist/drizzle/meta',{recursive:true});await copyFile('drizzle/0000_demand_surveys.sql','dist/drizzle/0000_demand_surveys.sql');await copyFile('drizzle/0001_feed_refresh_state.sql','dist/drizzle/0001_feed_refresh_state.sql');await copyFile('drizzle/meta/_journal.json','dist/drizzle/meta/_journal.json');console.log('Built Worker ESM with demand database');
