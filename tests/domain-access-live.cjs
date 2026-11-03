'use strict';
// Real Supabase auto-enrolment; email transport intercepted, no corporate test mail sent.
const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {createEmailCode}=require('../server/email-code.cjs');
async function main(){
 if(!process.argv.includes('--apply-test'))throw new Error('Pass --apply-test for temporary corporate-domain accounts, cleaned in finally.');
 const values=Object.fromEntries(fs.readFileSync('.env.local','utf8').trim().split('\n').map(v=>v.split(/=(.*)/s).slice(0,2)));
 const config={url:values.SUPABASE_URL,key:values.SUPABASE_ANON_KEY,serviceKey:values.SUPABASE_SERVICE_ROLE_KEY,resendKey:values.RESEND_API_KEY,fromEmail:values.RESEND_FROM_EMAIL};
 assert.equal(config.url,'https://tuzjcmvlclpfuroqnuis.supabase.co');
 async function admin(endpoint,method='GET',body){const r=await fetch(config.url+endpoint,{method,headers:{apikey:config.serviceKey,Authorization:'Bearer '+config.serviceKey,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});if(!r.ok)throw new Error('Database test HTTP '+r.status);const t=await r.text();return t?JSON.parse(t):null;}
 const checks=[];
 for(const domain of ['cleolabs.co','longchamp.co']){
  const email='codex-longchamp-domain-'+crypto.randomBytes(8).toString('hex')+'@'+domain;let identity;let message;
  assert.deepEqual(await admin('/rest/v1/rpc/longchamp_find_login_user','POST',{p_email:email}),[]);
  const fetchImpl=async(url,options)=>{
   if(new URL(url).hostname==='api.resend.com'){message=JSON.parse(options.body);return new Response(JSON.stringify({id:'intercepted-test-delivery'}),{status:200});}
   return fetch(url,options);
  };
  try{
   const otp=createEmailCode({config,fetchImpl}),requested=await otp.requestCode(email);
   identity=(await admin('/rest/v1/rpc/longchamp_find_login_user','POST',{p_email:email}))[0];assert(identity?.is_member);assert.deepEqual(message.to,[email]);
   assert.deepEqual(await admin('/rest/v1/longchamp_otp_sessions?user_id=eq.'+identity.user_id),[],'Enrolment must not approve a data session before code verification');
   const code=message.text.match(/\b(\d{6,10})\b/)[1];const session=await otp.verifyCode(requested.challenge,code);assert.equal(session.user.id,identity.user_id);
   const approved=await admin('/rest/v1/longchamp_otp_sessions?user_id=eq.'+identity.user_id);assert.equal(approved.length,1);
   checks.push({domain,auto_enrolment:true,native_code_verification:true,session_approved_only_after_verification:true,email_transport:'intercepted; no external message'});
  }finally{
   identity=identity||(await admin('/rest/v1/rpc/longchamp_find_login_user','POST',{p_email:email}))[0];
   const emailHash=crypto.createHmac('sha256',config.serviceKey).update('longchamp-code-request:'+email).digest('hex');await admin('/rest/v1/longchamp_login_throttles?email_hash=eq.'+emailHash,'DELETE');
   if(identity)await admin('/auth/v1/admin/users/'+identity.user_id,'DELETE');
   assert.deepEqual(await admin('/rest/v1/rpc/longchamp_find_login_user','POST',{p_email:email}),[]);
  }
 }
 const dir='/Users/naomiehalioua/reports/longchamp-domains-2026-11-03';fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(dir+'/native-live.json',JSON.stringify({checks,temporary_accounts_removed:true,corporate_emails_sent:false,codes_recorded:false},null,2));console.log('PASS : both exact domains auto-enrol on real Supabase; native code verification and session gate pass; email transport intercepted; temporary accounts removed.');
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
