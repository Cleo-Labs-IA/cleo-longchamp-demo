'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {watchSummary,summarySources}=require('./watch-summary.cjs');
const API='https://chat.cleolabs.co/api/v1/conversation',VERSION='2026-10-28',UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const unavailable='Cleo n’a pas pu finaliser cette réponse. Réessayez dans quelques instants.';
// Inline before external assets: failed asset loading must never reactivate the old local demo engine.
const CHAT_BOOTSTRAP=`(()=>{const p=document.querySelector('.cpanel');if(!p)return;const m=p.querySelector('#chatm');m.innerHTML='<div class="cm-a">Cleo est momentanément indisponible. Rechargez la page pour réessayer.</div>';p.querySelectorAll('.chat-f button,#chats button').forEach(b=>b.disabled=true);const n=p.querySelector('.cm-note');if(n)n.textContent='Assistant Cleo';chatSend60=function(){m.textContent='Cleo est momentanément indisponible. Rechargez la page pour réessayer.';};chatReset60=chatSend60;p.querySelector('.chat-f').onsubmit=function(e){e.preventDefault();chatSend60();};})();`;
let catalog;
function chatCatalog(){if(!catalog)catalog=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../.generated/chat-context.json'),'utf8'));return catalog;}
function safeUrl(value){try{const u=new URL(value);if(!['https:','http:'].includes(u.protocol)||u.username||u.password||[...u.searchParams.keys()].some(k=>/token|secret|signature|api.?key|x-amz-/i.test(k)))return null;return u.href;}catch{return null;}}
function buildChatContext(data,{article=null,product=null}={}){
 const compact=a=>({...a,title:String(a.title||'').slice(0,400),summary:String(a.summary||'').slice(0,1000),url:safeUrl(a.url)});
 const news=[...new Map(data.articles.filter(a=>a.kind==='delta'&&(!product||a.productKeys?.includes(product.key))).sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))).map(a=>[a.key,a])).values()];
 const context={application:'Veille Longchamp',note:'Les dernières news désignent les actualités ci-dessous déjà présentes dans cette application. Elles proviennent d’une veille manuelle : ne pas les présenter comme une recherche du jour, ni transformer une consultation, un avis privé ou un rappel de tiers en nouvelle obligation Longchamp. Ces résumés fournis ne sont pas des textes juridiques officiels ni une preuve de composition produit.',article:article?compact(article):null,product,watch:{manual:true,updatedAt:data.updatedAt||null,reviewWindow:data.reviewWindow||null,scope:product?.label||'Toutes les catégories Longchamp',total:news.length,partial:news.length>0,items:[]}};
 for(const item of news){context.watch.items.push(compact(item));if(JSON.stringify(context).length>7800){context.watch.items.pop();break;}}
 context.watch.partial=context.watch.items.length<news.length;
 return {organizationName:'Longchamp',markets:article?.market?[article.market]:[],fileSummary:JSON.stringify(context)};
}
async function readAnswer(response,threadId,signal){
 if(!response.ok||!response.body||!response.headers.get('content-type')?.includes('text/event-stream')){await response.body?.cancel().catch(()=>{});throw Object.assign(new Error(unavailable),{status:response.status===429?429:503});}
 const reader=response.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let buffer='',bytes=0,metadata=false,done=false,answer=null,citations=[];
 const abort=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
 function frame(raw){
  const data=raw.split('\n').filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart()).join('\n');if(!data)return;if(data==='[DONE]'){done=true;return;}
  const p=JSON.parse(data);if(p.type==='data-cleo-api'){if(metadata||p.data?.version!==VERSION||p.data?.threadId!==threadId)throw new Error(unavailable);metadata=true;}
  if(p.type==='error')throw new Error(unavailable);
  if(p.type==='data-cleo-citations'){
   if(!metadata||!Array.isArray(p.data)||p.data.length>200)throw new Error(unavailable);
   citations=p.data.map(c=>{if(!c||typeof c.title!=='string'||c.title.length>4096||typeof c.quote!=='string'||!c.quote.trim()||c.quote.length>65536||!['corpus','web','document'].includes(c.kind)||!(c.n===null||Number.isInteger(c.n)&&c.n>0&&c.n<=999)||!(c.article==null||typeof c.article==='string'))throw new Error(unavailable);return {n:c.n,title:c.title,article:c.article||null,quote:c.quote,url:safeUrl(c.url),kind:c.kind};});
  }
  if(p.type==='data-cleo-reponse'){
   if(!metadata||answer||p.data?.statut!=='complete'||p.data?.controlesMenes!==true||typeof p.data?.contenu!=='string'||!p.data.contenu.trim()||p.data.contenu.length>262144)throw new Error(unavailable);
   answer=p.data.contenu;
  }
 }
 try{
  while(!done){if(signal.aborted)throw new Error(unavailable);const chunk=await reader.read();if(signal.aborted)throw new Error(unavailable);if(chunk.done)break;bytes+=chunk.value.byteLength;if(bytes>2*1024*1024)throw new Error(unavailable);buffer=(buffer+decoder.decode(chunk.value,{stream:true})).replace(/\r\n/g,'\n');let i;while(!done&&(i=buffer.indexOf('\n\n'))>=0){frame(buffer.slice(0,i));buffer=buffer.slice(i+2);}if(buffer.length>1024*1024)throw new Error(unavailable);}
  if(!metadata||!done||!answer)throw new Error(unavailable);return {content:answer,citations};
 }finally{signal.removeEventListener('abort',abort);await reader.cancel().catch(()=>{});reader.releaseLock();}
}
async function runChat({req,res,body,user,token,config,request,fetchImpl,catalogProvider=chatCatalog}){
 const json=(status,error)=>{res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify({error}));};
 if(!body||Object.keys(body).some(k=>!['message','thread_id','article_key','product_key'].includes(k))||typeof body.message!=='string'||!body.message.trim()||body.message.length>8000||body.thread_id!=null&&!UUID.test(body.thread_id))return json(400,'Vérifiez votre question.');
 if(typeof config.chatSecret!=='string'||config.chatSecret.length<32||!UUID.test(config.chatOrganizationId||''))return json(503,'L’assistant Cleo est temporairement indisponible.');
 const data=catalogProvider(),article=body.article_key==null?null:data.articles.find(s=>s.key===body.article_key),product=body.product_key==null?null:data.products.find(p=>p.key===body.product_key);
 if(body.article_key!=null&&!article||body.product_key!=null&&!product)return json(400,'Cette fiche n’est pas disponible.');
 const original=body.message.trim(),transformation=watchSummary(data,{message:original,product});
 const turnId=crypto.randomUUID();
 const claimed=await request('/rest/v1/rpc/longchamp_claim_chat_turn',{token,method:'POST',body:{p_thread_id:body.thread_id||null,p_turn_id:turnId}});
 if(!claimed.ok){if(claimed.status===429)return json(429,'Une réponse est déjà en cours. Attendez sa fin ou réessayez dans un instant.');if(claimed.status===403)return json(403,'Cette conversation n’est pas accessible.');throw new Error('DATABASE');}
 const thread=claimed.data?.[0];if(!thread||thread.user_id!==user.id||!UUID.test(thread.id))throw new Error('DATABASE');
 const context=transformation?{organizationName:'Longchamp',markets:[],fileSummary:'Résumé des notes de veille fournies dans transformation.text.'}:buildChatContext(data,{article,product});
 const payload={version:VERSION,organizationId:config.chatOrganizationId,actorId:user.id,threadId:thread.id,message:original,locale:'fr',marches:[],portails:null,context,...(transformation?{transformation}:{})},raw=JSON.stringify(payload);
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),290000);let result,error,heartbeat;
 const close=()=>{if(!res.writableEnded)controller.abort();};res.on('close',close);
 const emit=(type,data)=>{if(!res.destroyed)res.write('data: '+JSON.stringify({type,data})+'\n\n');};
 try{
  if(res.destroyed||req.aborted)return;
  res.setHeader('Content-Type','text/event-stream; charset=utf-8');res.setHeader('X-Accel-Buffering','no');res.flushHeaders?.();emit('status',{threadId:thread.id,message:transformation?'Cleo prépare le résumé de la veille…':'Cleo prépare votre réponse…'});
  if(Buffer.byteLength(raw)>64000||controller.signal.aborted||res.destroyed)throw new Error(unavailable);
  heartbeat=setInterval(()=>{if(!res.destroyed)res.write(': attente\n\n');},15000);
  const timestamp=String(Math.floor(Date.now()/1000)),requestId=crypto.randomUUID(),signature=crypto.createHmac('sha256',config.chatSecret).update('POST\n/api/v1/conversation\nlongchamp\n'+timestamp+'\n'+requestId+'\n'+raw).digest('hex');
  const upstream=await fetchImpl(API,{method:'POST',redirect:'error',cache:'no-store',signal:controller.signal,headers:{'content-type':'application/json',accept:'text/event-stream','x-cleo-consumer':'longchamp','x-cleo-timestamp':timestamp,'x-cleo-request-id':requestId,'x-cleo-signature':signature},body:raw});
  const checked=await readAnswer(upstream,thread.id,controller.signal);
  if(transformation)checked.watchSources=summarySources(checked.content,data,transformation);
  result=checked;
 }catch(e){error=e.status===429?'La limite de questions de cet espace a été atteinte. Réessayez plus tard.':unavailable;}
 finally{clearTimeout(timeout);clearInterval(heartbeat);controller.abort();res.off('close',close);await request('/rest/v1/rpc/longchamp_release_chat_turn',{token,method:'POST',timeoutMs:3000,body:{p_thread_id:thread.id,p_turn_id:turnId}}).catch(()=>{});}
 if(res.destroyed)return;
 if(result)emit('answer',{threadId:thread.id,...result});else emit('error',{message:error||unavailable});res.end('data: [DONE]\n\n');
}
module.exports={runChat,readAnswer,chatCatalog,buildChatContext,CHAT_BOOTSTRAP};
