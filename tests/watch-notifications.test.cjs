'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {createWatchNotifications} = require('../server/watch-notifications.cjs');
const config = {url:'https://database.test',serviceKey:'service',resendKey:'resend',fromEmail:'Cleo <sender@example.test>'};
const job = {id:'event-id',claim_token:'lease-one',revision:8,created_at:'2026-11-04T10:00:00Z',items:[{kind:'substance',value:'50-00-0',markets:['EU'],products:['pliage'],to:'attacker@example.test'}]};
const response = (data,ok=true,status=200) => ({ok,status,json:async()=>data});
test('provider success is acknowledged; fixed recipient, immutable body and bounded limit',async()=>{
 const calls=[];
 const worker=createWatchNotifications({config,fetchImpl:async(url,options)=>{
  calls.push({url,...options,parsed:JSON.parse(options.body)});
  if(url.endsWith('longchamp_claim_watch_notifications'))return response([job]);
  if(url.includes('resend.com'))return response({id:'email-id'});
  return response(true);
 }});
 assert.deepEqual(await worker.drain({limit:1}),{sent:1,failed:0});
 assert.equal(calls[0].parsed.p_limit,1);
 assert.deepEqual(calls[1].parsed.to,['naomie@cleolabs.co']);
 assert.equal(calls[1].headers['Idempotency-Key'],'longchamp-watch-event-id');
 assert.match(calls[1].parsed.text,/50-00-0[\s\S]*EU[\s\S]*pliage/);
 assert.equal(calls[2].parsed.p_success,true);
 assert.equal(calls[2].parsed.p_claim_token,'lease-one');
});
test('provider failure persists retry, then same body and key succeed',async()=>{
 let attempts=0;const emails=[],acks=[];
 const worker=createWatchNotifications({config,fetchImpl:async(url,options)=>{
  if(url.endsWith('longchamp_claim_watch_notifications'))return response([{...job,claim_token:'lease-'+attempts}]);
  if(url.includes('resend.com')){emails.push(options);return ++attempts===1?response({error:'busy'},false,503):response({id:'delivered'});}
  acks.push(JSON.parse(options.body));return response(true);
 }});
 assert.deepEqual(await worker.drain(),{sent:0,failed:1});
 assert.deepEqual(await worker.drain(),{sent:1,failed:0});
 assert.equal(acks[0].p_success,false);assert.equal(acks[1].p_success,true);
 assert.equal(emails[0].body,emails[1].body);assert.deepEqual(emails[0].headers,emails[1].headers);
});
test('stale lease acknowledgement never reports sent',async()=>{
 const worker=createWatchNotifications({config,fetchImpl:async url=>response(url.endsWith('longchamp_claim_watch_notifications')?[job]:url.includes('resend.com')?{id:'accepted'}:false)});
 assert.deepEqual(await worker.drain(),{sent:0,failed:1});
});
test('missing config does no IO',async()=>{
 const worker=createWatchNotifications({config:{url:config.url},fetchImpl:async()=>assert.fail('unexpected network')});
 assert.deepEqual(await worker.drain(),{sent:0,failed:0,disabled:true});
});
test('provider 2xx without an id is a failure',async()=>{
 let finished;
 const worker=createWatchNotifications({config,fetchImpl:async(url,options)=>{
  if(url.endsWith('longchamp_claim_watch_notifications'))return response([job]);
  if(url.includes('resend.com'))return response({});
  finished=JSON.parse(options.body);return response(true);
 }});
 assert.deepEqual(await worker.drain(),{sent:0,failed:1});assert.equal(finished.p_success,false);
});
test('migration isolates role privileges and uses leases and future updates only',()=>{
 const sql=fs.readFileSync(new URL('../supabase/migrations/20261104120000_longchamp_watch_notifications.sql',`file://${__filename}`),'utf8');
 assert.match(sql,/enable row level security/);
 assert.match(sql,/revoke all on public.longchamp_watch_notifications from public,anon,authenticated/);
 assert.match(sql,/for update skip locked/);
 assert.match(sql,/q.claim_token=p_claim_token.*q.lease_until>now\(\)/);
 assert.match(sql,/after update on public.longchamp_watch_state/);
 assert.match(sql,/interval '23 hours'/);
 assert.doesNotMatch(sql,/grant .* to authenticated/);
});
