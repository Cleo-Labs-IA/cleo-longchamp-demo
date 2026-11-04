import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import puppeteer from '/Users/naomiehalioua/cleo-lvmh-demo-build/maj-2610/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
const require=createRequire(import.meta.url),{createServer}=require('../scripts/dev.cjs'),{createSessionProof}=require('../server/session-proof.cjs');
const jwt='header.'+Buffer.from(JSON.stringify({sub:'member',session_id:'approved-session'})).toString('base64url')+'.signature',proof=createSessionProof('secret',jwt,'member');
let approved=true,backendDown=false,revoked=false,refreshes=0,codeRequests=0,release,start;
const started=new Promise(resolve=>start=resolve);let held=true;
const upstream=async(url,options)=>{
 const path=new URL(url).pathname,body=options.body&&JSON.parse(options.body),token=options.headers.Authorization;
 const answer=(data,status=200)=>new Response(status===204?null:JSON.stringify(data),{status});
 if(path==='/auth/v1/user'){
  if(held){held=false;start();await new Promise(resolve=>release=resolve);}
  return backendDown?answer({},503):!revoked&&token==='Bearer '+jwt?answer({id:'member'}):answer({},401);
 }
 if(path==='/auth/v1/token'){refreshes++;return body.refresh_token==='valid-refresh'&&!revoked?answer({access_token:jwt,refresh_token:'valid-refresh'}):answer({},400);}
 if(path==='/rest/v1/longchamp_members')return answer([{user_id:'member'}]);
 if(path==='/rest/v1/rpc/longchamp_is_member')return answer(approved&&!revoked);
 if(path==='/rest/v1/longchamp_watch_state')return answer([{revision:0,follows:[]}]);
 if(path==='/rest/v1/rpc/longchamp_get_articles')return answer({viewer_id:'member',favorites:[],reviews:[]});
 if(path==='/auth/v1/logout'){revoked=true;return answer({});}
 if(path==='/rest/v1/longchamp_otp_sessions')return answer(null,204);
 codeRequests++;throw new Error('No new code should be requested: '+path);
};
const server=createServer({config:{url:'https://fixture.invalid',key:'public',serviceKey:'secret'},fetchImpl:upstream});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url='http://127.0.0.1:'+server.address().port,browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const context=await browser.createBrowserContext(),page=await context.newPage(),checks=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
async function seed(){await context.setCookie(...[{name:'lc_access',value:jwt},{name:'lc_refresh',value:'valid-refresh'},{name:'lc_otp',value:proof}].map(c=>({...c,url,httpOnly:true,expires:Math.floor(Date.now()/1000)+3600})));}
async function app(p=page){await p.waitForFunction(()=>location.pathname==='/app'&&!!document.getElementById('content'));}
async function form(){await page.waitForSelector('#login:not([hidden])');assert.equal(new URL(page.url()).pathname,'/');}
try{
 await page.setViewport({width:1440,height:1000});await seed();await page.goto(url+'/#suivis',{waitUntil:'domcontentloaded'});await started;assert(await page.$eval('#login',e=>e.hidden));release();await app();assert.equal(new URL(page.url()).hash,'#suivis');checks.push('recent session opens app directly; no login form flash; destination hash preserved');
 await page.goto(url+'/',{waitUntil:'domcontentloaded'});await app();const other=await context.newPage();await other.goto(url+'/',{waitUntil:'domcontentloaded'});await app(other);await other.close();checks.push('returning to root and reopening in another tab keep the session');
 await context.deleteCookie(...(await context.cookies()).filter(c=>c.name==='lc_access'));await page.goto(url+'/',{waitUntil:'domcontentloaded'});await app();assert(refreshes>0);assert((await context.cookies()).some(c=>c.name==='lc_access'));checks.push('expired access cookie renews silently using refresh cookie');
 await context.deleteCookie(...(await context.cookies()).filter(c=>c.name==='lc_otp'));await page.goto(url+'/',{waitUntil:'domcontentloaded'});await form();checks.push('native identity without OTP proof does not resume');
 await seed();await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));await app();checks.push('persisted pageshow event rechecks session (BFCache handler simulation)');
 approved=false;await page.goto(url+'/',{waitUntil:'domcontentloaded'});await form();approved=true;checks.push('expired OTP approval still requires a new code');
 await seed();backendDown=true;await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.getElementById('session-status').textContent.includes('indisponible'));assert(await page.$eval('#login',e=>e.hidden),'An outage must not ask for a new login');assert((await context.cookies()).some(c=>c.name==='lc_refresh'));backendDown=false;await page.click('#retry-session');await app();checks.push('temporary outage keeps cookies and offers retry instead of a new login');
 let blocked;const intercept=request=>{if(request.url().includes('action=session')){blocked=request;return;}request.continue().catch(()=>{});};await page.setRequestInterception(true);page.on('request',intercept);
 await page.goto(url+'/',{waitUntil:'domcontentloaded'});await page.waitForSelector('#retry-session:not([hidden])');assert(blocked);assert(await page.$eval('#login',e=>e.hidden));assert((await context.cookies()).some(c=>c.name==='lc_refresh'));await blocked.abort().catch(()=>{});page.off('request',intercept);await page.setRequestInterception(false);await page.click('#retry-session');await app();checks.push('a stalled browser request times out without asking for a code; retry resumes');
 await page.click('.lc-account button');await form();await page.reload({waitUntil:'domcontentloaded'});await form();assert.equal(codeRequests,0);checks.push('logout remains effective; no automatic code requests');
 await page.setViewport({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
 const dir=process.env.LONGCHAMP_REPORT_DIR||'/Users/naomiehalioua/reports/longchamp-session-2026-11-03';fs.mkdirSync(dir,{recursive:true});await page.screenshot({path:dir+'/login-mobile.png',fullPage:true});fs.writeFileSync(dir+'/browser.json',JSON.stringify({checks,errors,provider:'local authentication fixtures; native provider checked separately'},null,2));console.log('PASS '+checks.join('; '));
}finally{await browser.close();server.close();}
