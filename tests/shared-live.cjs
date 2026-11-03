'use strict';
// Explicit operator check: ephemeral accounts and Resend test recipients only; cleanup in finally.
const assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),{execFileSync}=require('node:child_process');
async function main(){
 if(!process.argv.includes('--apply-test'))throw new Error('Pass --apply-test to create and remove temporary test identities.');
 const preview=process.argv.find(s=>s.startsWith('https://cleo-longchamp-demo'));if(!preview)throw new Error('Expected Longchamp preview URL.');
 const keys=JSON.parse(execFileSync('supabase',['projects','api-keys','--project-ref','tuzjcmvlclpfuroqnuis','-o','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
 const readKey=process.env.RESEND_TEST_READ_KEY;if(!readKey)throw new Error('RESEND_TEST_READ_KEY required to inspect test deliveries without logging codes.');
 const anon=keys.find(k=>k.name==='anon').api_key;
 const key=keys.find(k=>k.name==='service_role').api_key,base='https://tuzjcmvlclpfuroqnuis.supabase.co';
 async function admin(endpoint,method='GET',body){const r=await fetch(base+endpoint,{method,headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});if(!r.ok)throw new Error('Test setup/cleanup HTTP '+r.status);const text=await r.text();return text?JSON.parse(text):null;}
 function remote(route,{method='GET',body,cookie}={}){
  const args=['curl',route,'--deployment',preview,'--scope','cleo-academys-projects','--','--silent','--show-error','--include','--max-time','30','--request',method];
  if(body)args.push('--header','Content-Type: application/json','--header','Origin: '+preview,'--data',JSON.stringify(body));if(cookie)args.push('--header','Cookie: '+cookie);
  const raw=execFileSync('vercel',args,{encoding:'utf8',maxBuffer:14000000,stdio:['ignore','pipe','pipe'],timeout:45000});
  const boundary=raw.indexOf('\r\n\r\n'),headers=raw.slice(0,boundary),content=raw.slice(boundary+4);return {status:Number(headers.match(/HTTP\S*\s+(\d+)/)[1]),headers,body:content};
 }

 async function native(endpoint,body,token){const r=await fetch(base+endpoint,{method:body?'POST':'GET',headers:{apikey:anon,Authorization:'Bearer '+(token||anon),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const text=await r.text();return {status:r.status,data:text?JSON.parse(text):null};}
 async function receivedCode(email){
  for(let attempt=0;attempt<8;attempt++){
   const list=await fetch('https://api.resend.com/emails',{headers:{Authorization:'Bearer '+readKey}});assert.equal(list.status,200);const messages=await list.json();
   const sent=messages.data.find(m=>m.to.includes(email)&&m.subject==='Votre code de connexion Longchamp');
   if(sent){const response=await fetch('https://api.resend.com/emails/'+sent.id,{headers:{Authorization:'Bearer '+readKey}});assert.equal(response.status,200);const message=await response.json();const match=(message.text||'').match(/\b(\d{6,10})\b/);assert(match,'Missing code in test email');return match[1];}
   await new Promise(resolve=>setTimeout(resolve,1000));
  }
  throw new Error('Test email not found at provider');
 }
 const cookieFrom=r=>[...r.headers.matchAll(/^set-cookie:\s*([^;\r\n]+)/gmi)].map(m=>m[1]).join('; ');

 const members=await admin('/rest/v1/longchamp_members?select=user_id');assert.equal(members.length,0,'Do not run this test once real members are enrolled.');
 const snapshot=(await admin('/rest/v1/longchamp_watch_state?id=eq.longchamp&select=*'))[0];assert.deepEqual(snapshot.follows,[],'Do not run on populated client state.');
 const suffix=crypto.randomBytes(5).toString('hex'),users=[],checks=[];let wrote=false;
 try{
  for(let i=0;i<2;i++){const password=crypto.randomBytes(24).toString('base64url'),email='delivered+longchamp-'+suffix+'-'+i+'@resend.dev';const user=await admin('/auth/v1/admin/users','POST',{email,password,email_confirm:true});users.push({id:user.id,email,password});await admin('/rest/v1/longchamp_members','POST',{user_id:user.id});}
  const cookies=[];
  for(const user of users){
   const external=await native('/auth/v1/token?grant_type=password',{email:user.email,password:user.password});assert.equal(external.status,200);
   const forbidden=await native('/rest/v1/longchamp_watch_state?select=follows',null,external.data.access_token);assert.equal(forbidden.status,200);assert.deepEqual(forbidden.data,[]);
   const requested=remote('/api/application?action=request-code',{method:'POST',body:{email:user.email}});assert.equal(requested.status,202,JSON.parse(requested.body).error||'Code request failed');const challenge=cookieFrom(requested);assert(challenge.includes('lc_challenge='));
   const code=await receivedCode(user.email);assert(!requested.body.includes(code));
   const verified=remote('/api/application?action=verify-code',{method:'POST',cookie:challenge,body:{code}});assert.equal(verified.status,200);const cookie=cookieFrom(verified);assert(cookie.includes('lc_access=')&&cookie.includes('lc_otp='));cookies.push(cookie);
   const replay=remote('/api/application?action=verify-code',{method:'POST',cookie:challenge,body:{code}});assert.equal(replay.status,401);
  }
  checks.push('real email-code authentication for both temporary members; provider test recipients only');
  checks.push('native password JWT cannot read data directly before OTP session approval; OTP replay rejected');
  const withoutProof=cookies[0].split('; ').filter(v=>!v.startsWith('lc_otp=')).join('; ');assert.equal(remote('/api/application?action=state',{cookie:withoutProof}).status,401);checks.push('native token without browser OTP proof rejected');
  let r=remote('/app',{cookie:cookies[0]});assert.equal(r.status,200);assert(r.body.includes('window.LONGCHAMP_SHARED='));assert(r.body.includes('Suivis communs à l’équipe'));checks.push('authenticated HTML and generated files bundled on Vercel');
  r=remote('/sources',{cookie:cookies[0]});assert.equal(r.status,200);assert(r.body.includes('sources')||r.body.includes('Sources'));checks.push('authenticated source page');
  const follow={id:'live-'+suffix,kind:'substance',value:'50-00-0',markets:['EU'],products:['pliage'],paused:false,includeRelated:false};
  r=remote('/api/application?action=state',{method:'PUT',cookie:cookies[0],body:{revision:snapshot.revision,follows:[follow]}});assert.equal(r.status,200);wrote=true;
  r=remote('/api/application?action=state',{cookie:cookies[1]});assert.equal(r.status,200);const shared=JSON.parse(r.body);assert.equal(shared.follows[0].id,follow.id);checks.push('first account writes, second account reads same real database record');
  r=remote('/api/application?action=state',{method:'PUT',cookie:cookies[1],body:{revision:snapshot.revision,follows:[]}});assert.equal(r.status,409);checks.push('real conflicting edit rejected');
  const parts=Object.fromEntries(cookies[0].split('; ').map(v=>v.split(/=(.*)/s).slice(0,2)));
  const renewed=await native('/auth/v1/token?grant_type=refresh_token',{refresh_token:decodeURIComponent(parts.lc_refresh)});assert.equal(renewed.status,200);
  cookies[0]='lc_access='+renewed.data.access_token+'; lc_refresh='+renewed.data.refresh_token+'; lc_otp='+parts.lc_otp;
  assert.equal(remote('/api/application?action=state',{cookie:cookies[0]}).status,200);checks.push('refreshed access retains the approved OTP session and browser proof');
  const refreshOnly=cookies[0].split('; ').find(s=>s.startsWith('lc_refresh='));
  r=remote('/api/application?action=logout',{method:'POST',cookie:refreshOnly,body:{}});assert.equal(r.status,200);
  r=remote('/api/application?action=state',{cookie:cookies[0]});assert.equal(r.status,401);checks.push('refresh-only logout revokes actual Supabase session; previous access rejected');
  const revokedData=await native('/rest/v1/longchamp_watch_state?select=follows',null,renewed.data.access_token);assert.equal(revokedData.status,200);assert.deepEqual(revokedData.data,[]);checks.push('logout also revokes direct database access');
 }finally{
  if(wrote){const current=(await admin('/rest/v1/longchamp_watch_state?id=eq.longchamp&select=*'))[0];assert(current.follows.every(f=>f.id==='live-'+suffix),'Concurrent data appeared: refusing to overwrite it');await admin('/rest/v1/longchamp_watch_state?id=eq.longchamp','PATCH',{follows:snapshot.follows,revision:snapshot.revision,updated_at:snapshot.updated_at,updated_by:snapshot.updated_by});}
  for(const u of users){const emailHash=crypto.createHmac('sha256',key).update('longchamp-code-request:'+u.email).digest('hex');await admin('/rest/v1/longchamp_login_throttles?email_hash=eq.'+emailHash,'DELETE');await admin('/auth/v1/admin/users/'+u.id,'DELETE');}
 }
 assert.equal((await admin('/rest/v1/longchamp_members?select=user_id')).length,0);assert.deepEqual((await admin('/rest/v1/longchamp_watch_state?id=eq.longchamp&select=follows'))[0].follows,[]);checks.push('temporary identities removed and initial empty state restored');
 const report={preview,checks,provider:'real Vercel, Supabase and Resend',emails_sent:true,test_recipients_only:true,codes_recorded:false};
 fs.mkdirSync('/Users/naomiehalioua/reports/longchamp-otp-2026-11-03',{recursive:true});fs.writeFileSync('/Users/naomiehalioua/reports/longchamp-otp-2026-11-03/'+(preview==='https://cleo-longchamp-demo.vercel.app'?'production-live':'preview-live')+'.json',JSON.stringify(report,null,2));console.log('PASS '+checks.join('; '));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
