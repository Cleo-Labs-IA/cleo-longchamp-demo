'use strict';
// Temporary identities only. No corporate test mail, no shared-follow mutation.
const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {createEmailCode}=require('../server/email-code.cjs'),{createSessionProof}=require('../server/session-proof.cjs');
const {createServer}=require('../scripts/dev.cjs');
async function main(){
 if(!process.argv.includes('--apply-test'))throw new Error('Use --apply-test; temporary identities are removed in finally.');
 const env=Object.fromEntries(fs.readFileSync('.env.local','utf8').trim().split('\n').map(v=>v.split(/=(.*)/s).slice(0,2)));
 const config={url:env.SUPABASE_URL,key:env.SUPABASE_ANON_KEY,serviceKey:env.SUPABASE_SERVICE_ROLE_KEY,resendKey:env.RESEND_API_KEY,fromEmail:env.RESEND_FROM_EMAIL};
 assert.equal(config.url,'https://tuzjcmvlclpfuroqnuis.supabase.co');
 async function admin(path,method='GET',body){const r=await fetch(config.url+path,{method,headers:{apikey:config.serviceKey,Authorization:'Bearer '+config.serviceKey,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const data=await r.json().catch(()=>null);assert(r.ok,'Admin HTTP '+r.status);return data;}
 const liveIndex=process.argv.indexOf('--base-url');let server;
 if(liveIndex<0){server=createServer({config});await new Promise(r=>server.listen(0,'127.0.0.1',r));}
 const base=liveIndex<0?'http://127.0.0.1:'+server.address().port:process.argv[liveIndex+1];assert(base);
 const users=[],checks=[];let currentEmail;
 async function call(user,action,method='GET',body){const r=await fetch(base+'/api/application?action='+action,{method,headers:{Cookie:user.cookie,Origin:new URL(base).origin,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};}
 try{
  for(const domain of ['cleolabs.co','longchamp.co']){
   currentEmail='codex-longchamp-feedback-'+crypto.randomBytes(8).toString('hex')+'@'+domain;
   const u={email:currentEmail};users.push(u);let message;
   const otp=createEmailCode({config,fetchImpl:async(url,options)=>{if(new URL(url).hostname==='api.resend.com'){message=JSON.parse(options.body);return new Response(JSON.stringify({id:'intercepted'}),{status:200});}return fetch(url,options);}});
   const challenge=await otp.requestCode(currentEmail);u.id=(await admin('/rest/v1/rpc/longchamp_find_login_user','POST',{p_email:currentEmail}))[0].user_id;
   const session=await otp.verifyCode(challenge.challenge,message.text.match(/\b(\d{6,10})\b/)[1]);
   u.token=session.access_token;u.cookie='lc_access='+session.access_token+'; lc_otp='+createSessionProof(config.serviceKey,session.access_token,u.id);
  }
  const [a,b]=users,key='fr-empco-transposition';
  const html=await fetch(base+'/app',{headers:{Cookie:a.cookie}});assert.equal(html.status,200);assert((await html.text()).includes('src="/article-feedback.js"'));checks.push('authenticated page loads favorites and review UI');
  assert.equal((await call(a,'favorite','PUT',{article_key:key,favorite:true})).status,200);
  let aState=await call(a,'articles'),bState=await call(b,'articles');assert.equal(aState.status,200);assert(aState.data.favorites.includes(key));assert(!bState.data.favorites.includes(key));checks.push('personal favorite stored on real database and isolated');
  let r=await call(a,'review','PUT',{article_key:key,reaction:'like',rating:4,comment:'Temporary verification; remove with test identity.',revision:0});assert.equal(r.status,200);
  r=await call(b,'review','PUT',{article_key:key,reaction:'dislike',rating:2,comment:'Independent author verification.',revision:0});assert.equal(r.status,200);
  bState=await call(b,'articles');const ours=bState.data.reviews.filter(r=>users.some(u=>u.id===r.author_id)&&r.article_key===key);assert.equal(ours.length,2);assert.equal(ours.find(r=>r.author_id===a.id).reaction,'like');checks.push('opposite reactions, ratings and reasons shared by independent authors');
  assert.equal((await call(a,'review','PUT',{article_key:key,reaction:'dislike',rating:1,comment:'Stale',revision:0})).status,409);checks.push('stale review rejected by real SQL revision check');
  if(process.argv.includes('--browser')){
   const puppeteer=(await import('/Users/naomiehalioua/cleo-lvmh-demo-build/maj-2610/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js')).default;
   const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
   try{
    const context=await browser.createBrowserContext(),page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
    await context.setCookie(...a.cookie.split('; ').map(pair=>{const [name,value]=pair.split('=');return {name,value,url:base,httpOnly:true,secure:base.startsWith('https:')};}));
    await page.setViewport({width:1440,height:1000});await page.goto(base+'/app',{waitUntil:'networkidle0'});await page.waitForFunction(()=>window.LongchampArticles?.ready);
    await page.evaluate(key=>openSig(SIG.find(s=>s.raw===key).id),key);await page.waitForFunction(()=>document.querySelector('.idr.on')?.getBoundingClientRect().right<=innerWidth+.5);
    assert(await page.$eval('#lc-article-detail',el=>el.innerText.includes('Independent author verification.')));
    await page.setViewport({width:390,height:844});await page.click('#lc-article-detail [data-lc-edit]');await page.$eval('#lc-review-comment',el=>el.value='Production browser verification.');await page.select('#lc-review-rating','5');await page.click('#lc-review-form [type=submit]');await page.waitForFunction(()=>!document.getElementById('lc-review-dialog'));await page.waitForFunction(()=>!LongchampArticles.busy);
    assert(await page.$eval('#lc-article-detail',el=>el.innerText.includes('Production browser verification.')));assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.click('#lc-article-detail [data-lc-favorite]');await page.waitForFunction(()=>!LongchampArticles.busy);assert(!(await call(a,'articles')).data.favorites.includes(key));assert.deepEqual(errors,[]);
    checks.push('real browser on target: shared review rendered, mobile rating/comment saved and favorite removed');
   }finally{await browser.close();}
  }
  const ownReview=(await call(a,'articles')).data.reviews.find(r=>r.author_id===a.id&&r.article_key===key);
  assert.equal((await call(a,'review','PUT',{article_key:key,reaction:null,rating:null,comment:'',revision:ownReview.revision})).status,200);
  assert.equal((await call(a,'favorite','PUT',{article_key:key,favorite:false})).status,200);
  aState=await call(a,'articles');assert(!aState.data.favorites.includes(key));assert.equal(aState.data.reviews.find(r=>r.author_id===a.id&&r.article_key===key).comment,'');assert(aState.data.reviews.find(r=>r.author_id===b.id&&r.article_key===key).comment);checks.push('own review and favorite removed without altering other author');
  const anon=await fetch(base+'/api/application?action=articles');assert.equal(anon.status,401);checks.push('anonymous review access refused');
 }finally{
  for(const u of users){
   const match=(await admin('/rest/v1/rpc/longchamp_find_login_user','POST',{p_email:u.email}))[0];
   if(match)await admin('/auth/v1/admin/users/'+match.user_id,'DELETE');
   const hash=crypto.createHmac('sha256',config.serviceKey).update('longchamp-code-request:'+u.email).digest('hex');await admin('/rest/v1/longchamp_login_throttles?email_hash=eq.'+hash,'DELETE');
   assert.deepEqual(await admin('/rest/v1/rpc/longchamp_find_login_user','POST',{p_email:u.email}),[]);
  }
  if(server)await new Promise(r=>server.close(r));
 }
 const dir=process.env.LONGCHAMP_REPORT_DIR||'/Users/naomiehalioua/reports/longchamp-feedback-2026-11-03';fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(dir+'/'+(liveIndex<0?'native-live':'production-live')+'.json',JSON.stringify({base,checks,temporary_accounts_removed:true,corporate_emails_sent:false,shared_follows_modified:false},null,2));console.log('PASS '+checks.join('; ')+'; temporary identities removed');
}
main().catch(err=>{console.error(err.message);process.exitCode=1;});
