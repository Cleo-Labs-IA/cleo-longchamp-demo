'use strict';
const fs=require('node:fs'),path=require('node:path');
let keys;
function articleKeys(){
 if(!keys){
  const root=path.resolve(__dirname,'..');
  try{keys=JSON.parse(fs.readFileSync(path.join(root,'.generated/article-keys.json'),'utf8'));}
  catch(error){if(error.code!=='ENOENT')throw error;const html=fs.readFileSync(path.join(root,'index.html'),'utf8');keys=JSON.parse(html.match(/<script>const DATA=([\s\S]*?);\s*const PM=/)[1]).sig.map(s=>s.raw);}
 }
 return keys;
}
async function articleFeedback({action,method,body,request,token,allowedKeys}){
 const invalid=()=>({status:400,data:{error:'Vérifiez l’article, votre avis et la note choisie.'}});
 if(action==='articles'&&method==='GET'){
  const r=await request('/rest/v1/rpc/longchamp_get_articles',{token,method:'POST',body:{}});
  if(!r.ok)throw new Error('DATABASE');return {status:200,data:r.data};
 }
 if(method!=='PUT')return {status:405,data:{error:'Méthode indisponible.'}};
 if(!body||!allowedKeys.includes(body.article_key))return invalid();
 let endpoint,payload;
 if(action==='favorite'){
  if(typeof body.favorite!=='boolean')return invalid();
  endpoint='longchamp_set_favorite';payload={p_article_key:body.article_key,p_favorite:body.favorite};
 }else{
  if(![null,'like','dislike'].includes(body.reaction)||!(body.rating===null||Number.isInteger(body.rating)&&body.rating>=1&&body.rating<=5)||typeof body.comment!=='string'||[...body.comment].length>2000||!Number.isSafeInteger(body.revision)||body.revision<0)return invalid();
  endpoint='longchamp_save_review';payload={p_article_key:body.article_key,p_reaction:body.reaction,p_rating:body.rating,p_comment:body.comment.trim(),p_expected_revision:body.revision};
 }
 const r=await request('/rest/v1/rpc/'+endpoint,{token,method:'POST',body:payload});
 if(!r.ok){
  if(r.data?.message==='LONGCHAMP_REVIEW_CONFLICT')return {status:409,data:{error:'Votre avis a été modifié dans une autre fenêtre. Rechargez les avis avant de réessayer.'}};
  if(r.data?.message==='LONGCHAMP_INVALID')return invalid();
  throw new Error('DATABASE');
 }
 return {status:200,data:{ok:true}};
}
module.exports={articleKeys,articleFeedback};
