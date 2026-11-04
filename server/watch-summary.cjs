'use strict';
function watchSummary(data,{message,product=null}){
 const question=message.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase();
 if(!/\b(res(?:e)?um\w*|synthes\w*|recap\w*|bilan|point)\b/.test(question)||!/\b(news|actualites?|veille|nouveautes?)\b/.test(question)||/\b(obligations?|conformite|seuils?|applicab\w*|verifi\w*|interdit\w*)\b/.test(question))return undefined;
 // Only a self-contained request for a watch digest selects this operation.
 // Mixed questions and extra instructions retain the legal-analysis path.
 const words=question.replace(/['’\-]/g,' ').replace(/[.!?]+\s*$/,'').match(/[a-z]+|[^\sa-z]/g)||[];
 const vocabulary=new Set('fais fait faire moi nous un une le la les l de des du d mes nos votre notre dernier derniere derniers dernieres news actualite actualites veille nouveaute nouveautes resume reseume resumer resumes synthese recap recapitulatif bilan point court courte rapide rapidement bref brevement stp s il te plait peux tu pourriez vous pourrais donne donner toutes tous'.split(' '));
 if(words.some(w=>!vocabulary.has(w)))return undefined;
 const end=data.updatedAt;if(!/^\d{4}-\d{2}-\d{2}$/.test(end||''))throw Object.assign(new Error('La date de mise à jour de la veille manque.'),{status:503});
 const from=new Date(Date.parse(end+'T00:00:00Z')-6*86400000).toISOString().slice(0,10),unique=new Map();
 for(const item of data.articles.filter(a=>a.kind==='delta'&&a.date>=from&&a.date<=end&&(!product||a.productKeys?.includes(product.key))).sort((a,b)=>b.date.localeCompare(a.date)))if(!unique.has(item.key))unique.set(item.key,item);
 const notes={application:'Veille Longchamp',scope:product?.label||'Toutes les catégories',updatedAt:end,period:{from,to:end},provenance:'Synthèse des notes de veille publiées dans la plateforme, actualisées manuellement. Leurs sources sont présentées séparément par l’application. Aucune source n’est ouverte par ce résumé.',items:[...unique.values()].map(a=>({key:a.key,title:a.title,date:a.date,sourceDate:a.sourceDate,effectiveDate:a.effectiveDate,eventType:a.eventType,market:a.market,summary:a.summary}))};
 const text=JSON.stringify(notes);if(text.length>40000)throw Object.assign(new Error('Trop d’actualités sur cette période. Sélectionnez une catégorie pour obtenir son résumé.'),{status:413});
 return {kind:'summary',text};
}
function summarySources(text,data,transformation){
 const md=require('markdown-it')({html:false,linkify:true});
 function validate(tokens){for(const token of tokens){if(token.type==='image'||token.type==='link_open')throw new Error('summary_unexpected_link');if(token.children)validate(token.children);}}
 validate(md.parse(text,{}));
 return JSON.parse(transformation.text).items.map(item=>data.articles.find(a=>a.key===item.key)).filter(Boolean).map(a=>{let url=null;try{const parsed=new URL(a.url);if(['https:','http:'].includes(parsed.protocol)&&!parsed.username&&!parsed.password)url=parsed.href;}catch{}return {title:a.title,date:a.date,url};});
}
module.exports={watchSummary,summarySources};
