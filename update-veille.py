"""Apply an oracle-verified incremental watch without rebuilding the reviewed UI.

Usage: python3 update-veille.py /path/to/veille/longchamp <AAAA-MM-JJ>
Run after review60/refresh.py if regenerating the original October snapshot.
Each run adds one dated pass: earlier passes stay in the page, in watchUpdate.history
and in sources.html (one section per pass).
"""
from pathlib import Path
import collections
import datetime
import html
import json
import re
import sys

root = Path(__file__).resolve().parent
workspace, date = Path(sys.argv[1]), sys.argv[2]
read = lambda p: json.loads(p.read_text())
evidence = read(workspace / 'evidence' / f'verification-{date}-oracle.json')
verified = {x['id'] for x in evidence if x['oracle'] == 'found' and x.get('via') != 'archive'}
cards = [c for c in read(workspace / 'fil.json') if c.get('relu', {}).get('date') == date]
assert all(c['key'] in verified for c in cards)
assert len({c['key'] for c in cards}) == len(cards)
assert len({c['source_url'] for c in cards}) == len(cards)
page = root / 'index.html'
text = page.read_text()
start = text.index('const DATA=') + len('const DATA=')
data, length = json.JSONDecoder().raw_decode(text[start:])
MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
def fr_long(d):
    y, m, j = map(int, d.split('-'))
    return f'{j} {MONTHS[m - 1]} {y}'
def fr_short(d):
    y, m, j = map(int, d.split('-'))
    return f'{j} {SHORT[m - 1]} {y}'
previous = data.get('watchUpdate') or {}
history = previous.get('history') or ([dict(date=previous['date'], since=previous['since'], verified_keys=previous['verified_keys'])] if previous.get('date') else [])
history = [h for h in history if h['date'] != date]
# Window of this pass: from the previous pass date (inclusive, like veille-trie.mjs) to date.
pass_since = history[-1]['date'] if history else '2026-10-29'
prev_to = data['reviewWindow']['to']
labels = {p['key']: p['label'] for p in data['products']}
existing = {s['raw']: s for s in data['sig']}
for c in cards:
    assert pass_since <= c['event_date'] <= date, (key := c['key'], c['event_date'])
    key = c['key']
    # Remove an unrelated repeated caveat from the regional proposal template.
    if key.startswith('us-ca-prop65-051') and '05107' not in key:
        c['caveat'] = c['caveat'].split(' La catégorie cuir')[0]
    if c['domain'] == 'epr':
        c['domain'] = 'circularite'
    if key == 'us-cpsc-qzh-duao-pyjamas-20261029':
        c['domain'] = 'securite'
    s = existing.get(key)
    if s is None:
        s = {'id': len(data['sig'])}
        data['sig'].append(s)
    s.update(title=c['title'], raw=key, pk=c['categories'][0], pks=c['categories'],
             sk=c['domain'], kind='delta', owner='', jur=c['country'], ctry=c['country'],
             code=c['code'], date=c['event_date'], source_date=c['date'],
             effective_date=c.get('effective_date', ''), event_type=c['event_type'],
             date_evidence=c['date_evidence'], sn=c['source_name'], su=c['source_url'], why=c['summary'])
    if c.get('status'):
        s['st'] = c['status']
    else:
        s.pop('st', None)
    data['deep'][key] = dict(severity=c['severity'], personalized_analysis=c['summary'],
        key_consequences=c['consequences'], impacted_products=[labels[k] for k in c['categories']],
        action_plan=c['actions'], obligations=c['obligations'], regulatory_context=c['caveat'],
        why='Vérification : ' + c['source_note'])
    data['cite'][key] = c['citation']
    if c.get('page_update') and key not in data['maj']:
        data['maj'].append(key)
for k, p in data['prod'].items():
    for kind in ('delta', 'struct'):
        p[kind] = [s['id'] for s in data['sig'] if s['kind'] == kind and k in s['pks']]
