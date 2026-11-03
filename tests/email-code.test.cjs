const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createEmailCode}=require('../server/email-code.cjs');
function fixture(){
 let row=null,mail=[],generated=0,verified=0,used=false,failMail=false;const requests=new Set();
 const config={url:'https://fixture.invalid',key:'public-test',serviceKey:'admin-test',resendKey:'mail-test',fromEmail:'Cleo <noreply@contact.cleolabs.co>'};
 const fetchImpl=async(url,options={})=>{
  const u=new URL(url),body=options.body?JSON.parse(options.body):{};const answer=(data,status=200)=>new Response(status===204?null:JSON.stringify(data),{status});
  if(u.hostname==='api.resend.com'){if(failMail)return answer({},503);mail.push(body);return answer({id:'mail-id'});}
  if(u.pathname==='/rest/v1/rpc/longchamp_throttle_login'){if(requests.has(body.p_email_hash))return answer({code:'PT429'},429);requests.add(body.p_email_hash);return answer(true);}
  if(u.pathname==='/rest/v1/longchamp_members')return answer([{user_id:'member-id'}]);
  if(u.pathname==='/auth/v1/admin/users/member-id')return answer({id:'member-id',email:'member@example.invalid'});
  if(u.pathname==='/rest/v1/rpc/longchamp_begin_login'){
   if(row&&!row.expired)return answer({code:'PT429'},429);
   row={challenge_hash:body.p_challenge_hash,user_id:'member-id',email:'member@example.invalid',attempts:0,delivered:false};return answer([{email:row.email}]);
  }
  if(u.pathname==='/auth/v1/admin/generate_link'){generated++;used=false;return answer({email_otp:'123456',user:{id:'member-id'}});}
  if(u.pathname==='/rest/v1/longchamp_login_codes'){if(options.method==='PATCH'){row.delivered=true;return answer(null,204);}throw new Error('Unexpected table read');}
  if(u.pathname==='/rest/v1/longchamp_otp_sessions')return answer(null,201);
  if(u.pathname==='/rest/v1/rpc/longchamp_try_login'){
   if(!row||row.expired||row.consumed||!row.delivered||row.attempts>=5||row.challenge_hash!==body.p_challenge_hash)return answer([]);
   row.attempts++;return answer([{user_id:row.user_id,email:row.email}]);
  }
  if(u.pathname==='/auth/v1/verify'){verified++;if(used||body.token!=='123456')return answer({},403);used=true;return answer({access_token:'header.'+Buffer.from(JSON.stringify({sub:'member-id',session_id:'code-session'})).toString('base64url')+'.signature',refresh_token:'refresh-token',user:{id:'member-id'}});}
  if(u.pathname==='/rest/v1/rpc/longchamp_complete_login'){row.consumed=true;return answer(true);}
  if(u.pathname==='/auth/v1/logout')return answer({});
  throw new Error('Unexpected '+u.pathname);
 };
 return {otp:createEmailCode({config,fetchImpl}),get mail(){return mail;},get generated(){return generated;},get verified(){return verified;},get row(){return row;},expire(){row.expired=true;},failMail(){failMail=true;}};
}
test('only a Longchamp member receives a code; no code or session is returned to the requester',async()=>{
 const f=fixture(),unknown=await f.otp.requestCode('outside@example.invalid');assert(unknown.challenge);assert.equal(f.mail.length,0);assert.equal(f.generated,0);
 const sent=await f.otp.requestCode(' MEMBER@example.invalid ');assert(sent.challenge);assert(!JSON.stringify(sent).includes('123456'));assert(!sent.access_token);
 assert.deepEqual(f.mail[0].to,['member@example.invalid']);assert(f.mail[0].text.includes('123456'));assert(f.mail[0].text.includes('10 minutes'));
});
test('the correct code is exchanged once; a replay and a new browser are refused',async()=>{
 const f=fixture(),sent=await f.otp.requestCode('member@example.invalid');
 await assert.rejects(f.otp.verifyCode('different-browser','123456'),e=>e.status===401);
 await assert.rejects(f.otp.verifyCode(sent.challenge,'111111'),e=>e.status===401);
 const session=await f.otp.verifyCode(sent.challenge,'123456');assert.equal(session.user.id,'member-id');
 await assert.rejects(f.otp.verifyCode(sent.challenge,'123456'),e=>e.status===401);
});
test('expired codes and excess attempts cannot create a session',async()=>{
 const f=fixture(),sent=await f.otp.requestCode('member@example.invalid');
 for(let i=0;i<5;i++)await assert.rejects(f.otp.verifyCode(sent.challenge,'000000'),e=>e.status===401);
 const before=f.verified;await assert.rejects(f.otp.verifyCode(sent.challenge,'123456'),e=>e.status===401);assert.equal(f.verified,before);
 f.expire();await assert.rejects(f.otp.verifyCode(sent.challenge,'123456'),e=>e.status===401);
});
test('resends are throttled and a failed delivery is not reported as success',async()=>{
 const f=fixture();await f.otp.requestCode('member@example.invalid');await assert.rejects(f.otp.requestCode('member@example.invalid'),e=>e.status===429);assert.equal(f.mail.length,1);
 const failed=fixture();failed.failMail();await assert.rejects(failed.otp.requestCode('member@example.invalid'),e=>e.status===503);assert.equal(failed.row.delivered,false);
});
test('malformed emails, codes and missing delivery configuration fail closed',async()=>{
 const f=fixture();await assert.rejects(f.otp.requestCode('not-an-email'),e=>e.status===400);
 await assert.rejects(f.otp.verifyCode('x','123'),e=>e.status===400);
 await assert.rejects(createEmailCode({config:{}}).requestCode('member@example.invalid'),e=>e.status===503);
});
test('repeated requests are throttled identically for members and unknown addresses',async()=>{
 for(const email of ['member@example.invalid','outside@example.invalid']){const f=fixture();await f.otp.requestCode(email);await assert.rejects(f.otp.requestCode(email),e=>e.status===429);}
});
test('a native member token requires a server proof bound to its own OTP session',()=>{
 const {createSessionProof,validSessionProof}=require('../server/session-proof.cjs');
 const token=id=>'header.'+Buffer.from(JSON.stringify({sub:'member-id',session_id:id})).toString('base64url')+'.signature';
 const proof=createSessionProof('test-secret',token('otp-session'),'member-id');
 assert(proof);assert(validSessionProof('test-secret',token('otp-session'),'member-id',proof));
 assert(!validSessionProof('test-secret',token('password-session'),'member-id',proof));
 assert(!validSessionProof('test-secret',token('otp-session'),'member-id',undefined));
});
