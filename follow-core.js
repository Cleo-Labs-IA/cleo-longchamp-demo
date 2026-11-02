(function(root){
 'use strict';
 const markets=new Set(['EU','FR','US-CA','CN','JP','KR','CA','SA','AE']);
 const products=new Set(['pliage','roseau','textile','souliers','lunettes','bijoux','emballages']);
 function validCAS(value){
  if(!/^\d{2,7}-\d{2}-\d$/.test(String(value)))return false;
  const digits=String(value).replaceAll('-',''),check=+digits.slice(-1);
  return [...digits.slice(0,-1)].reverse().reduce((sum,n,i)=>sum+(+n)*(i+1),0)%10===check;
 }
 function cleanFollow(raw){
  if(!raw||!['substance','family','text'].includes(raw.kind))return null;
  const value=String(raw.value||'').trim();
  if(raw.id&&!/^[a-zA-Z0-9_-]{1,100}$/.test(String(raw.id)))return null;
  if(raw.kind==='family'&&value!=='PFAS')return null;
  if(raw.kind==='text'&&!/^[\p{L}\p{N}-]+$/u.test(value))return null;
  if(!value||value.length>180||(raw.kind==='substance'&&!validCAS(value)))return null;
  if(!Array.isArray(raw.markets)||!raw.markets.length||!raw.markets.every(x=>markets.has(x)))return null;
  if(!Array.isArray(raw.products)||!raw.products.length||!raw.products.every(x=>products.has(x)))return null;
  return {id:String(raw.id||'').slice(0,100),kind:raw.kind,value,markets:[...new Set(raw.markets)],products:[...new Set(raw.products)],includeRelated:raw.includeRelated===true,paused:raw.paused===true};
 }
 function linksFor(follow,links){
  const f=cleanFollow(follow);if(!f||f.paused)return [];
  return links.filter(x=>x.kind===f.kind&&x.value===f.value&&(x.relation!=='related_scope'||f.includeRelated)&&x.markets.some(m=>f.markets.includes(m))&&x.products.some(p=>f.products.includes(p)));
 }
 const api={validCAS,cleanFollow,linksFor};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 root.LongchampWatch=api;
})(globalThis);
