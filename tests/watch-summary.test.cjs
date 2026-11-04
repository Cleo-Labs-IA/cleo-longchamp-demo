'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {watchSummary,summarySources}=require('../server/watch-summary.cjs');
test('summary includes every item in its stated recent period, including date ties, and no machine counts',()=>{
 const articles=Array.from({length:18},(_,i)=>({key:'news-'+i,kind:'delta',date:i<16?'2026-10-29':'2026-09-01',title:'Actualité '+i,summary:'Note publiée',productKeys:i%2?['cuir']:['textile'],url:'https://example.org/'+i}));
 const data={updatedAt:'2026-11-02',articles};const result=watchSummary(data,{message:'fais moi un reseume des dernieres news'});assert.equal(result.kind,'summary');const notes=JSON.parse(result.text);assert.equal(notes.items.length,16);assert.deepEqual(notes.period,{from:'2026-10-27',to:'2026-11-02'});assert(!('total' in notes));assert(!('partial' in notes));assert(!notes.items[0].url);assert.equal(summarySources('Résumé.',data,result)[0].url,'https://example.org/0');for(const target of ['#watch:unknown','#watch:n0?invented=true','https://invented.invalid','https&#58;//invented.invalid','https\\://invented.invalid'])assert.throws(()=>summarySources('[Source]('+target+')',data,result));
 const scoped=JSON.parse(watchSummary(data,{message:'résume les actualités',product:{key:'cuir',label:'Cuir'}}).text);assert.equal(scoped.items.length,8);assert(scoped.items.every(x=>Number(x.key.slice(5))%2));
});
test('legal questions and ordinary messages cannot accidentally become supplied-text summaries',()=>{
 const data={updatedAt:'2026-11-02',articles:[]};for(const message of ['merci','plus court','Que change la nouvelle restriction PFHxA ?','Résume les nouvelles obligations de conformité','Quel seuil dans les dernières actualités ?','Résume les actualités : que dois-je faire pour être conforme ?','Résume les news : puis-je vendre ce sac ?','Résume les actualités et quels tests sont requis pour mes produits ?'])assert.equal(watchSummary(data,{message}),undefined);
});
test('an oversized recent period is refused explicitly rather than silently summarized from a truncated list',()=>{
 const data={updatedAt:'2026-11-02',articles:Array.from({length:200},(_,i)=>({key:String(i),kind:'delta',date:'2026-10-30',summary:'X'.repeat(1000)}))};assert.throws(()=>watchSummary(data,{message:'résume la veille'}),/période/);
});