country = lambda s: 'United States of America' if s['ctry'] == 'United States' else s['ctry']
data['mapCounts'] = dict(collections.Counter(map(country, data['sig'])))
data['sigByCountry'] = dict(collections.Counter(country(s) for s in data['sig'] if s['kind'] == 'delta'))
data['reviewWindow'].update(to=date, days=(datetime.date.fromisoformat(date) - datetime.date.fromisoformat(data['reviewWindow']['from'])).days + 1)
history.append(dict(date=date, since=pass_since, verified_keys=[c['key'] for c in cards]))
history.sort(key=lambda h: h['date'])
all_keys = list(dict.fromkeys(k for h in history for k in h['verified_keys']))
data['watchUpdate'] = dict(date=history[-1]['date'], since=history[0]['since'], verified_keys=all_keys, history=history)
text = text[:start] + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + text[start + length:]
for old_to in {'2026-10-28', prev_to}:
    text = text.replace('30 août au ' + fr_long(old_to), '30 août au ' + fr_long(date))
    text = text.replace('30 août au ' + fr_short(old_to), '30 août au ' + fr_short(date))
text = text.replace('Actualités 60 jours', 'Actualités').replace('Aucune actualité sur 60 jours.', 'Aucune actualité pour cette catégorie.')
# These new private allegations and recalls are events, not legislation in force.
status_prefix = "const status60=o=>{"
LEGACY_STATUS = "if((DATA.watchUpdate?.verified_keys||[]).includes(o.raw)){if(/^us-ca-prop65-051/.test(o.raw))return 'Avis privé';if(o.event_type==='recall')return 'Rappel sectoriel';if((DATA.maj||[]).includes(o.raw))return 'Mise à jour';}"
# Generic rules for watch passes: an explicit card status wins (e.g. a law adopted but not yet in force);
# a Prop 65 60-day notice is a private allegation, recognised by its official notice URL rather than its key.
PROP65 = r"/oag\.ca\.gov\/prop65\/60-day-notice/i.test(o.su||'')||/^us-ca-prop65-051/.test(o.raw)"
status_update = "if(o.st)return o.st;if((DATA.watchUpdate?.verified_keys||[]).includes(o.raw)){if(" + PROP65 + ")return 'Avis privé';if(o.event_type==='recall')return 'Rappel sectoriel';if((DATA.maj||[]).includes(o.raw))return 'Mise à jour';}"
text = text.replace(status_prefix + LEGACY_STATUS, status_prefix)
if status_prefix + status_update not in text:
    text = text.replace(status_prefix, status_prefix + status_update)
