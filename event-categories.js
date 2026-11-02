// A source event is distinct from the products it concerns and its legal status.
function eventCategory60(o) {
  if (o.event_type === 'recall') return {label:'Rappel produit', tone:'recall'};
  if (/^us-ca-(p65-|prop65-051)/.test(o.raw)) return {label:'Avis privé', tone:'notice'};
  if (o.event_type === 'consultation' || (o.event_type === 'proposal' && /consultation/i.test(o.title))) return {label:'Consultation', tone:'consultation'};
  if (o.event_type === 'proposal') return {label:'Projet de réglementation', tone:'consultation'};
  if ((DATA.maj||[]).includes(o.raw)) return {label:'Mise à jour officielle', tone:'update'};
  if (o.event_type === 'enforcement') return {label:'Contrôle produit', tone:'notice'};
  return {label:typeText(o), tone:'publication'};
}
const eventStyle60=document.createElement('style');
eventStyle60.textContent=`
.event-category{display:inline-flex;align-items:center;border-radius:5px;padding:3px 8px;font:600 12px/1.4 var(--font);margin-bottom:7px;background:#f4f4f5;color:#3f3f46}
.event-category.recall{background:#fef2f2;color:#991b1b}
.event-category.notice{background:#fffbeb;color:#92400e}
.event-category.consultation{background:#eff6ff;color:#1e40af}
.event-category.update{background:#f0fdfa;color:#115e59}
`;
document.head.appendChild(eventStyle60);
srow=function(id){
 const o=SIG.find(x=>x.id===id),category=eventCategory60(o),products=prodNames60(o),date=o.kind==='delta'?o.date:o.source_date;
 return '<div class="irow" onclick="openSig('+id+')"><span class="fl">'+esc(o.code)+'</span><div><span class="event-category '+category.tone+'">'+esc(category.label)+'</span><h4>'+esc(o.title)+'</h4><div class="mt">'+products.map(p=>'<span class="itag">'+esc(p)+'</span>').join('')+'</div></div><div class="rt"><span>'+(date?esc(frDate60(date).trim()):'Texte de fond')+'</span></div></div>';
};
// Also show the same category when the complete source card is opened.
const openBeforeCategory60=openSig;
openSig=function(id){
 openBeforeCategory60(id);
 const o=SIG.find(x=>x.id===id),category=eventCategory60(o),header=document.querySelector('.idr-h');
 if(header){const badge=document.createElement('span');badge.className='event-category '+category.tone;badge.textContent=category.label;header.prepend(badge);}
};
select('group');
