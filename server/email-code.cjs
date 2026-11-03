'use strict';
const crypto=require('node:crypto');
const {sessionClaims}=require('./session-proof.cjs');
const invalid='Code incorrect ou expiré. Demandez un nouveau code si nécessaire.';
const allowedDomains=new Set(['cleolabs.co','longchamp.co']);
function authError(status,message){return Object.assign(new Error(message),{status});}
function createEmailCode({config,fetchImpl=globalThis.fetch}){
 const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
 const checkConfig=()=>{if(!config.url||!config.key||!config.serviceKey||!config.resendKey||!config.fromEmail)throw authError(503,'L’envoi des codes est temporairement indisponible.');};
 const request=async(endpoint,{method='GET',body,admin=false,headers={}}={})=>{
  const key=admin?config.serviceKey:config.key;
  const response=await fetchImpl(config.url+endpoint,{method,headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',...headers},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
  const data=await response.json().catch(()=>null);return {ok:response.ok,status:response.status,data};
 };
 const requireSuccess=result=>{if(!result.ok)throw authError(503,'La connexion est temporairement indisponible. Réessayez dans quelques instants.');return result.data;};
 return {
  async requestCode(rawEmail){
   checkConfig();const email=typeof rawEmail==='string'?rawEmail.trim().toLowerCase():'';
   if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw authError(400,'Renseignez une adresse e-mail valide.');
   const emailKey=crypto.createHmac('sha256',config.serviceKey).update('longchamp-code-request:'+email).digest('hex');
   const budget=await request('/rest/v1/rpc/longchamp_throttle_login',{method:'POST',admin:true,body:{p_email_hash:emailKey}});
   if(budget.status===429)throw authError(429,'Patientez une minute avant de demander un nouveau code.');requireSuccess(budget);
   const challenge=crypto.randomBytes(32).toString('base64url'),challengeHash=hash(challenge);
   const findUser=async()=>requireSuccess(await request('/rest/v1/rpc/longchamp_find_login_user',{method:'POST',admin:true,body:{p_email:email}}))[0];
   let account=await findUser();
   // Existing invitations remain valid; automatic access is limited to exact domains.
   if(!account?.is_member&&!allowedDomains.has(email.split('@')[1]))return {challenge};
   if(!account){
    const created=await request('/auth/v1/admin/users',{method:'POST',admin:true,body:{email}});
    if(created.ok&&created.data?.id)account={user_id:created.data.id,is_member:false};
    else{account=await findUser();if(!account)requireSuccess(created);}
   }
   if(!account?.user_id)throw authError(503,'La création de votre accès est temporairement indisponible.');
   if(!account.is_member)requireSuccess(await request('/rest/v1/longchamp_members?on_conflict=user_id',{method:'POST',admin:true,body:{user_id:account.user_id},headers:{Prefer:'resolution=ignore-duplicates,return=minimal'}}));
   const started=await request('/rest/v1/rpc/longchamp_begin_login',{method:'POST',admin:true,body:{p_user_id:account.user_id,p_challenge_hash:challengeHash}});
   if(started.status===429)throw authError(429,'Patientez une minute avant de demander un nouveau code.');
   const records=requireSuccess(started);if(!records?.length)throw authError(503,'La connexion est temporairement indisponible.');
   const generated=requireSuccess(await request('/auth/v1/admin/generate_link',{method:'POST',admin:true,body:{type:'magiclink',email}}));
   const code=generated.email_otp;
   if(!/^\d{6,10}$/.test(code)||(generated.user?.id||generated.id)!==account.user_id)throw authError(503,'La génération du code est temporairement indisponible.');
   const message='Votre code de connexion à l’espace Longchamp est : '+code+'.\n\nCe code est valable 10 minutes et ne peut être utilisé qu’une seule fois.\nSi vous n’avez pas demandé ce code, ignorez ce message.';
   const sent=await fetchImpl('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+config.resendKey,'Content-Type':'application/json','Idempotency-Key':'longchamp-login-'+challengeHash},body:JSON.stringify({from:config.fromEmail,to:[email],subject:'Votre code de connexion Longchamp',text:message,html:'<div style="font-family:Arial,sans-serif;color:#18181b;max-width:480px;margin:auto;padding:32px"><p>Cleo × Longchamp</p><h1 style="font-size:24px">Votre code de connexion</h1><p style="font-size:36px;letter-spacing:8px;font-weight:600">'+code+'</p><p>Valable 10 minutes, pour une seule connexion.</p><p>Si vous n’avez pas demandé ce code, ignorez ce message.</p></div>'}),signal:AbortSignal.timeout(15000)});
   if(!sent.ok)throw authError(503,'Le code n’a pas pu être envoyé. Réessayez dans une minute.');
   requireSuccess(await request('/rest/v1/longchamp_login_codes?challenge_hash=eq.'+challengeHash,{method:'PATCH',admin:true,body:{delivered:true}}));
   return {challenge};
  },
  async verifyCode(challenge,code){
   checkConfig();if(typeof code!=='string'||!/^\d{6,10}$/.test(code))throw authError(400,'Saisissez le code reçu par e-mail.');
   if(typeof challenge!=='string'||!/^[\w-]{1,100}$/.test(challenge))throw authError(401,invalid);
   const challengeHash=hash(challenge);
   const attempts=requireSuccess(await request('/rest/v1/rpc/longchamp_try_login',{method:'POST',admin:true,body:{p_challenge_hash:challengeHash}}));
   if(!attempts?.length)throw authError(401,invalid);
   const member=attempts[0];
   const verified=await request('/auth/v1/verify',{method:'POST',body:{email:member.email,token:code,type:'email'}});
   if(!verified.ok){if(verified.status===429)throw authError(429,'Trop de tentatives. Demandez un nouveau code dans quelques instants.');if(verified.status>=500)throw authError(503,'La vérification est temporairement indisponible.');throw authError(401,invalid);}
   const session=verified.data;
   const complete=await request('/rest/v1/rpc/longchamp_complete_login',{method:'POST',admin:true,body:{p_challenge_hash:challengeHash}});
   if(session.user?.id!==member.user_id||!complete.ok||complete.data!==true){
    await fetchImpl(config.url+'/auth/v1/logout?scope=local',{method:'POST',headers:{apikey:config.key,Authorization:'Bearer '+session.access_token},signal:AbortSignal.timeout(15000)});
    throw authError(401,invalid);
   }
   const claims=sessionClaims(session.access_token,session.user.id);if(!claims)throw authError(503,'La session n’a pas pu être créée. Demandez un nouveau code.');
   requireSuccess(await request('/rest/v1/longchamp_otp_sessions',{method:'POST',admin:true,body:{session_id:claims.session_id,user_id:session.user.id}}));
   return session;
  },
  async revokeSession(token){
   // Called only after GoTrue successfully authenticated and revoked this token.
   let claims;try{claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString());}catch{return;}
   if(typeof claims.session_id!=='string'||typeof claims.sub!=='string')return;
   requireSuccess(await request('/rest/v1/longchamp_otp_sessions?session_id=eq.'+encodeURIComponent(claims.session_id)+'&user_id=eq.'+encodeURIComponent(claims.sub),{method:'DELETE',admin:true}));
  }
 };
}
module.exports={createEmailCode};