# "À venir" is measured against the latest watch pass, not the frozen initial review date.
text = text.replace("if(e&&e>'2026-10-28')return 'À venir'", "if(e&&e>(DATA.watchUpdate?.date||'2026-10-28'))return 'À venir'")
text = text.replace("const typeText=o=>/^us-ca-prop65-051/.test(o.raw)?'Avis privé Proposition 65':", "const typeText=o=>")
text = text.replace("const typeText=o=>o.kind", "const typeText=o=>(" + PROP65 + ")?'Avis privé Proposition 65':o.kind")
text = text.replace("[['En vigueur','En vigueur'],['À venir','À venir'],['Projet','Projet']]", "[['En vigueur','En vigueur'],['À venir','À venir'],['Projet','Projet'],['Avis privé','Avis privé'],['Rappel sectoriel','Rappel sectoriel'],['Mise à jour','Mise à jour']]")
text = re.sub(r'<!-- EVENT-CATEGORIES-START -->.*?<!-- EVENT-CATEGORIES-END -->', '', text, flags=re.S)
category_js = (root / 'event-categories.js').read_text()
text = text.replace('</body>', '<!-- EVENT-CATEGORIES-START --><script>' + category_js + '</script><!-- EVENT-CATEGORIES-END --></body>')
page.write_text(text)
reports = [read(f) for f in sorted((workspace / 'veille').glob(f'{date}-*.json')) if not f.stem.endswith(('-a-revoir', '-oracle'))]
esc = lambda x: html.escape(str(x), quote=True)
sources = root / 'sources.html'
old = sources.read_text()
# The first pass (2 November) used unnamed markers; give them its date so each pass keeps its own section.
old = old.replace('<!-- WATCH-UPDATE-START -->', '<!-- WATCH-UPDATE-2026-11-02-START -->').replace('<!-- WATCH-UPDATE-END -->', '<!-- WATCH-UPDATE-2026-11-02-END -->')
old = re.sub(rf'<!-- WATCH-UPDATE-{date}-START -->.*?<!-- WATCH-UPDATE-{date}-END -->', '', old, flags=re.S)
section = f'<!-- WATCH-UPDATE-{date}-START --><section><h2>Actualisation au {fr_long(date)}</h2>'
if date == '2026-11-02':
    section += '<p>Complément du 29 octobre au 2 novembre, ajouté à la revue initiale du 30 août au 28 octobre. La fenêtre cumulée du fil est désormais du 30 août au 2 novembre. Le référentiel de fond conserve sa date de revue initiale. Couverture non exhaustive ; aucun rappel de tiers ni avis privé ne démontre une non-conformité Longchamp.</p>'
    section += '<p>Les consultations californiennes restent des projets. Les rappels enfants ne rendent pas leurs exigences applicables aux produits adultes Longchamp.</p>'
else:
    section += f'<p>Complément du {fr_long(pass_since)} au {fr_long(date)}, ajouté aux passages précédents. La fenêtre cumulée du fil est désormais du 30 août au {fr_long(date)}. Le référentiel de fond conserve sa date de revue initiale. Couverture non exhaustive ; aucun rappel de tiers ni avis privé ne démontre une non-conformité Longchamp.</p>'
section += f'<p>Verified: {len(cards)}/{len(cards)} citations relues sur les sources officielles · aucune estimation. Confiance élevée sur les citations retrouvées ; applicabilité à qualifier.</p>'
for c in cards:
    section += '<details><summary>' + esc(c['title']) + '</summary><p>' + esc(c['summary']) + '</p><p>' + esc(c['date_evidence']) + '</p><p>' + esc(c['caveat']) + '</p><p><a href="' + esc(c['source_url']) + '">' + esc(c['source_name']) + '</a></p></details>'
section += '<details><summary>Journal des recherches et accès limités</summary><pre>' + esc(json.dumps(reports, ensure_ascii=False, indent=2)) + f'</pre></details></section><!-- WATCH-UPDATE-{date}-END -->'
old = old.replace('<h1>Sources, fenêtre et limites de couverture</h1>', '<h1>Sources, fenêtre et limites de couverture</h1>' + section)
old = old.replace('Fenêtre stricte : 30 août au 28 octobre 2026 inclus.', 'Revue initiale : 30 août au 28 octobre 2026 inclus. Complément daté présenté ci-dessus.')
sources.write_text(old)
(root / 'watch').mkdir(exist_ok=True)
(root / 'watch' / f'{date}-accepted.json').write_text(json.dumps(cards, ensure_ascii=False, indent=2))
(root / 'watch' / f'{date}-evidence.json').write_text(json.dumps(evidence, ensure_ascii=False, indent=2))
assertions = dict(query='cards = fil.json filtered by relu.date == ' + date,
    raw=len(cards), unique_keys=len({c['key'] for c in cards}), unique_urls=len({c['source_url'] for c in cards}),
    oracle_found=sum(c['key'] in verified for c in cards), confidence='verified citations; applicability conditional')
(root / 'watch' / f'{date}-assertions.json').write_text(json.dumps(assertions, ensure_ascii=False, indent=2))
print(json.dumps(assertions, ensure_ascii=False))
