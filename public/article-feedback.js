'use strict';
// Loaded only by the authenticated app. Article keys, rather than display indices, are persisted.
(()=>{
 const state={viewer_id:null,favorites:[],reviews:[]};
 const api=window.LongchampArticles={ready:false,busy:false,refresh,stop};
 let detailId=null,notice='',loading=null,stopping=false,lastFocus=null;
 const requests=new Set(),e=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const article=id=>SIG.find(s=>s.id===Number(id));
 const own=key=>state.reviews.find(r=>r.article_key===key&&r.author_id===state.viewer_id);
 const visible=r=>r.reaction||r.rating||r.comment;
 const team=key=>state.reviews.filter(r=>r.article_key===key&&visible(r));
 function stop(){stopping=true;for(const c of requests)c.abort();}
 async function request(action,method='GET',body){
  if(stopping||window.LongchampSharedStore?.stopping)throw new Error('Déconnexion en cours.');
  const c=new AbortController();requests.add(c);
  try{
   const response=await fetch('/api/application?action='+action,{method,cache:'no-store',signal:c.signal,headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
   const data=await response.json();
   if(response.status===401){location.replace('/');throw new Error('Reconnectez-vous.');}
   if(!response.ok){const error=new Error(data.error||'Enregistrement indisponible.');error.status=response.status;throw error;}
   return data;
  }finally{requests.delete(c);}
 }
 function actions(id){
  const s=article(id);if(!s)return '';const r=own(s.raw),saved=state.favorites.includes(s.raw),disabled=!api.ready||api.busy?' disabled':'';
  return '<div class="lc-article-actions" data-lc-actions="'+id+'"><button data-lc-favorite aria-pressed="'+saved+'"'+disabled+'>'+ (saved?'★ En favori':'☆ Favori')+'</button><button data-lc-like aria-pressed="'+(r?.reaction==='like')+'"'+disabled+'>J’aime</button><button data-lc-dislike aria-pressed="'+(r?.reaction==='dislike')+'"'+disabled+'>Je n’aime pas</button><button data-lc-edit'+disabled+'>'+ (r&&visible(r)?'Modifier mon avis':'Noter et commenter')+'</button>'+(team(s.raw).length?'<span class="lc-article-count">'+team(s.raw).length+' avis'+(r?.rating?' · Ma note : '+r.rating+'/5':'')+'</span>':'')+'</div>';
 }
 function reviewsHTML(id){
  const rows=team(article(id).raw);
  return '<h2>Avis de l’équipe</h2><p class="lc-help">Votre avis, votre note et votre commentaire sont visibles par l’équipe Longchamp.</p>'+actions(id)+(rows.length?rows.map(r=>'<article class="lc-team-review"><header><b>'+e(r.author_id===state.viewer_id?'Vous':r.author_label||'Membre Longchamp')+'</b><time>'+e(new Date(r.updated_at).toLocaleDateString('fr-FR'))+'</time></header><div class="lc-review-tags">'+(r.reaction?'<span>'+ (r.reaction==='like'?'J’aime':'Je n’aime pas')+'</span>':'')+(r.rating?'<span>Note : '+r.rating+'/5</span>':'')+'</div>'+(r.comment?'<p>'+e(r.comment)+'</p>':'')+'</article>').join(''):'<p class="lc-help">Aucun avis pour le moment. Dites-nous ce qui vous a été utile ou ce qui manque.</p>');
 }
 function repaint(){
  if(stopping)return;
  for(const el of document.querySelectorAll('[data-lc-actions]'))el.outerHTML=actions(Number(el.dataset.lcActions));
  const detail=document.getElementById('lc-article-detail');if(detail&&article(detailId))detail.innerHTML=reviewsHTML(detailId);
  let banner=document.getElementById('lc-article-notice');
  if(!banner){banner=document.createElement('div');banner.id='lc-article-notice';banner.setAttribute('role','status');document.getElementById('content').prepend(banner);}
  banner.textContent=notice;
 }
 async function refresh({fresh=false}={}){
  if(loading){if(!fresh)return loading;try{await loading;}catch{}}
  loading=(async()=>{const data=await request('articles');if(stopping)return;Object.assign(state,data);api.ready=true;notice='';repaint();})();
  try{await loading;}finally{loading=null;}
 }
 function favoritesPage(){
  const rows=state.favorites.map(key=>SIG.find(s=>s.raw===key)).filter(Boolean);
  return '<div class="fw-head"><h1>Mes favoris</h1><p>Les articles que vous souhaitez retrouver facilement. Vos favoris sont personnels.</p></div><div class="lc-favorites-toolbar"><button data-lc-back-feed>← Fil de veille</button><button data-lc-refresh>Actualiser</button></div>'+(rows.length?'<div class="ifeed">'+rows.map(s=>srow(s.id)).join(''):'<div class="fw-empty">'+(api.ready?'Aucun favori. Cliquez sur ☆ Favori à côté d’un article pour le conserver ici.':'Chargement de vos favoris…')+'</div>');
 }
 async function toggleFavorite(id){
  if(api.busy||!api.ready)return;const s=article(id);if(!s)return;
  api.busy=true;notice='';repaint();
  try{await request('favorite','PUT',{article_key:s.raw,favorite:!state.favorites.includes(s.raw)});await refresh({fresh:true});if(CUR==='favoris')select('favoris');}
  catch(error){notice=error.message;}
  finally{api.busy=false;repaint();}
 }
 function close(){const dialog=document.getElementById('lc-review-overlay');if(dialog?.dataset.saving==='true')return;dialog?.remove();lastFocus?.focus();}
 function openReview(id,reaction){
  if(!api.ready||api.busy||document.getElementById('lc-review-dialog'))return;const s=article(id);if(!s)return;
  let base=own(s.raw)||{revision:0,reaction:null,rating:null,comment:''};lastFocus=document.activeElement;
  const overlay=document.createElement('div');overlay.id='lc-review-overlay';
  overlay.innerHTML='<section id="lc-review-dialog" role="dialog" aria-modal="true" aria-labelledby="lc-review-title"><header><div><h2 id="lc-review-title">Votre avis sur cet article</h2><p>'+e(s.title)+'</p></div><button type="button" data-lc-close aria-label="Fermer l’avis">×</button></header><form id="lc-review-form"><fieldset><legend>Votre appréciation</legend>'+[['like','J’aime'],['dislike','Je n’aime pas'],['','Sans appréciation']].map(([v,t])=>'<label><input type="radio" name="reaction" value="'+v+'"> '+t+'</label>').join('')+'</fieldset><label for="lc-review-rating">Votre note</label><select id="lc-review-rating"><option value="">Sans note</option>'+[1,2,3,4,5].map(n=>'<option value="'+n+'">'+n+' / 5</option>').join('')+'</select><label for="lc-review-comment">Pourquoi cet avis ?</label><textarea id="lc-review-comment" maxlength="2000" rows="5" placeholder="Ce qui vous a été utile, ce qui manque ou ce qui pourrait être amélioré…"></textarea><p class="lc-help">Votre avis et votre commentaire seront partagés avec l’équipe. Vous pourrez les modifier ou les retirer.</p><p id="lc-review-error" role="alert"></p><p id="lc-review-status" role="status"></p><button id="lc-review-reload" type="button" hidden>Recharger mon avis enregistré</button><footer><button id="lc-review-clear" type="button" '+(base.revision?'':'hidden')+'>Retirer mon avis</button><button type="submit" class="lc-review-submit">Enregistrer mon avis</button></footer></form></section>';
  document.body.append(overlay);const form=overlay.querySelector('form'),status=document.getElementById('lc-review-status'),error=document.getElementById('lc-review-error');
  function fill(value){form.elements.reaction.value=value.reaction||'';document.getElementById('lc-review-rating').value=value.rating||'';document.getElementById('lc-review-comment').value=value.comment||'';}
  fill({...base,...(reaction?{reaction}:{})});
  overlay.querySelector('[data-lc-close]').onclick=close;overlay.onclick=event=>{if(event.target===overlay)close();};
  async function submit(clear=false){
   if(overlay.dataset.saving==='true')return;overlay.dataset.saving='true';api.busy=true;error.textContent='';status.textContent='Enregistrement…';
   const body={article_key:s.raw,revision:base.revision,reaction:clear?null:form.elements.reaction.value||null,rating:clear?null:Number(document.getElementById('lc-review-rating').value)||null,comment:clear?'':document.getElementById('lc-review-comment').value};
   for(const b of overlay.querySelectorAll('button,input,textarea,select'))b.disabled=true;
   try{
    await request('review','PUT',body);
    // The write is committed even if the following refresh fails. Never resend an old revision.
    overlay.dataset.saving='false';overlay.remove();lastFocus?.focus();
    try{await refresh({fresh:true});}catch{notice='Votre avis est enregistré. Actualisez pour recharger les avis de l’équipe.';}
   }catch(err){error.textContent=err.message;status.textContent='';document.getElementById('lc-review-reload').hidden=err.status!==409;}
   finally{overlay.dataset.saving='false';api.busy=false;for(const b of overlay.querySelectorAll('button,input,textarea,select'))b.disabled=false;repaint();}
  }
  form.onsubmit=event=>{event.preventDefault();submit();};document.getElementById('lc-review-clear').onclick=()=>submit(true);
  document.getElementById('lc-review-reload').onclick=async()=>{try{await refresh();base=own(s.raw)||{revision:0,reaction:null,rating:null,comment:''};fill(base);error.textContent='';status.textContent='Votre avis enregistré a été rechargé.';document.getElementById('lc-review-reload').hidden=true;document.getElementById('lc-review-comment').focus();}catch(err){error.textContent=err.message;}};
  overlay.onkeydown=event=>{
   if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}
   if(event.key==='Tab'){
    const focus=[...overlay.querySelectorAll('button,input,textarea,select')].filter(el=>!el.disabled&&!el.hidden),first=focus[0],last=focus.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
   }
  };
  overlay.querySelector('input').focus();
 }
 const beforeRow=srow;srow=function(id){return '<section class="lc-article-row" data-lc-article="'+Number(id)+'">'+beforeRow(id)+actions(id)+'</section>';};
 const beforeOpen=openSig;openSig=function(id){detailId=Number(id);beforeOpen(id);const section=document.createElement('section');section.id='lc-article-detail';section.className='lc-article-detail';section.innerHTML=reviewsHTML(detailId);(document.querySelector('.idr-b')||document.getElementById('content')).prepend(section);repaint();};
 const beforeSelect=select;select=function(view){detailId=null;if(view==='favoris'){CUR=view;setActive(view);document.getElementById('crumb').textContent='Mes favoris';document.getElementById('content').innerHTML=favoritesPage();window.scrollTo(0,0);}else beforeSelect(view);repaint();};
 const beforeToolbar=fToolbar;fToolbar=function(active){return beforeToolbar(active).replace('Mes suivis</button>','Mes suivis</button><button data-lc-favorites-link>Mes favoris</button>');};
 const nav=document.createElement('button');nav.className='nvspecial lc-favorites-nav';nav.dataset.view='favoris';nav.dataset.lcFavoritesNav='';nav.innerHTML='<span class="ic">☆</span>Mes favoris';nav.onclick=()=>select('favoris');navtop.querySelector('[data-view="suivis"]')?.after(nav);
 document.addEventListener('click',event=>{
  const button=event.target.closest('button');if(!button)return;
  const group=button.closest('[data-lc-actions]'),id=Number(group?.dataset.lcActions);
  if(group){event.stopPropagation();if(button.hasAttribute('data-lc-favorite'))toggleFavorite(id);else if(button.hasAttribute('data-lc-like'))openReview(id,'like');else if(button.hasAttribute('data-lc-dislike'))openReview(id,'dislike');else openReview(id);}
  if(button.hasAttribute('data-lc-favorites-link'))select('favoris');
  if(button.hasAttribute('data-lc-back-feed'))select('veille');
  if(button.hasAttribute('data-lc-refresh'))refresh().then(()=>{if(CUR==='favoris')select('favoris');}).catch(error=>{notice=error.message;repaint();});
 });
 // Handle Escape before the underlying article drawer, including when focus was lost during a reload.
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&document.getElementById('lc-review-overlay')){event.preventDefault();event.stopImmediatePropagation();close();}},true);
 const background=()=>{if(stopping||document.hidden||api.busy||document.getElementById('lc-review-overlay'))return;refresh().then(()=>{if(CUR==='favoris'&&!detailId)select('favoris');}).catch(error=>{notice=error.message;repaint();});};
 window.addEventListener('focus',background);setInterval(background,15000);
 select(CUR);refresh().then(()=>{if(CUR==='favoris')select('favoris');}).catch(error=>{notice='Favoris et avis indisponibles : '+error.message;repaint();});
})();
