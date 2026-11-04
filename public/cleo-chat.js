'use strict';
(()=>{
 const panel=document.querySelector('.cpanel');if(!panel)return;
 if(typeof window.markdownit!=='function')return;
 const messages=panel.querySelector('#chatm'),input=panel.querySelector('#chati'),form=panel.querySelector('.chat-f'),submit=form.querySelector('[type=submit]'),suggestions=panel.querySelector('#chats');
 const escChat=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const markdown=window.markdownit({html:false,linkify:false,breaks:true});
 const url=value=>{try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password?u.href:null;}catch{return null;}};
 markdown.validateLink=link=>url(link)!==null;
 markdown.renderer.rules.image=(tokens,i)=>'<span>'+escChat(tokens[i].content)+'</span>';
 const linkOpen=markdown.renderer.rules.link_open||((tokens,i,options,env,self)=>self.renderToken(tokens,i,options));
 markdown.renderer.rules.link_open=(tokens,i,options,env,self)=>{tokens[i].attrSet('target','_blank');tokens[i].attrSet('rel','noopener noreferrer');return linkOpen(tokens,i,options,env,self);};
 let threadId=null,controller=null,generation=0,articleKey=null,contextDisabled=false,stopping=false;
 const context=document.createElement('div');context.className='lc-chat-context';messages.before(context);
 const stop=document.createElement('button');stop.type='button';stop.className='lc-chat-stop';stop.textContent='Arrêter';stop.hidden=true;form.before(stop);
 const note=panel.querySelector('.cm-note');if(note)note.textContent='Réponses de Cleo Chat, avec les sources utilisées.';
 function hello(){messages.innerHTML='<div class="cm-a">Bonjour. Posez une question à Cleo sur vos produits, vos marchés ou une fiche de veille.</div>';}
 function currentContext(){
  if(contextDisabled)return {};
  const article=SIG.find(s=>s.raw===articleKey);if(article)return {article_key:article.raw,label:article.title};
  const key=CUR.startsWith('prod:')?CUR.slice(5):null,product=DATA.products.find(p=>p.key===key);return product?{product_key:key,label:product.label}:{};
 }
 function updateContext(){const c=currentContext();context.hidden=!c.label;context.innerHTML=c.label?'<span>Contexte : '+escChat(c.label)+'</span><button type="button" aria-label="Retirer le contexte">×</button>':'';context.querySelector('button')?.addEventListener('click',()=>{contextDisabled=true;updateContext();});}
 function busy(value){submit.disabled=value;stop.hidden=!value;suggestions?.querySelectorAll('button').forEach(b=>b.disabled=value);}
 function append(className,text){const el=document.createElement('div');el.className=className;el.textContent=text;messages.append(el);messages.scrollTop=messages.scrollHeight;return el;}
 function renderAnswer(target,data){
  target.className='cm-a lc-chat-answer';target.innerHTML=markdown.render(data.content);
  if(data.citations?.length){const sources=document.createElement('details');sources.className='lc-chat-sources';sources.innerHTML='<summary>Sources</summary>'+data.citations.map(c=>'<article><b>'+(c.n?'['+c.n+'] ':'')+escChat(c.title)+'</b>'+(c.article?'<p>'+escChat(c.article)+'</p>':'')+'<blockquote>'+escChat(c.quote)+'</blockquote>'+(url(c.url)?'<a href="'+escChat(url(c.url))+'" target="_blank" rel="noopener noreferrer">Ouvrir la source ↗</a>':'')+'</article>').join('');target.append(sources);}
 }
 async function send(raw){
  const question=String(raw||'').trim();if(!question||controller||stopping)return;if(question.length>8000){append('cm-a','Votre question est trop longue. Réduisez-la avant de l’envoyer.');return;}
  append('cm-u',question);input.value='';suggestions?.classList.add('off');const pending=append('cm-a lc-chat-pending','Cleo recherche les sources et prépare votre réponse…');const turn=generation;
  controller=new AbortController();const signal=controller.signal;busy(true);let answered=false,done=false;
  try{
   const c=currentContext(),response=await fetch('/api/application?action=chat',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:question,...(threadId?{thread_id:threadId}:{}),...(c.article_key?{article_key:c.article_key}:{}),...(c.product_key?{product_key:c.product_key}:{})}),signal});
   if(response.status===401){location.replace('/');throw new Error('Votre session a expiré.');}
   if(!response.ok){const data=await response.json();throw new Error(data.error||'Cleo est momentanément indisponible.');}
   if(!response.body||!response.headers.get('content-type')?.includes('text/event-stream'))throw new Error('Cleo est momentanément indisponible.');
   const reader=response.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let buffer='',bytes=0;
   const cancel=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener('abort',cancel,{once:true});
   try{
    while(!done){const chunk=await reader.read();if(signal.aborted)throw new DOMException('Arrêt','AbortError');if(chunk.done)break;bytes+=chunk.value.byteLength;if(bytes>2*1024*1024)throw new Error('Réponse trop volumineuse.');buffer=(buffer+decoder.decode(chunk.value,{stream:true})).replace(/\r\n/g,'\n');let i;
     while((i=buffer.indexOf('\n\n'))>=0){const frame=buffer.slice(0,i);buffer=buffer.slice(i+2);const data=frame.split('\n').filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart()).join('\n');if(!data)continue;if(data==='[DONE]'){done=true;break;}const event=JSON.parse(data);if(turn!==generation)return;
      if(event.type==='status'&&typeof event.data?.threadId==='string')threadId=event.data.threadId;
      if(event.type==='error')throw new Error(event.data?.message||'La réponse n’a pas pu être finalisée.');
      if(event.type==='answer'){if(answered||typeof event.data?.content!=='string'||!Array.isArray(event.data?.citations))throw new Error('Réponse incomplète.');renderAnswer(pending,event.data);answered=true;}
     }
    }
    if(!done||!answered)throw new Error('La réponse a été interrompue. Vous pouvez réessayer.');
   }finally{signal.removeEventListener('abort',cancel);await reader.cancel().catch(()=>{});reader.releaseLock();}
  }catch(error){if(turn===generation){pending.className='cm-a lc-chat-error';pending.textContent=signal.aborted?'Recherche arrêtée.':error.message||'Cleo est momentanément indisponible.';if(!input.value)input.value=question;}}
  finally{if(turn===generation){controller=null;busy(false);messages.scrollTop=messages.scrollHeight;input.focus();}}
 }
 function reset(){generation++;controller?.abort();controller=null;threadId=null;busy(false);hello();suggestions?.classList.remove('off');input.value='';input.focus();}
 stop.onclick=()=>controller?.abort();form.onsubmit=event=>{event.preventDefault();send(input.value);};chatSend60=send;chatReset60=reset;
 const beforeOpen=openSig;openSig=function(id){beforeOpen(id);articleKey=SIG.find(s=>s.id===Number(id))?.raw||null;contextDisabled=false;updateContext();};
 const beforeSelect=select;select=function(view){articleKey=null;contextDisabled=false;beforeSelect(view);updateContext();};
 window.LongchampChat={stop(){stopping=true;generation++;controller?.abort();},send,reset};hello();updateContext();busy(false);
})();
