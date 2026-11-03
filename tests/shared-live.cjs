'use strict';
// Explicit operator check: ephemeral test accounts, no emails, cleanup in finally.
const assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),{execFileSync}=require('node:child_process');
async function main(){
 if(!process.argv.includes('--apply-test'))throw new Error('Pass --apply-test to create and remove temporary test identities.');
 const preview=process.argv.find(s=>s.startsWith('https://cleo-longchamp-demo-'));if(!preview)throw new Error('Expected Longchamp preview URL.');
 const keys=JSON.parse(execFileSync('supabase',['projects','api-keys','--project-ref','tuzjcmvlclpfuroqnuis','-o','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
 const key=keys.find(k=>k.name==='service_role').api_key,base='https://tuzjcmvlclpfuroqnuis.supabase.co';
 async function admin(endpoint,method='GET',body){const r=await fetch(base+endpoint,{method,headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});if(!r.ok)throw new Error('Test setup/cleanup HTTP '+r.status);const text=await r.text();return text?JSON.parse(text):null;}
 function remote(route,{method='GET',body,cookie}={}){
  const args=['curl',route,'--deployment',preview,'--scope','cleo-academys-projects','--','--silent','--show-error','--include','--max-time','30','--request',method];
  if(body)args.push('--header','Content-Type: application/json','--header','Origin: '+preview,'--data',JSON.stringify(body));if(cookie)args.push('--header','Cookie: '+cookie);
  const raw=execFileSync('vercel',args,{encoding:'utf8',maxBuffer:14000000,stdio:['ignore','pipe','pipe'],timeout:45000});
  const boundary=raw.indexOf('\r\n\r\n'),headers=raw.slice(0,boundary),content=raw.slice(boundary+4);return {status:Number(headers.match(/HTTP\S*\s+(\d+)/)[1]),headers,body:content};
 }
 const members=await admin('/rest/v1/longchamp_members?select=user_id');assert.equal(members.length,0,'Do not run this test once real members are enrolled.');
 const snapshot=(await admin('/rest/v1/longchamp_watch_state?id=eq.longchamp&select=*'))[0];assert.deepEqual(snapshot.follows,[],'Do not run on populated client state.');
 const suffix=crypto.randomBytes(5).toString('hex'),users=[],checks=[];let wrote=false;
 try{
  for(let i=0;i<2;i++){const password=crypto.randomBytes(24).toString('base64url'),email='longchamp-check-'+suffix+'-'+i+'@example.invalid';const user=await admin('/auth/v1/admin/users','POST',{email,password,email_confirm:true});users.push({id:user.id,email,password});await admin('/rest/v1/longchamp_members','POST',{user_id:user.id});}
  const cookies=[];
  for(const user of users){const r=remote('/api/application?action=login',{method:'POST',body:{email:user.email,password:user.password}});assert.equal(r.status,200);const cookie=[...r.headers.matchAll(/^set-cookie:\s*([^;\r\n]+)/gmi)].map(m=>m[1]).join('; ');assert(cookie.includes('lc_access='));cookies.push(cookie);}
  checks.push('real Supabase password login for both temporary members');
  let r=remote('/app',{cookie:cookies[0]});assert.equal(r.status,200);assert(r.body.includes('window.LONGCHAMP_SHARED='));assert(r.body.includes('Suivis communs à l’équipe'));checks.push('authenticated HTML and generated files bundled on Vercel');
  r=remote('/sources',{cookie:cookies[0]});assert.equal(r.status,200);assert(r.body.includes('sources')||r.body.includes('Sources'));checks.push('authenticated source page');
  const follow={id:'live-'+suffix,kind:'substance',value:'50-00-0',markets:['EU'],products:['pliage'],paused:false,includeRelated:false};
  r=remote('/api/application?action=state',{method:'PUT',cookie:cookies[0],body:{revision:snapshot.revision,follows:[follow]}});assert.equal(r.status,200);wrote=true;
  r=remote('/api/application?action=state',{cookie:cookies[1]});assert.equal(r.status,200);const shared=JSON.parse(r.body);assert.equal(shared.follows[0].id,follow.id);checks.push('first account writes, second account reads same real database record');
  r=remote('/api/application?action=state',{method:'PUT',cookie:cookies[1],body:{revision:snapshot.revision,follows:[]}});assert.equal(r.status,409);checks.push('real conflicting edit rejected');
  const refreshOnly=cookies[0].split('; ').find(s=>s.startsWith('lc_refresh='));
  r=remote('/api/application?action=logout',{method:'POST',cookie:refreshOnly,body:{}});assert.equal(r.status,200);
  r=remote('/api/application?action=state',{cookie:cookies[0]});assert.equal(r.status,401);checks.push('refresh-only logout revokes actual Supabase session; previous access rejected');
 }finally{
  if(wrote){const current=(await admin('/rest/v1/longchamp_watch_state?id=eq.longchamp&select=*'))[0];assert(current.follows.every(f=>f.id==='live-'+suffix),'Concurrent data appeared: refusing to overwrite it');await admin('/rest/v1/longchamp_watch_state?id=eq.longchamp','PATCH',{follows:snapshot.follows,revision:snapshot.revision,updated_at:snapshot.updated_at,updated_by:snapshot.updated_by});}
  for(const u of users)await admin('/auth/v1/admin/users/'+u.id,'DELETE');
 }
 assert.equal((await admin('/rest/v1/longchamp_members?select=user_id')).length,0);assert.deepEqual((await admin('/rest/v1/longchamp_watch_state?id=eq.longchamp&select=follows'))[0].follows,[]);checks.push('temporary identities removed and initial empty state restored');
 const report={preview,checks,provider:'real Vercel and Supabase',emails_sent:false};
 fs.mkdirSync('/Users/naomiehalioua/reports/longchamp-shared-app-2026-11-03',{recursive:true});fs.writeFileSync('/Users/naomiehalioua/reports/longchamp-shared-app-2026-11-03/live.json',JSON.stringify(report,null,2));console.log('PASS '+checks.join('; '));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
