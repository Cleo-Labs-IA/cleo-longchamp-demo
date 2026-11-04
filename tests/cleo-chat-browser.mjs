import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import puppeteer from '/Users/naomiehalioua/cleo-lvmh-demo-build/maj-2610/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
const require=createRequire(import.meta.url),{createServer}=require('../scripts/dev.cjs'),{createSessionProof}=require('../server/session-proof.cjs');
const actor='ca120001-1111-4111-8111-111111111111',org='ca120002-2222-4222-8222-222222222222',jwt='header.'+Buffer.from(JSON.stringify({sub:actor,session_id:'approved-session'})).toString('base64url')+'.signature';
const threads=new Set(),calls=[],errors=[],checks=[];let active=null,mode='complete',cancelled=false;
const upstream=async(url,options)=>{
 const path=new URL(url).pathname,body=options.body&&JSON.parse(options.body),answer=(data,status=200)=>new Response(JSON.stringify(data),{status});
 if(path==='/auth/v1/user')return answer({id:actor});
 if(path==='/rest/v1/longchamp_members')return answer([{user_id:actor}]);
 if(path==='/rest/v1/longchamp_watch_state')return answer([{revision:0,follows:[]}]);
 if(path==='/rest/v1/rpc/longchamp_get_articles')return answer({viewer_id:actor,favorites:[],reviews:[]});
 if(path==='/rest/v1/rpc/longchamp_claim_chat_turn'){if(active)return answer({},429);const id=body.p_thread_id||crypto.randomUUID();threads.add(id);active=body.p_turn_id;return answer([{id,user_id:actor}]);}
 if(path==='/rest/v1/rpc/longchamp_release_chat_turn'){if(active===body.p_turn_id)active=null;return answer(true);}
 if(path==='/api/v1/conversation'){
  calls.push(body);const event=(type,data)=>'data: '+JSON.stringify({type,data})+'\n\n',meta=event('data-cleo-api',{version:'2026-10-28',threadId:body.threadId});
  if(mode==='hold')return new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(meta));},cancel(){cancelled=true;}}),{headers:{'content-type':'text/event-stream'}});
  const source={n:1,kind:'corpus',title:'Source synthétique de test',article:'Article témoin',quote:'Citation <img src=x onerror="window.XSS=true">.',url:'https://example.org/source',celex:null,charStart:null,charEnd:null};
  const content='## Réponse\n\n**Un point important.**\n\n| Point | Action |\n|---|---|\n| Produit | Réunir les informations |\n\n<script>window.XSS=true</script>\n\n![ne pas charger](https://tracker.invalid/pixel) [lien](javascript:alert(1))\n\nSource : https://example.org/plain-source\n\n<!-- cleo:coverage -->\n\nSources consultées : le corpus.';
  return new Response(meta+event('data-cleo-citations',[source])+event('data-cleo-reponse',{contenu:mode==='failed'?'UNVERIFIED RESPONSE':content,statut:mode==='failed'?'failed':'complete',controlesMenes:mode!=='failed',citationCount:1})+'data: [DONE]\n\n',{headers:{'content-type':'text/event-stream'}});
 }
 throw new Error('Unexpected '+path);
};
const server=createServer({config:{url:'https://db.invalid',key:'public',serviceKey:'service',chatSecret:'a-server-only-test-conversation-secret',chatOrganizationId:org},fetchImpl:upstream});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port,browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true}),context=await browser.createBrowserContext(),page=await context.newPage();
const requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
async function send(text){await page.type('.cpanel #chati',text);await page.click('.cpanel .chat-f [type=submit]');await page.waitForFunction(()=>document.querySelector('.cpanel .chat-f [type=submit]').disabled===false);}
async function noLease(){const until=Date.now()+3000;while(active&&Date.now()<until)await new Promise(r=>setTimeout(r,20));assert.equal(active,null);}
try{
 await context.setCookie(...[{name:'lc_access',value:jwt},{name:'lc_otp',value:createSessionProof('service',jwt,actor)}].map(c=>({...c,url:base,httpOnly:true})));
 await page.setViewport({width:1440,height:1000});await page.goto(base+'/app',{waitUntil:'networkidle0'});await page.evaluate(()=>{openSig(SIG.find(s=>s.kind==='delta').id);closeDr60(true);toggleChat60(true);});await page.waitForFunction(()=>document.querySelector('.cpanel.on')?.getBoundingClientRect().right<=innerWidth+.5);
 await send('Quel est le contexte de cette fiche ?');assert.equal(calls.length,1);assert.equal(calls[0].actorId,actor);assert.equal(calls[0].organizationId,org);assert(calls[0].context.fileSummary.includes('"article":{'));assert(await page.$('.lc-chat-answer table'));assert.equal(await page.evaluate(()=>!!window.XSS),false);assert.equal(await page.$('.lc-chat-answer img'),null);assert(!requests.some(r=>r.includes('tracker.invalid')));await page.click('.lc-chat-sources summary');assert(await page.$eval('.lc-chat-sources',e=>e.innerText.includes('Citation <img')));checks.push('signed API lane renders checked Markdown and source quotes without HTML execution or remote images');
 assert(await page.$eval('.lc-chat-answer',e=>!e.innerText.includes('cleo:coverage')&&e.innerText.includes('Sources consultées : le corpus.')));assert(await page.$('.lc-chat-answer a[href="https://example.org/plain-source"]'));
 await page.click('.lc-chat-context button');await send('Et pour le même produit ?');assert.equal(calls[1].threadId,calls[0].threadId);assert(!calls[1].context.fileSummary.includes('"article":{'));checks.push('follow-up reuses private thread and context can be removed');
 mode='failed';await send('Question avec refus');assert(!(await page.$eval('#chatm',e=>e.innerText)).includes('UNVERIFIED RESPONSE'));assert(await page.$('.lc-chat-error'));await page.$eval('.cpanel #chati',e=>e.value='');checks.push('unverified response becomes an explicit unavailable state, no local fallback');
 mode='hold';cancelled=false;await page.type('.cpanel #chati','Recherche à arrêter');await page.click('.cpanel .chat-f [type=submit]');await page.waitForSelector('.lc-chat-stop:not([hidden])');await page.click('.lc-chat-stop');await page.waitForFunction(()=>document.querySelector('.lc-chat-stop').hidden);await noLease();assert(cancelled);checks.push('stop cancels streaming read and releases the server lease');
 await page.click('.cpanel .nw');mode='complete';await send('Nouvelle conversation');assert.notEqual(calls.at(-1).threadId,calls[0].threadId);checks.push('new conversation creates a separate owned thread');
 const dir=process.env.LONGCHAMP_REPORT_DIR||'/Users/naomiehalioua/reports/longchamp-chat-2026-11-04';fs.mkdirSync(dir,{recursive:true});await page.screenshot({path:dir+'/chat-desktop.png',fullPage:true});await page.setViewport({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert(await page.$eval('.cpanel',e=>e.getBoundingClientRect().width<=390));await page.screenshot({path:dir+'/chat-mobile.png',fullPage:true});checks.push('desktop and mobile chat without horizontal page overflow');
 for(const suffix of ['/cleo-chat.js','/vendor/markdown-it.js']){
  const blocked=await context.newPage();await blocked.setRequestInterception(true);blocked.on('request',r=>r.url().endsWith(suffix)?r.abort():r.continue());await blocked.goto(base+'/app',{waitUntil:'networkidle0'});const before=calls.length;await blocked.evaluate(()=>chatSend60('PFAS'));assert(await blocked.$eval('.cpanel #chatm',e=>e.textContent.includes('indisponible')));assert.equal(await blocked.$('.cpanel #chatm .hit'),null);assert.equal(calls.length,before);await blocked.close();
 }
 checks.push('missing API UI or Markdown asset leaves assistant unavailable instead of restoring demo answers');assert.deepEqual(errors,[]);fs.writeFileSync(dir+'/browser.json',JSON.stringify({checks,errors,provider:'deterministic signed API fixture; not regulatory evidence'},null,2));console.log('PASS '+checks.join('; '));
}finally{await browser.close();server.close();}
