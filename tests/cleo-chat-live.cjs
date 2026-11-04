'use strict';
// Real service call. Temporary login identity; only the code email transport is intercepted.
const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {createEmailCode}=require('../server/email-code.cjs'),{createSessionProof}=require('../server/session-proof.cjs'),{createServer}=require('../scripts/dev.cjs');
async function main(){
 if(!process.argv.includes('--apply-test'))throw new Error('Use --apply-test for a real Cleo Chat turn and temporary identity.');
 const env=Object.fromEntries(fs.readFileSync('.env.local','utf8').trim().split('\n').filter(l=>l&&!l.startsWith('#')).map(l=>l.split(/=(.*)/s).slice(0,2)));
 const config={url:env.SUPABASE_URL,key:env.SUPABASE_ANON_KEY,serviceKey:env.SUPABASE_SERVICE_ROLE_KEY,resendKey:env.RESEND_API_KEY,fromEmail:env.RESEND_FROM_EMAIL,chatSecret:env.CLEO_CHAT_CONSUMER_SECRET,chatOrganizationId:env.CLEO_CHAT_ORGANIZATION_ID};assert.equal(config.url,'https://tuzjcmvlclpfuroqnuis.supabase.co');
 async function admin(path,method='GET',body){const r=await fetch(config.url+path,{method,headers:{apikey:config.serviceKey,Authorization:'Bearer '+config.serviceKey,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});assert(r.ok,'Admin HTTP '+r.status);return r.json().catch(()=>null);}
 const idx=process.argv.indexOf('--base-url'),dir=process.env.LONGCHAMP_REPORT_DIR||'/Users/naomiehalioua/reports/longchamp-chat-2026-11-04';fs.mkdirSync(dir,{recursive:true});
 let server,browser,identity,message,apiCalls=0;const email='codex-longchamp-chat-'+crypto.randomBytes(8).toString('hex')+'@cleolabs.co';
 if(idx<0){config.chatOrganizationId=crypto.randomUUID();server=createServer({config,fetchImpl:async(url,options)=>{if(new URL(url).pathname==='/api/v1/conversation')apiCalls++;return fetch(url,options);}});await new Promise(r=>server.listen(0,'127.0.0.1',r));}
 const base=idx<0?'http://127.0.0.1:'+server.address().port:process.argv[idx+1],question='Quel texte européen encadre l’étiquetage de composition des produits textiles vendus en France ? Cite les articles utiles sans conclure à la conformité d’un produit.';
 let result;
 try{
  const otp=createEmailCode({config,fetchImpl:async(url,options)=>{if(new URL(url).hostname==='api.resend.com'){message=JSON.parse(options.body);return new Response(JSON.stringify({id:'intercepted'}),{status:200});}return fetch(url,options);}});
  const challenge=await otp.requestCode(email);identity=(await admin('/rest/v1/rpc/longchamp_find_login_user','POST',{p_email:email}))[0];const session=await otp.verifyCode(challenge.challenge,message.text.match(/\b(\d{6,10})\b/)[1]);
  fs.writeFileSync(dir+'/'+(idx<0?'native':'production')+'-scope.json',JSON.stringify({consumer:'longchamp',organizationId:config.chatOrganizationId,actorId:identity.user_id,testOrganization:idx<0},null,2));
  const puppeteer=(await import('/Users/naomiehalioua/cleo-lvmh-demo-build/maj-2610/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js')).default;browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});const context=await browser.createBrowserContext(),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await context.setCookie(...[{name:'lc_access',value:session.access_token},{name:'lc_otp',value:createSessionProof(config.serviceKey,session.access_token,identity.user_id)}].map(c=>({...c,url:base,httpOnly:true,secure:base.startsWith('https:')})));
  await page.setViewport({width:1440,height:1000});await page.goto(base+'/app',{waitUntil:'networkidle0'});await page.evaluate(()=>{select('prod:textile');toggleChat60(true);});await page.waitForFunction(()=>document.querySelector('.cpanel.on')?.getBoundingClientRect().right<=innerWidth+.5);await page.type('.cpanel #chati',question);await page.click('.cpanel .chat-f [type=submit]');console.log('Question envoyée au moteur Cleo Chat ; attente de la réponse finale.');
  await page.waitForSelector('.lc-chat-answer,.lc-chat-error',{timeout:300000});
  const error=await page.$('.lc-chat-error');if(error)throw new Error(await error.evaluate(e=>e.textContent));
  const content=await page.$eval('.lc-chat-answer',e=>e.innerText),sources=await page.$$eval('.lc-chat-sources article',els=>els.map(e=>({title:e.querySelector('b')?.textContent,quote:e.querySelector('blockquote')?.textContent,url:e.querySelector('a')?.href||null})));
  assert(content.trim().length>30);assert(sources.length>0,'No cited source returned');assert.deepEqual(errors,[]);if(idx<0)assert.equal(apiCalls,1);
  await page.click('.lc-chat-sources summary');await page.screenshot({path:dir+'/'+(idx<0?'native':'production')+'-chat.png',fullPage:true});result={base,question,content,sources,errors,native_signed_service:true,regulatory_accuracy:'integration smoke only; no general legal validation'};
 }finally{
  if(browser)await browser.close();identity=identity||(await admin('/rest/v1/rpc/longchamp_find_login_user','POST',{p_email:email}))[0];if(identity)await admin('/auth/v1/admin/users/'+identity.user_id,'DELETE');const hash=crypto.createHmac('sha256',config.serviceKey).update('longchamp-code-request:'+email).digest('hex');await admin('/rest/v1/longchamp_login_throttles?email_hash=eq.'+hash,'DELETE');assert.deepEqual(await admin('/rest/v1/rpc/longchamp_find_login_user','POST',{p_email:email}),[]);if(server)await new Promise(r=>server.close(r));
 }
 fs.writeFileSync(dir+'/'+(idx<0?'native-live':'production-live')+'.json',JSON.stringify({...result,temporary_login_removed:true,corporate_emails_sent:false,shared_follows_modified:false},null,2));console.log('PASS : vraie réponse Cleo Chat et sources rendues dans le navigateur ; identité de connexion temporaire supprimée.');
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
