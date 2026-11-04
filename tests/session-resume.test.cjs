const {test}=require('node:test'),assert=require('node:assert/strict');
const {createHandler}=require('../server/app.cjs'),{createSessionProof}=require('../server/session-proof.cjs');
function fixture({approved=true,backendDown=false}={}){
 const jwt='header.'+Buffer.from(JSON.stringify({sub:'member',session_id:'same-approved-session'})).toString('base64url')+'.signature';
 const proof=createSessionProof('secret',jwt,'member'),calls=[];let revoked=false;
 const handler=createHandler({config:{url:'https://db.invalid',key:'public',serviceKey:'secret'},fetchImpl:async(url,options)=>{
  const path=new URL(url).pathname,body=options.body&&JSON.parse(options.body);calls.push(path);
  const answer=(data,status=200)=>new Response(JSON.stringify(data),{status});
  if(path==='/auth/v1/user')return backendDown?answer({},503):options.headers.Authorization==='Bearer '+jwt&&!revoked?answer({id:'member'}):answer({},401);
  if(path==='/auth/v1/token')return body.refresh_token==='valid-refresh'&&!revoked?answer({access_token:jwt,refresh_token:'rotated-refresh'}):answer({},400);
  if(path==='/rest/v1/longchamp_members')return answer([{user_id:'member'}]);
  if(path==='/rest/v1/rpc/longchamp_is_member')return answer(approved);
  if(path==='/auth/v1/logout'){revoked=true;return answer({});}
  if(path==='/rest/v1/longchamp_otp_sessions')return new Response(null,{status:204});
  throw new Error('Unexpected request '+path);
 }});
 const cookie='lc_access='+jwt+'; lc_refresh=valid-refresh; lc_otp='+proof;
 async function call(cookies=cookie,action='session',method='GET'){
  const result={status:200,headers:{}};
  await handler({method,url:'/api/application?action='+action,body:{},headers:{host:'app.invalid',origin:'https://app.invalid','content-type':'application/json',cookie:cookies}},
   {setHeader(k,v){result.headers[k.toLowerCase()]=v;},getHeader(k){return result.headers[k.toLowerCase()];},set statusCode(v){result.status=v;},end(v){result.body=JSON.parse(v);}});
  return result;
 }
 return {call,cookie,proof,calls};
}
test('a recent OTP session resumes without sending a code',async()=>{
 const f=fixture(),r=await f.call();assert.equal(r.status,200);assert.deepEqual(r.body,{authenticated:true});assert.equal(r.headers['cache-control'],'private, no-store');assert(!f.calls.some(p=>p.includes('generate_link')||p.includes('begin_login')));
});
test('an expired access cookie is renewed with the existing proof and refresh cookie',async()=>{
 const f=fixture(),r=await f.call('lc_refresh=valid-refresh; lc_otp='+f.proof);assert.equal(r.status,200);assert(f.calls.includes('/auth/v1/token'));assert(r.headers['set-cookie'].some(v=>v.startsWith('lc_access=')&&!v.includes('Max-Age=0')));
});
test('expired approval, invalid refresh and missing proof still require login',async()=>{
 assert.equal((await fixture({approved:false}).call()).status,401);
 const f=fixture();assert.equal((await f.call('lc_refresh=invalid; lc_otp='+f.proof)).status,401);assert.equal((await f.call('lc_refresh=valid-refresh')).status,401);assert.equal((await f.call('')).status,401);
});
test('a backend outage preserves the existing cookies and logout prevents resumption',async()=>{
 const down=await fixture({backendDown:true}).call();assert.equal(down.status,503);assert.equal(down.headers['set-cookie'],undefined);
 const f=fixture();assert.equal((await f.call(f.cookie,'logout','POST')).status,200);assert.equal((await f.call()).status,401);
});
