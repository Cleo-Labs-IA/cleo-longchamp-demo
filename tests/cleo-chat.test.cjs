const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),crypto=require('node:crypto');
const {createHandler}=require('../server/app.cjs'),{createSessionProof}=require('../server/session-proof.cjs');
const actor='ca110001-1111-4111-8111-111111111111',org='ca110002-2222-4222-8222-222222222222',thread='ca110003-3333-4333-8333-333333333333',foreign='ca110004-4444-4444-8444-444444444444',secret='dedicated-conversation-secret-for-tests-only';
const jwt='header.'+Buffer.from(JSON.stringify({sub:actor,session_id:'native-approved'})).toString('base64url')+'.signature',cookie='lc_access='+jwt+'; lc_otp='+createSessionProof('service',jwt,actor);
function fixture({fail=false,configured=true,disconnected=false,responseText='Réponse du moteur Cleo Chat'}={}){
 const calls=[];let released=false;
 const handler=createHandler({config:{url:'https://db.invalid',key:'public',serviceKey:'service',chatSecret:configured?secret:undefined,chatOrganizationId:org},chatCatalog:{updatedAt:'2026-11-02',articles:[{key:'article',kind:'delta',date:'2026-10-30',title:'Article sélectionné',summary:'Contexte de la fiche',market:'France'}],products:[]},fetchImpl:async(url,options)=>{
  const path=new URL(url).pathname,body=options.body&&JSON.parse(options.body);calls.push({url,body,options});
  const answer=(data,status=200)=>new Response(JSON.stringify(data),{status});
  if(path==='/auth/v1/user')return answer({id:actor});
  if(path==='/rest/v1/longchamp_members')return answer([{user_id:actor}]);
  if(path==='/rest/v1/rpc/longchamp_claim_chat_turn')return body.p_thread_id===foreign?answer({},403):answer([{id:thread,user_id:actor}]);
  if(path==='/rest/v1/rpc/longchamp_release_chat_turn'){released=true;return answer(true);}
  if(path==='/api/v1/conversation'){
   const h=options.headers;assert.equal(h['x-cleo-consumer'],'longchamp');assert.equal(h['x-cleo-signature'],crypto.createHmac('sha256',secret).update('POST\n/api/v1/conversation\nlongchamp\n'+h['x-cleo-timestamp']+'\n'+h['x-cleo-request-id']+'\n'+options.body).digest('hex'));
   const frames=[{type:'data-cleo-api',data:{version:'2026-10-28',threadId:thread}},{type:'text-delta',delta:'DRAFT NOT FOR CLIENT'},{type:'data-cleo-citations',data:[]},{type:'data-cleo-reponse',data:{contenu:fail?'UNVERIFIED':responseText,statut:fail?'failed':'complete',controlesMenes:!fail,citationCount:0}}];
   return new Response(frames.map(x=>'data: '+JSON.stringify(x)+'\n\n').join('')+'data: [DONE]\n\n',{headers:{'content-type':'text/event-stream'}});
  }
  throw new Error('Unexpected '+path);
 }});
 async function call(body,cookies=cookie){
  const req=Object.assign(new EventEmitter(),{method:'POST',url:'/api/application?action=chat',headers:{host:'app.invalid',origin:'https://app.invalid','content-type':'application/json',cookie:cookies},body});
  const r={status:200,headers:{},body:''},res=new EventEmitter();Object.assign(res,{destroyed:disconnected,setHeader(k,v){r.headers[k.toLowerCase()]=v;},getHeader(k){return r.headers[k.toLowerCase()];},write(v){r.body+=v;},end(v=''){r.body+=v;res.writableEnded=true;}});Object.defineProperty(res,'statusCode',{set(v){r.status=v;}});await handler(req,res);return r;
 }
 return {call,calls,get released(){return released;}};
}
test('signed Cleo Chat request derives organization, actor and thread on the server',async()=>{
 const f=fixture(),r=await f.call({message:'Ma question',article_key:'article'});assert.equal(r.status,200);assert.match(r.body,/Réponse du moteur Cleo Chat/);assert(!r.body.includes('DRAFT NOT FOR CLIENT'));assert(!r.body.includes(secret));assert(f.released);
 const sent=f.calls.find(c=>c.url.includes('/api/v1/conversation')).body;assert.equal(sent.actorId,actor);assert.equal(sent.organizationId,org);assert.equal(sent.threadId,thread);assert.equal(sent.context.organizationName,'Longchamp');assert.match(sent.context.fileSummary,/Article sélectionné/);assert.equal(sent.message,'Ma question');
});
test('watch requests carry the application task while ordinary conversation keeps its native message',async()=>{
 const f=fixture();await f.call({message:'fais moi un reseume des dernieres news'});await f.call({message:'plus court'});await f.call({message:'merci'});
 const sent=f.calls.filter(c=>c.url.includes('/api/v1/conversation')).map(c=>c.body);assert.equal(sent[0].message,'fais moi un reseume des dernieres news');assert.equal(sent[0].transformation.kind,'summary');assert.match(sent[0].transformation.text,/Article sélectionné/);assert.equal(sent[1].message,'plus court');assert.equal(sent[1].transformation,undefined);assert.equal(sent[2].message,'merci');assert.equal(sent[2].transformation,undefined);
});
test('anonymous, foreign threads, forged identities and unconfigured service cannot call the model',async()=>{
 const f=fixture();assert.equal((await f.call({message:'Question'},'')).status,401);assert.equal((await f.call({message:'Question',thread_id:foreign})).status,403);assert.equal((await f.call({message:'Question',organizationId:foreign,actorId:foreign})).status,400);assert.equal((await fixture({configured:false}).call({message:'Question'})).status,503);assert(!f.calls.some(c=>c.url.includes('/api/v1/conversation')));
});
test('a failed control never becomes an answer and the conversation lease is released',async()=>{
 const f=fixture({fail:true}),r=await f.call({message:'Question'});assert(!r.body.includes('UNVERIFIED'));assert.match(r.body,/error/);assert(f.released);
});
test('a summary with an unknown reference is never emitted as an answer after failed link validation',async()=>{const f=fixture({responseText:'[Inventé](#watch:unknown)'}),r=await f.call({message:'résume les news'});assert(!r.body.includes('Inventé'));assert(!r.body.includes('"type":"answer"'));assert.match(r.body,/"type":"error"/);assert(f.released);});
test('a disconnected client does not start a model turn after the reservation',async()=>{const f=fixture({disconnected:true});await f.call({message:'Question'});assert(!f.calls.some(c=>c.url.includes('/api/v1/conversation')));assert(f.released);});
test('stream contract rejects wrong identities and unverified final frames',async()=>{
 const {readAnswer}=require('../server/cleo-chat.cjs'),meta={type:'data-cleo-api',data:{version:'2026-10-28',threadId:thread}},final={type:'data-cleo-reponse',data:{contenu:'Réponse',statut:'complete',controlesMenes:true}};
 const response=events=>new Response(events.map(e=>'data: '+JSON.stringify(e)+'\r\n\r\n').join('')+'data: [DONE]\r\n\r\n',{headers:{'content-type':'text/event-stream'}});
 for(const events of [[{...meta,data:{...meta.data,threadId:foreign}},final],[meta,{...final,data:{...final.data,controlesMenes:false}}],[meta,final,final],[meta,{type:'error'},final],[final]])await assert.rejects(readAnswer(response(events),thread,new AbortController().signal));
});
test('DONE ends a hanging transport, and abort cancels a read even when the transport ignores fetch signal',async()=>{
 const {readAnswer}=require('../server/cleo-chat.cjs');let cancelled=false;
 const events=[{type:'data-cleo-api',data:{version:'2026-10-28',threadId:thread}},{type:'data-cleo-reponse',data:{contenu:'Étiquetage français',statut:'complete',controlesMenes:true}}];
 const stream=new ReadableStream({start(c){const text=events.map(e=>'data: '+JSON.stringify(e)+'\n\n').join('')+'data: [DONE]\n\n';for(const b of new TextEncoder().encode(text))c.enqueue(Uint8Array.of(b));},cancel(){cancelled=true;}});
 const answer=await readAnswer(new Response(stream,{headers:{'content-type':'text/event-stream'}}),thread,new AbortController().signal);assert.equal(answer.content,'Étiquetage français');assert(cancelled);
 const controller=new AbortController();let aborted=false;const stalled=new Response(new ReadableStream({cancel(){aborted=true;}}),{headers:{'content-type':'text/event-stream'}});const pending=readAnswer(stalled,thread,controller.signal);controller.abort();await assert.rejects(pending);assert(aborted);
});
test('watch context contains dated latest news, source links and the manual review boundary without cutting JSON',()=>{
 const {buildChatContext}=require('../server/cleo-chat.cjs');
 const articles=[
  {key:'reference',kind:'struct',title:'Référence de fond',date:'2026-11-03',productKeys:['cuir']},
  {key:'old',kind:'delta',title:'Ancienne actualité',date:'2026-09-10',productKeys:['cuir']},
  {key:'new',kind:'delta',title:'Consultation PFHxA',date:'2026-10-30',sourceDate:'2026-10-30',eventType:'proposal',market:'Californie',url:'https://example.org/pfhxa',summary:'Projet en consultation, pas une interdiction.',productKeys:['cuir']},
  {key:'other',kind:'delta',title:'Rappel parfum',date:'2026-10-29',productKeys:['parfum']},
 ];
 const catalog={articles,products:[{key:'cuir',label:'Cuir'}],updatedAt:'2026-11-02',reviewWindow:{from:'2026-08-30',to:'2026-11-02'}};
 const all=JSON.parse(buildChatContext(catalog,{}).fileSummary);assert.equal(all.watch.updatedAt,'2026-11-02');assert.equal(all.watch.items[0].key,'new');assert(!all.watch.items.some(x=>x.key==='reference'));assert.equal(all.watch.items[0].url,'https://example.org/pfhxa');assert.equal(all.watch.items[0].eventType,'proposal');assert.equal(all.watch.manual,true);
 const scoped=JSON.parse(buildChatContext(catalog,{product:catalog.products[0]}).fileSummary);assert.deepEqual(scoped.watch.items.map(x=>x.key),['new','old']);
 const huge={...catalog,articles:Array.from({length:50},(_,i)=>({...articles[2],key:'news-'+i,summary:'É'.repeat(3000)}))};
 const bounded=buildChatContext(huge,{}).fileSummary;assert(bounded.length<=8000);assert.equal(JSON.parse(bounded).watch.partial,true);assert(JSON.parse(bounded).watch.items.length>0);
});
