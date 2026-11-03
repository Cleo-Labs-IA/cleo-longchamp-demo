'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {cleanFollow}=require('../follow-core.js');
const root=path.resolve(__dirname,'..');
const MAX_BODY=100000;

function createHandler({config={url:process.env.SUPABASE_URL,key:process.env.SUPABASE_ANON_KEY},fetchImpl=globalThis.fetch,readPage=async name=>{
 if(name==='index.html'||name==='sources.html'){try{return await fs.readFile(path.join(root,'.generated',name==='index.html'?'app.html':name),'utf8');}catch(error){if(error.code!=='ENOENT')throw error;}}
 return fs.readFile(path.join(root,name),'utf8');
}}={}){
 const request=async(endpoint,{token,method='GET',body}={})=>{
  const response=await fetchImpl(config.url+endpoint,{method,headers:{apikey:config.key,...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
  const data=await response.json().catch(()=>null);return {ok:response.ok,status:response.status,data};
 };
 return async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Robots-Tag','noindex, nofollow');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');
  const json=(status,data)=>{res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(data));};
  if(!config.url||!config.key)return json(503,{error:'L’espace est en cours de préparation. Les accès seront ouverts prochainement.'});
  const url=new URL(req.url,'http://localhost');
  const action=url.searchParams.get('action')||(url.pathname==='/sources'?'sources':url.pathname==='/app'?'page':'');
  const mutating=!['GET','HEAD'].includes(req.method);
  if(mutating){
   let origin;try{origin=new URL(req.headers.origin).host;}catch{}
   if(!origin||origin!==req.headers.host)return json(403,{error:'Origine de la demande refusée.'});
   if(!String(req.headers['content-type']||'').startsWith('application/json'))return json(415,{error:'Format de demande invalide.'});
  }
  const secure=!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host||'');
  const setCookies=(session)=>res.setHeader('Set-Cookie',[
   'lc_access='+encodeURIComponent(session?.access_token||'')+'; Path=/; HttpOnly; SameSite=Lax; Max-Age='+(session?3600:0)+(secure?'; Secure':''),
   'lc_refresh='+encodeURIComponent(session?.refresh_token||'')+'; Path=/; HttpOnly; SameSite=Lax; Max-Age='+(session?604800:0)+(secure?'; Secure':'')
  ]);
  const parseBody=async()=>{
   if(req.body!==undefined){const raw=typeof req.body==='string'?req.body:JSON.stringify(req.body);if(Buffer.byteLength(raw)>MAX_BODY)throw new Error('BODY');return JSON.parse(raw);}
   let chunks=[],size=0;for await(const chunk of req){size+=chunk.length;if(size>MAX_BODY)throw new Error('BODY');chunks.push(chunk);}return JSON.parse(Buffer.concat(chunks).toString()||'{}');
  };
  try{
   const cookies=Object.fromEntries(String(req.headers.cookie||'').split(';').map(s=>s.trim().split(/=(.*)/s).slice(0,2)).filter(x=>x.length===2).map(([k,v])=>[k,decodeURIComponent(v)]));
   let token=cookies.lc_access;
   const isMember=async(access)=>{const m=await request('/rest/v1/longchamp_members?select=user_id&user_id=eq.'+encodeURIComponent(access.user.id),{token:access.token});if(!m.ok)throw new Error('DATABASE');return m.data.length===1;};
   if(action==='login'&&req.method==='POST'){
    const body=await parseBody();if(typeof body.email!=='string'||typeof body.password!=='string'||body.email.length>254||body.password.length>1024)return json(400,{error:'Renseignez votre adresse et votre mot de passe.'});
    const login=await request('/auth/v1/token?grant_type=password',{method:'POST',body:{email:body.email.trim(),password:body.password}});
    if(!login.ok)return json(login.status===429?429:401,{error:login.status===429?'Trop de tentatives. Réessayez dans quelques instants.':'Adresse ou mot de passe incorrect.'});
    if(!await isMember({user:login.data.user,token:login.data.access_token})){await request('/auth/v1/logout?scope=local',{method:'POST',token:login.data.access_token});return json(403,{error:'Ce compte ne dispose pas d’un accès à l’espace Longchamp.'});}
    setCookies(login.data);return json(200,{ok:true});
   }
   if(action==='logout'&&req.method==='POST'){
    let revoked=token?await request('/auth/v1/logout?scope=local',{method:'POST',token}):null;
    if((!revoked||[401,403].includes(revoked.status))&&cookies.lc_refresh){
     const refreshed=await request('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:cookies.lc_refresh}});
     if(refreshed.ok)revoked=await request('/auth/v1/logout?scope=local',{method:'POST',token:refreshed.data.access_token});
     else if(refreshed.status>=500)throw new Error('AUTH');
    }
    if(revoked&&!revoked.ok&&revoked.status!==401&&revoked.status!==403)throw new Error('AUTH');
    setCookies(null);return json(200,{ok:true});
   }
   let identity=token?await request('/auth/v1/user',{token}):{ok:false,status:401};
   if(!identity.ok&&[401,403].includes(identity.status)&&cookies.lc_refresh){
    const refreshed=await request('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:cookies.lc_refresh}});
    if(refreshed.ok){token=refreshed.data.access_token;identity=await request('/auth/v1/user',{token});if(identity.ok)setCookies(refreshed.data);}else if(refreshed.status>=500)throw new Error('AUTH');
   }
   if(!identity.ok){if(identity.status>=500)throw new Error('AUTH');setCookies(null);if(['page','sources'].includes(action)){res.statusCode=303;res.setHeader('Location','/');return res.end();}return json(401,{error:'Reconnectez-vous pour accéder à votre espace.'});}
   if(!await isMember({user:identity.data,token}))return json(403,{error:'Vous ne disposez pas d’un accès à cet espace.'});
   const readState=async()=>{const state=await request('/rest/v1/longchamp_watch_state?id=eq.longchamp&select=revision,follows',{token});if(!state.ok||state.data.length!==1)throw new Error('DATABASE');return state.data[0];};
   if(action==='state'&&req.method==='GET')return json(200,await readState());
   if(action==='state'&&req.method==='PUT'){
    const body=await parseBody();if(!Number.isSafeInteger(body.revision)||body.revision<0||!Array.isArray(body.follows)||body.follows.length>200)return json(400,{error:'Suivis invalides.'});
    const follows=body.follows.map(cleanFollow);
    if(follows.some(f=>!f||!f.id)||new Set(follows.map(f=>f.id)).size!==follows.length||new Set(follows.map(f=>f.kind+':'+f.value)).size!==follows.length)return json(400,{error:'Vérifiez les suivis : CAS, marchés, produits et doublons.'});
    const saved=await request('/rest/v1/rpc/longchamp_save_watch',{token,method:'POST',body:{expected_revision:body.revision,next_follows:follows}});
    if(!saved.ok){if(saved.data?.message==='LONGCHAMP_CONFLICT')return json(409,{error:'Une autre personne a modifié les suivis. La dernière version a été chargée. Vérifiez vos choix avant d’enregistrer à nouveau.',latest:await readState()});throw new Error('DATABASE');}
    return json(200,Array.isArray(saved.data)?saved.data[0]:saved.data);
   }
   if(['page','sources'].includes(action)&&req.method==='GET'){
    let html=await readPage(action==='sources'?'sources.html':'index.html');
    if(action==='page'){
     const initial=JSON.stringify(await readState()).replace(/</g,'\\u003c');
     const [core,ui]=await Promise.all([readPage('follow-core.js'),readPage('follow-ui.js')]);
     html=html.replace(/<!-- SUBSTANCE-FOLLOWS-START -->([\s\S]*?)<!-- SUBSTANCE-FOLLOWS-END -->/,(_,block)=>'<!-- SUBSTANCE-FOLLOWS-START --><script>window.LONGCHAMP_SHARED='+initial+';</script><script src="/shared-sync.js"></script>'+((block.match(/<style>[\s\S]*?<\/style>/)||[''])[0])+'<script>'+core+'\n'+ui+'</script><!-- SUBSTANCE-FOLLOWS-END -->');
     if(!html.includes('window.LONGCHAMP_SHARED='))throw new Error('TEMPLATE');
     html=html.replaceAll('cleo-labs-ia.github.io/cleo-longchamp-demo','Espace Longchamp');
     html=html.replace('</body>','<script src="/account.js"></script></body>');
    }else html=html.replace('Les suivis sont enregistrés uniquement dans ce navigateur ; pas de collecte ou notification automatique.','Les suivis sont communs à l’espace Longchamp et enregistrés en base ; actualisation manuelle, sans notification automatique.');
    res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html);
   }
   return json(404,{error:'Page introuvable.'});
  }catch(error){return json(error.message==='BODY'||error instanceof SyntaxError?400:503,{error:error.message==='BODY'||error instanceof SyntaxError?'Demande invalide.':'L’espace est temporairement indisponible. Réessayez ; vos suivis enregistrés sont conservés.'});}
 };
}
module.exports={createHandler};
