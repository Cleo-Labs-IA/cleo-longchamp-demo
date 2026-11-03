import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import puppeteer from '/Users/naomiehalioua/cleo-lvmh-demo-build/maj-2610/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
const require=createRequire(import.meta.url),{createServer}=require('../scripts/dev.cjs');
let state={revision:0,follows:[]},failSave=false;
const upstream=async(url,options={})=>{
 const u=new URL(url),body=options.body?JSON.parse(options.body):{},token=options.headers?.Authorization;
 const answer=(data,status=200)=>new Response(JSON.stringify(data),{status});
 if(u.pathname==='/auth/v1/token')return body.password==='test-password'?answer({access_token:body.email==='one@example.invalid'?'one':'two',refresh_token:'refresh',user:{id:body.email},expires_in:3600}):answer({},400);
 if(u.pathname==='/auth/v1/user')return ['Bearer one','Bearer two'].includes(token)?answer({id:token}):answer({},401);
 if(u.pathname==='/auth/v1/logout')return answer({});
 if(u.pathname==='/rest/v1/longchamp_members')return answer(['Bearer one','Bearer two'].includes(token)?[{user_id:token}]:[]);
 if(u.pathname==='/rest/v1/longchamp_watch_state')return answer([state]);
 if(u.pathname==='/rest/v1/rpc/longchamp_save_watch'){
  if(failSave){failSave=false;return answer({},503);}
  if(body.expected_revision!==state.revision)return answer({message:'LONGCHAMP_CONFLICT'},409);
  state={revision:state.revision+1,follows:body.next_follows};return answer([state]);
 }
 throw new Error('Unexpected upstream '+url);
};
const server=createServer({config:{url:'https://fixture.invalid',key:'test-public'},fetchImpl:upstream});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url='http://127.0.0.1:'+server.address().port;
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const errors=[],result=[];
const contextA=await browser.createBrowserContext(),contextB=await browser.createBrowserContext();
const a=await contextA.newPage(),b=await contextB.newPage();for(const p of [a,b])p.on('pageerror',e=>errors.push(e.message));
async function login(p,email){await p.goto(url+'/app',{waitUntil:'networkidle0'});assert.equal(new URL(p.url()).pathname,'/');await p.type('#email',email);await p.type('#password','test-password');await Promise.all([p.waitForNavigation({waitUntil:'networkidle0'}),p.click('[type=submit]')]);assert.equal(new URL(p.url()).pathname,'/app');}
async function save(p){await p.click('#fw-form [type=submit]');await p.waitForFunction(()=>!followSaving);}
try{
 assert.equal((await fetch(url+'/follow-ui.js')).status,404);assert.equal((await fetch(url+'/server/app.cjs')).status,404);assert.equal((await fetch(url+'/sources')).url,url+'/');result.push('private routes and source files protected');
 await a.setViewport({width:1440,height:1000});await login(a,'one@example.invalid');await login(b,'two@example.invalid');
 await a.evaluate(()=>{localStorage.setItem(FKEY,JSON.stringify([FDATA.initialFollow]));select('suivis');});await a.reload({waitUntil:'networkidle0'});assert.equal(await a.evaluate(()=>savedFollows.length),0);result.push('shared empty state does not auto-import local demonstrations');
 await a.evaluate(()=>openFollow());await a.type('#fw-value','50-00-0');await save(a);assert.equal(state.follows[0].value,'50-00-0');
 await b.reload({waitUntil:'networkidle0'});await b.evaluate(()=>select('suivis'));assert(await b.$eval('#content',e=>e.innerText.includes('50-00-0')));result.push('second account sees first account saved follow');
 const id=state.follows[0].id;await b.evaluate(id=>openFollow(id),id);await b.$eval('[name=product][value=roseau]',e=>e.checked=true);
 await a.evaluate(id=>toggleFollow(id),id);assert.equal(state.follows[0].paused,true);
 await save(b);assert(await b.$eval('#fw-error',e=>e.innerText.includes('autre personne')));assert(!state.follows[0].products.includes('roseau'));result.push('concurrent edit blocked with visible warning');
 await save(b);assert(state.follows[0].products.includes('roseau'));assert(state.follows[0].paused);result.push('explicit retry retains shared pause and new product association');
 await a.reload({waitUntil:'networkidle0'});await a.evaluate(()=>select('suivis'));failSave=true;await a.evaluate(id=>removeFollow(id),id);assert.equal(state.follows.length,1);assert(await a.$eval('#content',e=>e.innerText.includes('temporairement indisponible')));assert.equal(await a.evaluate(()=>savedFollows.length),1);result.push('failed write rolls back UI without claiming success');
 await a.evaluate(()=>importBrowserFollows());assert(state.follows.some(f=>f.value==='307-24-4'));result.push('explicit legacy import merges into shared state');
 await a.evaluate(()=>select('prod:cuir'));await a.evaluate(()=>ppTab60('cas'));assert(await a.$eval('#content',e=>e.innerText.includes('PFHxA')));result.push('product CAS tab uses shared follows');
 const dir=process.env.LONGCHAMP_REPORT_DIR||'/private/tmp/longchamp-shared-app-tests';fs.mkdirSync(dir,{recursive:true});
 await a.screenshot({path:dir+'/shared-desktop.png',fullPage:true});await a.setViewport({width:390,height:844});assert(await a.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await a.evaluate(()=>openFollow());assert(await a.$eval('.fw-panel',e=>e.getBoundingClientRect().width<=390));await a.keyboard.press('Escape');await a.screenshot({path:dir+'/shared-mobile.png',fullPage:true});result.push('desktop and mobile without overflow');
 assert(!(await a.evaluate(()=>document.cookie)).includes('lc_access'));
 await Promise.all([a.waitForNavigation({waitUntil:'networkidle0'}),a.click('.lc-account button')]);assert.equal(new URL(a.url()).pathname,'/');await a.goto(url+'/app',{waitUntil:'networkidle0'});assert.equal(new URL(a.url()).pathname,'/');result.push('HttpOnly session, logout and blocked re-entry');
 await a.screenshot({path:dir+'/login.png',fullPage:true});assert.deepEqual(errors,[]);
 fs.writeFileSync(dir+'/browser.json',JSON.stringify({checks:result,errors,auth_provider:'local fixture; RLS verified separately against Supabase'},null,2));console.log('PASS '+result.join('; '));
}finally{await browser.close();server.close();}
