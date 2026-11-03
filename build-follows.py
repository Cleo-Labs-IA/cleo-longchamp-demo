"""Embed the browser watch UI and independently verified source relationships.
Run after update-veille.py: python3 build-follows.py ~/veille/longchamp-pfhxa
"""
from pathlib import Path
import html,json,re,sys
root=Path(__file__).resolve().parent
ws=Path(sys.argv[1]);read=lambda p:json.loads(p.read_text())
reports={z:read(ws/'research'/f'{z}.json') for z in ['europe','california']}
evidence=read(ws/'evidence/verification-pfhxa-oracle.json')
found={e['id'] for e in evidence if e['oracle']=='found' and e.get('via')!='archive'}
page=root/'index.html';text=page.read_text();pos=text.index('const DATA=')+11;data,n=json.JSONDecoder().raw_decode(text[pos:])
known={s['raw']:s for s in data['sig']};links=[]
for zone,report in reports.items():
 for m in report['matches']:
  assert m['key'] in found and m['key'] in known,m['key']
  assert '2026-09-03'<=m['event_date']<='2026-11-02'
  markets=['EU','FR'] if zone=='europe' else ['US-CA']
  links.append(dict(key=m['key'],kind='substance',value='307-24-4',relation=m['relation'],markets=markets,products=['pliage','textile'],reason=('Champ PFAS : lien familial à qualifier, sans identification analytique du CAS.' if m['relation']=='related_scope' else 'La source vise explicitement le PFHxA et ses sels.'),source_url=m['source_url'],evidence_url=m.get('evidence_url',m['source_url'])))
assert 'pfhxa-salts-identities' in found
identities=[dict(cas=i['cas'],name={'307-24-4':'Acide perfluorohexanoïque','21615-47-4':'Perfluorohexanoate d’ammonium','2923-26-4':'Perfluorohexanoate de sodium'}[i['cas']],source_name=i['name'],short='PFHxA' if i['cas']=='307-24-4' else i['name'],aliases=['Acide perfluorohexanoïque','perfluorohexanoic acid','undecafluorohexanoic acid'] if i['cas']=='307-24-4' else [],source_url=i['source_url']) for i in reports['california']['identifiers']]
# The salt relationship is explicitly documented, not inferred from names.
for cas in ['21615-47-4','2923-26-4']:
 for link in list(links):
  if link['value']=='307-24-4' and link['relation']=='direct':links.append(dict(link,value=cas,reason='Sel du PFHxA explicitement visé ; identité confirmée par le registre officiel.'))
# PFAS family coverage is deliberately limited to this reviewed scope.
for link in list(links):
 if link['value']=='307-24-4':links.append(dict(link,kind='family',value='PFAS',relation='direct',reason='Champ PFAS documenté dans cette revue ; couverture de famille partielle.'))
examples=[];additional=[]
example_path=root/'watch/substances/dehp-research.json'
if example_path.exists():
 extra=read(example_path);proof=read(root/'watch/substances/dehp-evidence.json')
 verified={row['id'] for row in proof if row['oracle']=='found' and row.get('via')!='archive'}
 assert {'dehp-identity','dehp-product'}<=verified
 for link in extra['links']:
  assert link['key'] in verified and link['key'] in known
  assert known[link['key']]['date']==link['event_date']
  assert known[link['key']]['su']==link['source_url']
  assert link['value']==extra['identity']['cas']
 identities.append(extra['identity']);links.extend(extra['links']);examples.append(extra['example_follow']);additional.append(extra)
# A followed text matches events on its exact official source URL, never on title similarity.
for s in data['sig']:
 if s['kind']!='delta':continue
 for other in data['sig']:
  if other['kind']=='delta' and s['su']==other['su']:
   c=other['code'];markets=['EU','FR'] if c in ['EU','FR'] else ['US-CA'] if c=='US-CA' else [c]
   prods=[p for p,cat in {'pliage':'cuir','roseau':'cuir','textile':'textile','souliers':'souliers','lunettes':'lunettes','bijoux':'bijoux','emballages':'emballages'}.items() if cat in other['pks']]
   links.append(dict(key=other['raw'],kind='text',value=s['raw'],relation='direct',markets=markets,products=prods,reason='Même page officielle que le texte suivi.'))
