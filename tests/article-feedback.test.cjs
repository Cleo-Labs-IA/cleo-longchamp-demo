const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createHandler}=require('../server/app.cjs');
const {createSessionProof}=require('../server/session-proof.cjs');
function fixture(){
 const writes=[];
 const jwt='header.'+Buffer.from(JSON.stringify({sub:'one',session_id:'approved-session'})).toString('base64url')+'.signature';
 const cookie='lc_access='+jwt+'; lc_otp='+createSessionProof('test-service',jwt,'one');
 let fail=false;
 const handler=createHandler({config:{url:'https://db.invalid',key:'public',serviceKey:'test-service'},articleKeys:['stable-key'],fetchImpl:async(url,options)=>{
  const path=new URL(url).pathname,body=options.body&&JSON.parse(options.body);
  const answer=(data,status=200)=>new Response(JSON.stringify(data),{status});
  if(path==='/auth/v1/user')return options.headers.Authorization?answer({id:'one'}):answer({},401);
  if(path==='/rest/v1/longchamp_members')return answer([{user_id:'one'}]);
  if(path==='/rest/v1/rpc/longchamp_get_articles')return answer({viewer_id:'one',favorites:['stable-key'],reviews:[]});
  if(path==='/rest/v1/rpc/longchamp_set_favorite'||path==='/rest/v1/rpc/longchamp_save_review'){
   writes.push({path,body});return fail?answer({message:'LONGCHAMP_REVIEW_CONFLICT'},409):answer({ok:true});
  }
  throw new Error('Unexpected upstream '+path);
 }});
 async function call(action,method='GET',body,authenticated=true,origin='https://app.invalid'){
  const result={status:200,body:''},headers={};
  await handler({method,url:'/api/application?action='+action,body,headers:{host:'app.invalid',origin,'content-type':'application/json',cookie:authenticated?cookie:''}},
   {setHeader(k,v){headers[k]=v;},getHeader(k){return headers[k];},set statusCode(v){result.status=v;},end(v){result.body=JSON.parse(v);}});
  return result;
 }
 return {call,writes,conflict(){fail=true;}};
}
test('article activity is private and requires the OTP session',async()=>{
 const f=fixture();assert.equal((await f.call('articles','GET',undefined,false)).status,401);
 const r=await f.call('articles');assert.equal(r.status,200);assert.deepEqual(r.body.favorites,['stable-key']);assert.equal(r.body.viewer_id,'one');
});
test('favorites use the stable article key and derive their owner from the session',async()=>{
 const f=fixture();assert.equal((await f.call('favorite','PUT',{article_key:'stable-key',favorite:true,user_id:'victim'})).status,200);
 assert.deepEqual(f.writes[0].body,{p_article_key:'stable-key',p_favorite:true});
 for(const body of [{article_key:'unknown',favorite:true},{article_key:'stable-key',favorite:'true'},null])assert.equal((await f.call('favorite','PUT',body)).status,400);
 assert.equal(f.writes.length,1);
});
test('reviews accept a rating, a reaction and the reason without permitting author impersonation',async()=>{
 const f=fixture(),review={article_key:'stable-key',reaction:'dislike',rating:2,comment:'  Trop général pour notre produit.  ',revision:0,user_id:'victim'};
 assert.equal((await f.call('review','PUT',review)).status,200);
 assert.deepEqual(f.writes[0].body,{p_article_key:'stable-key',p_reaction:'dislike',p_rating:2,p_comment:'Trop général pour notre produit.',p_expected_revision:0});
 for(const patch of [{rating:0},{rating:6},{rating:1.5},{reaction:'both'},{comment:'x'.repeat(2001)},{revision:-1},{article_key:'unknown'}])assert.equal((await f.call('review','PUT',{...review,...patch})).status,400);
 assert.equal(f.writes.length,1);
 assert.equal((await f.call('review','PUT',{...review,reaction:null,rating:null,comment:''})).status,200,'An author may clear their review');
});
test('review conflicts are visible and cross-origin mutations are rejected',async()=>{
 const f=fixture();f.conflict();const r=await f.call('review','PUT',{article_key:'stable-key',reaction:'like',rating:null,comment:'',revision:1});
 assert.equal(r.status,409);assert.match(r.body.error,/modifié/);
 assert.equal((await f.call('favorite','PUT',{article_key:'stable-key',favorite:true},true,'https://evil.invalid')).status,403);
});
