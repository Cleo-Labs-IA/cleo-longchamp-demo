const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createHandler}=require('../server/app.cjs');

const follow={id:'test-follow',kind:'substance',value:'50-00-0',markets:['EU'],products:['pliage'],includeRelated:false,paused:false};
function fixture(){
 let state={revision:0,follows:[]};let loggedOut=false;
 const upstream=async(url,options={})=>{
  const u=new URL(url),body=options.body?JSON.parse(options.body):{};
  const token=options.headers?.Authorization;
  const answer=(data,status=200)=>new Response(JSON.stringify(data),{status});
  if(u.pathname==='/auth/v1/token')return body.password==='valid'||body.refresh_token==='refresh'?answer({access_token:'member',refresh_token:'refresh',expires_in:3600,user:{id:'member-id',email:'member@example.invalid'}}):answer({},400);
  if(u.pathname==='/auth/v1/user')return !loggedOut&&['Bearer member','Bearer outsider'].includes(token)?answer({id:token==='Bearer member'?'member-id':'outsider-id'}):answer({},401);
  if(u.pathname==='/auth/v1/logout'){if(token==='Bearer expired-forbidden')return answer({},403);loggedOut=true;return answer({});}
  if(u.pathname==='/rest/v1/longchamp_members')return answer(token==='Bearer member'?[{user_id:'member-id'}]:[]);
  if(u.pathname==='/rest/v1/longchamp_watch_state')return answer([state]);
  if(u.pathname==='/rest/v1/rpc/longchamp_save_watch'){
   if(body.expected_revision!==state.revision)return answer({message:'LONGCHAMP_CONFLICT'},409);
   state={revision:state.revision+1,follows:body.next_follows};return answer([state]);
  }
  throw new Error('Unexpected upstream '+u.pathname);
 };
 const config={url:'https://database.example.invalid',key:'public-test-key'};
 const handler=createHandler({config,fetchImpl:upstream,readPage:async()=>'<html><body>Private content<!-- SUBSTANCE-FOLLOWS-START -->old<!-- SUBSTANCE-FOLLOWS-END --></body></html>'});
 async function call(method,url,body,cookie='',origin='https://app.example.invalid'){
  const req={method,url,headers:{host:'app.example.invalid',origin,cookie,'content-type':'application/json'},body};
  const result={status:200,headers:{},body:''};
  const res={setHeader(k,v){result.headers[k.toLowerCase()]=v;},getHeader(k){return result.headers[k.toLowerCase()];},end(v=''){result.body=String(v);},set statusCode(v){result.status=v;},get statusCode(){return result.status;}};
  await handler(req,res);return result;
 }
 return {call,get state(){return state;},get loggedOut(){return loggedOut;}};
}
test('anonymous and non-members cannot read the app or shared state',async()=>{
 const {call}=fixture();
 for(const path of ['/api/application?action=state','/app','/sources']){
  const anon=await call('GET',path);assert([401,303].includes(anon.status));assert(!anon.body.includes('Private content'));
  const outsider=await call('GET',path,null,'lc_access=outsider');assert.equal(outsider.status,403);
 }
});
test('login sets HttpOnly Secure cookies and rejects invalid credentials and cross-origin posts',async()=>{
 const {call}=fixture();
 assert.equal((await call('POST','/api/application?action=login',{email:'a@b.fr',password:'bad'})).status,401);
 assert.equal((await call('POST','/api/application?action=login',{email:'a@b.fr',password:'valid'},'','https://evil.invalid')).status,403);
 const login=await call('POST','/api/application?action=login',{email:'a@b.fr',password:'valid'});
 assert.equal(login.status,200);assert(login.headers['set-cookie'].every(v=>v.includes('HttpOnly')&&v.includes('Secure')&&v.includes('SameSite=Lax')));
 assert(!login.body.includes('refresh'));assert(!login.body.includes('member-id'));
});
test('members share a state, stale edits conflict, invalid CAS never persists',async()=>{
 const f=fixture(),cookie='lc_access=member';
 let result=await f.call('PUT','/api/application?action=state',{revision:0,follows:[follow]},cookie);
 assert.equal(result.status,200);assert.equal(JSON.parse(result.body).revision,1);
 result=await f.call('GET','/api/application?action=state',null,cookie);assert.deepEqual(JSON.parse(result.body).follows,[follow]);
 assert.equal((await f.call('PUT','/api/application?action=state',{revision:0,follows:[]},cookie)).status,409);
 assert.equal(f.state.follows.length,1);
 assert.equal((await f.call('PUT','/api/application?action=state',{revision:1,follows:[{...follow,value:'307-24-5'}]},cookie)).status,400);
 assert.equal((await f.call('PUT','/api/application?action=state',{revision:1,follows:[follow,follow]},cookie)).status,400);
});
test('private HTML carries shared state without browser storage initialization',async()=>{
 const {call}=fixture(),result=await call('GET','/app',null,'lc_access=member');
 assert.equal(result.status,200);assert(result.body.includes('LONGCHAMP_SHARED'));assert(result.body.includes('Private content'));assert.equal(result.headers['cache-control'],'private, no-store');
});
test('logout revokes the session and clears cookies',async()=>{
 const f=fixture(),result=await f.call('POST','/api/application?action=logout',{},'lc_access=member');
 assert.equal(result.status,200);assert(f.loggedOut);assert(result.headers['set-cookie'].every(v=>v.includes('Max-Age=0')));
});
test('logout with only a refresh cookie still revokes the Supabase session',async()=>{
 const f=fixture(),result=await f.call('POST','/api/application?action=logout',{},'lc_refresh=refresh');
 assert.equal(result.status,200);assert(f.loggedOut);
});
test('logout renews an expired access token rejected with 403 before revoking',async()=>{
 const f=fixture(),result=await f.call('POST','/api/application?action=logout',{},'lc_access=expired-forbidden; lc_refresh=refresh');
 assert.equal(result.status,200);assert(f.loggedOut);
});
test('an unconfigured backend is unavailable, never a public fallback',async()=>{
 const handler=createHandler({config:{}});let status=200,body='';
 await handler({method:'GET',url:'/app',headers:{}},{setHeader(){},set statusCode(v){status=v;},end(v){body=v;}});
 assert.equal(status,503);assert(!body.includes('Private content'));
});
test('operator accepts an empty successful membership response without aborting account setup',async()=>{
 const {createAdminRequest}=require('../scripts/add-members.cjs');
 const request=createAdminRequest('https://fixture.invalid','test-key',async()=>new Response(null,{status:201}));
 assert.equal(await request('/rest/v1/longchamp_members',{method:'POST',body:{user_id:'fixture'}}),null);
});
test('a refresh started before opening a form cannot advance its revision or overwrite the editing snapshot',async()=>{
 const vm=require('node:vm'),fs=require('node:fs');let resolveResponse,editing=false;
 const scope={AbortController,window:{LONGCHAMP_SHARED:{revision:0,follows:[]},addEventListener(){}},document:{hidden:false,getElementById:()=>editing?{}:null},followSaving:false,savedFollows:[],followStorageError:'',CUR:'suivis',select(){},setInterval(){},location:{replace(){}},fetch:()=>new Promise(resolve=>{resolveResponse=resolve;})};
 scope.LONGCHAMP_SHARED=scope.window.LONGCHAMP_SHARED;
 vm.createContext(scope);vm.runInContext(fs.readFileSync('public/shared-sync.js','utf8'),scope);scope.LongchampSharedStore=scope.window.LongchampSharedStore;
 const refresh=vm.runInContext('refreshSharedFollows()',scope);editing=true;
 resolveResponse(new Response(JSON.stringify({revision:1,follows:[follow]}),{status:200}));await refresh;
 assert.equal(scope.LongchampSharedStore.revision,0);assert.equal(scope.savedFollows.length,0);
});
