'use strict';
// A temporary corporate identity, intercepted mail transport, no shared client data changes.
const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {createEmailCode}=require('../server/email-code.cjs'),{createSessionProof,sessionClaims}=require('../server/session-proof.cjs'),{createServer}=require('../scripts/dev.cjs');
async function main(){
 if(!process.argv.includes('--apply-test'))throw new Error('Use --apply-test; the temporary identity is removed in finally.');
 const env=Object.fromEntries(fs.readFileSync('.env.local','utf8').trim().split('\n').map(v=>v.split(/=(.*)/s).slice(0,2)));
 const config={url:env.SUPABASE_URL,key:env.SUPABASE_ANON_KEY,serviceKey:env.SUPABASE_SERVICE_ROLE_KEY,resendKey:env.RESEND_API_KEY,fromEmail:env.RESEND_FROM_EMAIL};assert.equal(config.url,'https://tuzjcmvlclpfuroqnuis.supabase.co');
 async function admin(path,method='GET',body){const r=await fetch(config.url+path,{method,headers:{apikey:config.serviceKey,Authorization:'Bearer '+config.serviceKey,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});assert(r.ok,'Admin HTTP '+r.status);return r.json().catch(()=>null);}
 const idx=process.argv.indexOf('--base-url');let server,browser,identity,message;
 if(idx<0){server=createServer({config});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));}
 const base=idx<0?'http://127.0.0.1:'+server.address().port:process.argv[idx+1],email='codex-longchamp-session-'+crypto.randomBytes(8).toString('hex')+'@cleolabs.co',checks=[];
 try{
  const otp=createEmailCode({config,fetchImpl:async(url,options)=>{if(new URL(url).hostname==='api.resend.com'){message=JSON.parse(options.body);return new Response(JSON.stringify({id:'intercepted'}),{status:200});}return fetch(url,options);}});
  const challenge=await otp.requestCode(email);identity=(await admin('/rest/v1/rpc/longchamp_find_login_user','POST',{p_email:email}))[0];
  const session=await otp.verifyCode(challenge.challenge,message.text.match(/\b(\d{6,10})\b/)[1]),proof=createSessionProof(config.serviceKey,session.access_token,identity.user_id),claims=sessionClaims(session.access_token,identity.user_id);
  const puppeteer=(await import('/Users/naomiehalioua/cleo-lvmh-demo-build/maj-2610/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js')).default;
  browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});const context=await browser.createBrowserContext(),page=await context.newPage(),errors=[];let codeRequests=0;
  page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(request.url().includes('action=request-code'))codeRequests++;});
  await context.setCookie(...[{name:'lc_access',value:session.access_token},{name:'lc_refresh',value:session.refresh_token},{name:'lc_otp',value:proof}].map(c=>({...c,url:base,httpOnly:true,secure:base.startsWith('https:')})));
  async function enter(){await page.goto(base+'/#suivis',{waitUntil:'networkidle0'});await page.waitForSelector('#content');assert.equal(new URL(page.url()).pathname,'/app');assert.equal(new URL(page.url()).hash,'#suivis');}
  await enter();await enter();checks.push('native recent session resumes from root repeatedly with the requested destination');
  await context.deleteCookie(...(await context.cookies()).filter(c=>c.name==='lc_access'));await enter();assert((await context.cookies()).some(c=>c.name==='lc_access'));checks.push('native refresh cookie renews expired access without requesting a code');
  await admin('/rest/v1/longchamp_otp_sessions?session_id=eq.'+claims.session_id+'&user_id=eq.'+identity.user_id,'PATCH',{expires_at:new Date(Date.now()-60000).toISOString()});
  await page.goto(base+'/',{waitUntil:'domcontentloaded'});await page.waitForSelector('#login:not([hidden])');assert.equal(new URL(page.url()).pathname,'/');assert.equal(codeRequests,0);assert.deepEqual(errors,[]);checks.push('expired native OTP approval requires login; no automatic code sent');
 }finally{
  if(browser)await browser.close();
  identity=identity||(await admin('/rest/v1/rpc/longchamp_find_login_user','POST',{p_email:email}))[0];if(identity)await admin('/auth/v1/admin/users/'+identity.user_id,'DELETE');
  const hash=crypto.createHmac('sha256',config.serviceKey).update('longchamp-code-request:'+email).digest('hex');await admin('/rest/v1/longchamp_login_throttles?email_hash=eq.'+hash,'DELETE');assert.deepEqual(await admin('/rest/v1/rpc/longchamp_find_login_user','POST',{p_email:email}),[]);
  if(server)await new Promise(resolve=>server.close(resolve));
 }
 const dir=process.env.LONGCHAMP_REPORT_DIR||'/Users/naomiehalioua/reports/longchamp-session-2026-11-03';fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(dir+'/'+(idx<0?'native-live':'production-live')+'.json',JSON.stringify({base,checks,temporary_identity_removed:true,corporate_emails_sent:false,shared_data_modified:false},null,2));console.log('PASS '+checks.join('; ')+'; temporary identity removed');
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
