import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import puppeteer from '/Users/naomiehalioua/cleo-lvmh-demo-build/maj-2610/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
const root=path.resolve(process.argv[2]||new URL('..',import.meta.url).pathname);
const server=http.createServer((req,res)=>{const rel=decodeURIComponent(new URL(req.url,'http://localhost').pathname);const file=path.join(root,rel==='/'?'index.html':rel);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.readFile(file,(err,data)=>{if(err)res.writeHead(404).end();else res.end(data);});});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const errors=[];const p=await browser.newPage();p.on('pageerror',e=>errors.push(e.message));
const url=process.argv[3]||'http://127.0.0.1:'+server.address().port+'/';
try{
 await p.setViewport({width:1440,height:1000});await p.goto(url,{waitUntil:'networkidle0'});
 await p.evaluate(()=>{localStorage.removeItem('cleo-longchamp-follows-v1');});await p.reload({waitUntil:'networkidle0'});
 await p.evaluate(()=>select('suivis'));
 assert(await p.$eval('#content',e=>e.innerText.includes('PFHxA')));
 await p.evaluate(()=>setFollowFilter('mine'));
 const matches=await p.evaluate(()=>[...document.querySelectorAll('#content .irow')].map(e=>e.innerText));
 assert(matches.some(x=>x.includes('consultation sur l’inscription du PFHxA')));
 assert(matches.every(x=>!x.includes('PFBA')&&!x.includes('PFDA')&&!x.includes('Isotoner')&&!x.includes('Okaïdi')&&!x.includes('Norvège')));
 // Pause persists and removes the matched feed, then resume persists.
 await p.evaluate(()=>toggleFollow('pfhxa-longchamp'));await p.reload({waitUntil:'networkidle0'});await p.evaluate(()=>setFollowFilter('mine'));assert(await p.$eval('#content',e=>e.innerText.includes('Aucune actualité vérifiée')));
 await p.evaluate(()=>toggleFollow('pfhxa-longchamp'));await p.evaluate(()=>select('suivis'));
 await p.evaluate(()=>select('prod:cuir'));assert(await p.$eval('#content',e=>e.innerText.includes('Suivi par CAS')));await p.evaluate(()=>select('suivis'));
 await p.click('.fw-pill.link');assert(await p.$eval('#content',e=>e.innerText.includes('Le Pliage')));
 await p.evaluate(()=>openFollow());await p.type('#fw-value','307-24-5');await p.click('#fw-form [type=submit]');assert(await p.$eval('#fw-error',e=>e.textContent.includes('Vérifiez')));
 await p.$eval('#fw-value',e=>{e.value='50-00-0';e.dispatchEvent(new Event('input'));});await p.click('#fw-form [type=submit]');assert(await p.$eval('#content',e=>e.innerText.includes('CAS 50-00-0')&&e.innerText.includes('Recherche à compléter')));
 await p.reload({waitUntil:'networkidle0'});await p.evaluate(()=>select('suivis'));assert(await p.$eval('#content',e=>e.innerText.includes('CAS 50-00-0')));
 await p.evaluate(()=>openFollow('pfhxa-longchamp'));await p.$eval('[name=product][value=roseau]',e=>{e.checked=true;});await p.click('#fw-form [type=submit]');assert(await p.$eval('#content',e=>e.innerText.includes('Roseau')));
 await p.evaluate(()=>openFollow());await p.select('#fw-kind','family');await p.click('#fw-form [type=submit]');assert(await p.$eval('#content',e=>e.innerText.includes('Famille PFAS')));
 await p.evaluate(()=>openFollow());await p.select('#fw-kind','text');await p.select('#fw-value','us-ca-prop65-pfhxa-proposal-20261030');await p.click('#fw-form [type=submit]');assert(await p.$$eval('.fw-eyebrow',es=>es.some(e=>e.textContent==='Texte suivi')));
 await p.evaluate(()=>{savedFollows=savedFollows.filter(f=>f.id==='pfhxa-longchamp');savedFollows[0].products=['pliage','textile'];persistFollows();select('suivis');});
 await p.screenshot({path:process.env.LONGCHAMP_WATCH_SHOT||'/private/tmp/longchamp-mes-suivis.png',fullPage:true});
 await p.setViewport({width:390,height:844});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await p.evaluate(()=>openFollow());assert(await p.$eval('.fw-panel',e=>e.getBoundingClientRect().width<=390));await p.keyboard.press('Escape');assert.equal(await p.$('#fw-overlay'),null);
 assert.deepEqual(errors,[]);console.log('PASS browser create/edit/pause/resume/reload, CAS validation, unknown CAS honest, source identity isolation, family/text follows, product route, mobile, Escape, no JS errors');
}finally{await browser.close();server.close();}