config=dict(reviewedAt='2026-11-02',reviewedLabel='2 novembre 2026',window=dict(from_date='2026-09-03',to='2026-11-02'),identities=identities,links=links,initialFollow=dict(id='pfhxa-longchamp',kind='substance',value='307-24-4',markets=['EU','US-CA'],products=['pliage','textile'],includeRelated=True,paused=False))
config['exampleFollows']=examples
data['substanceWatch']=config
text=text[:pos]+json.dumps(data,ensure_ascii=False,separators=(',',':'))+text[pos+n:]
text=re.sub(r'<!-- SUBSTANCE-FOLLOWS-START -->.*?<!-- SUBSTANCE-FOLLOWS-END -->','',text,flags=re.S)
core=(root/'follow-core.js').read_text();ui=(root/'follow-ui.js').read_text();css=(root/'follow-ui.css').read_text()
text=text.replace('</body>','<!-- SUBSTANCE-FOLLOWS-START --><style>'+css+'</style><script>'+core+'\n'+ui+'</script><!-- SUBSTANCE-FOLLOWS-END --></body>')
page.write_text(text)
# Visible research audit. Existing events are re-read and reused, not counted again.
p=root/'sources.html';s=p.read_text();s=re.sub(r'<section><!-- SUBSTANCE-SOURCES-START -->.*?<!-- SUBSTANCE-SOURCES-END --></section>','',s,flags=re.S)
s=re.sub(r'<!-- SUBSTANCE-SOURCES-START -->.*?<!-- SUBSTANCE-SOURCES-END -->','',s,flags=re.S).replace('<section></section>','')
esc=lambda x:html.escape(str(x),quote=True)
section='<section><!-- SUBSTANCE-SOURCES-START --><h2>Veille ciblée PFHxA, recherche du 2 novembre 2026</h2><p>Événements recherchés du 3 septembre au 2 novembre, Union européenne/France et Californie, Le Pliage et prêt-à-porter. Les événements déjà publiés sont rattachés aux suivis, sans ajout de doublons. Les sels sont documentés par le registre officiel OAL. La FAQ française est un lien par champ PFAS, désactivable par le choix des champs connexes.</p><p>Les avis sur PFOA, les consultations PFBA/PFDA, le rappel Okaïdi PFAS totaux et la publication norvégienne ne sont pas des correspondances du suivi CAS PFHxA dans ce périmètre. L’association ne prouve ni présence de substance ni non-conformité.</p><p>Confiance élevée sur les citations retrouvées ; applicabilité produit à qualifier. Couverture non exhaustive. Les suivis sont enregistrés uniquement dans ce navigateur ; pas de collecte ou notification automatique.</p>'
for name,r in reports.items():section+='<details><summary>Journal et limites : '+esc(name)+'</summary><pre>'+esc(json.dumps(r,ensure_ascii=False,indent=2))+'</pre></details>'
for extra in additional:section+='<h3>Autre exemple : DEHP dans les accessoires</h3><p>Identité et avis privé relus sur les sources officielles. Présence dans les produits Longchamp non établie. L’avis existant n’est pas ajouté comme une nouvelle actualité.</p><details><summary>Sources et qualification DEHP</summary><pre>'+esc(json.dumps(extra,ensure_ascii=False,indent=2))+'</pre></details>'
section+='<!-- SUBSTANCE-SOURCES-END --></section>'
s=s.replace('</html>',section+'</html>');p.write_text(s)
out=root/'watch/substances';out.mkdir(exist_ok=True)
(out/'research.json').write_text(json.dumps(reports,ensure_ascii=False,indent=2))
(out/'evidence.json').write_text(json.dumps(evidence,ensure_ascii=False,indent=2))
(out/'config.json').write_text(json.dumps(config,ensure_ascii=False,indent=2))
# Assertions are derived from the actual reviewed match records, not a marketing counter.
assertions={'query':'unique matches[].key from regional research files, joined to oracle found ids and DATA.sig.raw','regional_match_rows':sum(len(r['matches'])for r in reports.values()),'unique_matched_events':len({m['key']for r in reports.values()for m in r['matches']}),'new_events':sum(len(r['cards'])for r in reports.values()),'confidence':'source quotes verified; product applicability conditional'}
assertions['additional_example_unique_events']=len({l['key']for extra in additional for l in extra['links']})
(out/'assertions.json').write_text(json.dumps(assertions,ensure_ascii=False,indent=2));print(json.dumps(assertions,ensure_ascii=False))
