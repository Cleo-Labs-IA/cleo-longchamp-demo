import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import puppeteer from '/Users/naomiehalioua/cleo-lvmh-demo-build/maj-2610/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
const require=createRequire(import.meta.url),{createServer}=require('../scripts/dev.cjs'),{createSessionProof}=require('../server/session-proof.cjs');
const jwt=id=>'header.'+Buffer.from(JSON.stringify({sub:id,session_id:id+'-session'})).toString('base64url')+'.signature';
const reviews=[],favorites=new Map(),errors=[],checks=[];let fail=false,conflict=false,holdRead=false,releaseRead,readStarted,favoriteWritten;
const upstream=async(url,options)=>{
 const path=new URL(url).pathname,body=options.body&&JSON.parse(options.body),user=JSON.parse(Buffer.from(options.headers.Authorization.split('.')[1],'base64url')).sub;
 const answer=(data,status=200)=>new Response(JSON.stringify(data),{status});
 if(path==='/auth/v1/user')return answer({id:user});
 if(path==='/rest/v1/longchamp_members')return answer([{user_id:user}]);
 if(path==='/rest/v1/longchamp_watch_state')return answer([{revision:0,follows:[]}]);
 if(path==='/rest/v1/rpc/longchamp_get_articles'){
  const snapshot=JSON.parse(JSON.stringify({viewer_id:user,favorites:[...(favorites.get(user)||[])],reviews}));
  if(holdRead){holdRead=false;readStarted?.();await new Promise(resolve=>releaseRead=resolve);}
  return answer(snapshot);
 }
 if(path==='/rest/v1/rpc/longchamp_set_favorite'){
  if(fail){fail=false;return answer({},503);}
  const set=favorites.get(user)||new Set();if(body.p_favorite)set.add(body.p_article_key);else set.delete(body.p_article_key);favorites.set(user,set);favoriteWritten?.();return answer(true);
 }
 if(path==='/rest/v1/rpc/longchamp_save_review'){
  if(fail){fail=false;return answer({},503);}if(conflict){conflict=false;return answer({message:'LONGCHAMP_REVIEW_CONFLICT'},409);}
  let r=reviews.find(r=>r.author_id===user&&r.article_key===body.p_article_key);if(!r){r={author_id:user,author_label:user+'@cleolabs.co',article_key:body.p_article_key,revision:0};reviews.push(r);}
  Object.assign(r,{reaction:body.p_reaction,rating:body.p_rating,comment:body.p_comment,revision:r.revision+1,updated_at:new Date().toISOString()});return answer(r.revision);
 }
 throw new Error('Unexpected upstream '+path);
};
const server=createServer({config:{url:'https://fixture.invalid',key:'public',serviceKey:'service'},fetchImpl:upstream});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url='http://127.0.0.1:'+server.address().port,browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const contexts=await Promise.all([browser.createBrowserContext(),browser.createBrowserContext()]);const pages=await Promise.all(contexts.map(c=>c.newPage()));const [a,b]=pages;
async function ready(p){await p.goto(url+'/app',{waitUntil:'networkidle0'});await p.waitForFunction(()=>window.LongchampArticles?.ready);}
async function save(p){await p.click('#lc-review-form [type=submit]');await p.waitForFunction(()=>!document.querySelector('#lc-review-dialog'));}
async function open(p,id){await p.evaluate(id=>openSig(id),id);await p.waitForFunction(()=>document.querySelector('.idr.on')?.getBoundingClientRect().right<=innerWidth+.5);}
try{
 for(const [i,p] of pages.entries()){
  p.on('pageerror',e=>errors.push(e.message));const user=i?'two':'one';
  await contexts[i].setCookie(...[{name:'lc_access',value:jwt(user)},{name:'lc_otp',value:createSessionProof('service',jwt(user),user)}].map(c=>({...c,url,httpOnly:true})));
  await p.setViewport({width:1440,height:1000});await ready(p);
 }
 await a.evaluate(()=>select('veille'));const id=await a.$eval('[data-lc-article]',e=>Number(e.dataset.lcArticle));const key=await a.evaluate(id=>SIG.find(s=>s.id===id).raw,id);
 const readHeld=new Promise(resolve=>readStarted=resolve),written=new Promise(resolve=>favoriteWritten=resolve);holdRead=true;
 const oldRead=a.evaluate(()=>LongchampArticles.refresh());await readHeld;
 await a.click('[data-lc-article="'+id+'"] [data-lc-favorite]');await written;releaseRead();await oldRead;await a.waitForFunction(()=>!LongchampArticles.busy);
 assert.equal(await a.$eval('[data-lc-article="'+id+'"] [data-lc-favorite]',e=>e.getAttribute('aria-pressed')),'true','A pre-write refresh must not restore stale favorites');checks.push('a refresh started before a favorite write cannot restore stale state');
 assert(favorites.get('one').has(key));assert.equal(await a.$('#lc-article-detail'),null,'favorite does not open the article');
 await a.click('[data-lc-favorites-nav]');assert(await a.$('[data-lc-article="'+id+'"]'));await ready(a);await a.click('[data-lc-favorites-nav]');assert(await a.$('[data-lc-article="'+id+'"]'));checks.push('personal favorite persists across reload and is reachable from navigation');
 await b.click('[data-lc-favorites-nav]');assert(await b.$eval('#content',e=>e.innerText.includes('Aucun favori')));checks.push('favorites are isolated between users');
 await a.click('[data-lc-article="'+id+'"] [data-lc-like]');await a.select('#lc-review-rating','4');await a.type('#lc-review-comment','Très utile <img src=x onerror="window.XSS=true"> pour notre équipe.');await save(a);
 await open(b,id);await b.evaluate(()=>LongchampArticles.refresh());assert(await b.$eval('#lc-article-detail',e=>e.innerText.includes('Très utile <img')));assert.equal(await b.evaluate(()=>!!window.XSS),false);assert.equal(await b.$('#lc-article-detail img'),null);checks.push('rating and reason shared by author; HTML rendered as text');
 await b.click('#lc-article-detail [data-lc-dislike]');await b.select('#lc-review-rating','2');await b.type('#lc-review-comment','À préciser pour nos produits.');await save(b);
 assert.equal(reviews.filter(r=>r.article_key===key).length,2);await open(a,id);await a.evaluate(()=>LongchampArticles.refresh());assert.equal(await a.$$eval('.lc-team-review',els=>els.length),2);checks.push('opposite reactions coexist without overwriting another author');
 await a.click('#lc-article-detail [data-lc-edit]');await a.$eval('#lc-review-comment',e=>e.value='Brouillon à conserver');fail=true;await a.click('#lc-review-form [type=submit]');await a.waitForFunction(()=>document.getElementById('lc-review-error')?.textContent);assert.equal(await a.$eval('#lc-review-comment',e=>e.value),'Brouillon à conserver');assert(reviews.find(r=>r.author_id==='one').comment.includes('Très utile'));checks.push('failed save retains draft and does not claim success');
 conflict=true;await a.click('#lc-review-form [type=submit]');await a.waitForFunction(()=>document.getElementById('lc-review-error').textContent.includes('autre fenêtre'));assert.equal(await a.$eval('#lc-review-comment',e=>e.value),'Brouillon à conserver');await a.click('#lc-review-reload');await a.waitForFunction(()=>document.getElementById('lc-review-status').textContent.includes('rechargé'));assert((await a.$eval('#lc-review-comment',e=>e.value)).includes('Très utile'));await a.keyboard.press('Escape');assert.equal(await a.$('#lc-review-dialog'),null);assert(await a.$('.idr.on'));checks.push('conflict requires explicit reload; Escape closes only the review dialog');
 await a.click('#lc-article-detail [data-lc-edit]');await a.click('#lc-review-clear');await a.waitForFunction(()=>!document.querySelector('#lc-review-dialog'));assert.equal(reviews.find(r=>r.author_id==='one').reaction,null);assert.equal(reviews.find(r=>r.author_id==='one').comment,'');assert(reviews.find(r=>r.author_id==='two').comment);checks.push('author can clear their own review while the other remains');
 const dir=process.env.LONGCHAMP_REPORT_DIR||'/private/tmp/longchamp-article-feedback';fs.mkdirSync(dir,{recursive:true});await a.screenshot({path:dir+'/article-desktop.png',fullPage:true});
 await a.setViewport({width:390,height:844});await a.click('#lc-article-detail [data-lc-like]');assert(await a.$eval('#lc-review-dialog',e=>e.getBoundingClientRect().width<=390));assert(await a.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await a.screenshot({path:dir+'/article-mobile.png',fullPage:true});await a.keyboard.press('Escape');
 await a.click('#lc-article-detail [data-lc-favorite]');await a.waitForFunction(()=>!LongchampArticles.busy);assert(await a.$eval('#lc-article-detail',e=>e.innerText.includes('À préciser pour nos produits.')),'Removing a favorite must preserve this article’s team reviews');
 await a.evaluate(()=>{closeDr60(true);select('veille');});assert(await a.$('[data-lc-favorites-link]'));await a.click('[data-lc-favorites-link]');await a.waitForFunction(()=>document.getElementById('content').innerText.includes('Aucun favori'));checks.push('mobile favorites shortcut and removal from the article preserve its reviews without overflow');
 assert.deepEqual(errors,[]);fs.writeFileSync(dir+'/browser.json',JSON.stringify({checks,errors,provider:'local fixtures; real database checked separately'},null,2));console.log('PASS '+checks.join('; '));
}catch(error){
 console.error(JSON.stringify({errors,a:await a.evaluate(()=>({busy:LongchampArticles.busy,focus:document.activeElement?.tagName+'#'+document.activeElement?.id,modal:!!document.querySelector('#lc-review-dialog'),drawer:!!document.querySelector('.idr.on')}))},null,2));await a.screenshot({path:'/private/tmp/longchamp-review-failure.png',fullPage:true});throw error;
}finally{await browser.close();server.close();}
