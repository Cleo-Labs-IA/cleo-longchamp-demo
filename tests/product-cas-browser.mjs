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
 await p.setViewport({width:1440,height:1000});await p.goto(url,{waitUntil:'networkidle0'});await p.evaluate(()=>localStorage.removeItem('cleo-longchamp-follows-v1'));await p.reload({waitUntil:'networkidle0'});
 await p.evaluate(()=>select('prod:cuir'));
 const tab=await p.evaluate(()=>[...document.querySelectorAll('.pp-tabs button')].find(b=>b.textContent==='Suivi par CAS')?.outerHTML);assert(tab,'CAS tab visible in real product page');
 await p.evaluate(()=>[...document.querySelectorAll('.pp-tabs button')].find(b=>b.textContent==='Suivi par CAS').click());assert(await p.$eval('#content',e=>e.innerText.includes('307-24-4')&&e.innerText.includes('Actualités liées')));
 await p.screenshot({path:'/private/tmp/longchamp-produit-cas.png',fullPage:true});
 await p.evaluate(()=>select('prod:souliers'));await p.evaluate(()=>[...document.querySelectorAll('.pp-tabs button')].find(b=>b.textContent==='Suivi par CAS').click());assert(await p.$eval('#content',e=>!e.innerText.includes('PFHxA')));
 await p.click('#fw-product-add');assert.deepEqual(await p.$$eval('[name=product]:checked',es=>es.map(e=>e.value)),['souliers']);
 await p.type('#fw-value','50-00-0');await p.click('#fw-form [type=submit]');assert(await p.evaluate(()=>CUR==='prod:souliers'&&P60.tab==='cas'));assert(await p.$eval('#content',e=>e.innerText.includes('50-00-0')));
 await p.evaluate(()=>select('suivis'));assert(await p.$eval('#content',e=>e.innerText.includes('50-00-0')));
 await p.evaluate(()=>select('follow-product:roseau'));await p.click('#fw-product-add');assert.deepEqual(await p.$$eval('[name=product]:checked',es=>es.map(e=>e.value)),['roseau']);await p.type('#fw-value','PFHxA');await p.click('#fw-form [type=submit]');assert(await p.evaluate(()=>savedFollows.filter(f=>f.value==='307-24-4').length===1&&savedFollows.find(f=>f.value==='307-24-4').products.includes('roseau')));
 await p.evaluate(()=>{select('prod:cuir');ppTab60('cas');});await p.setViewport({width:390,height:844});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(errors,[]);console.log('PASS product CAS tab, exact saved substance, product isolation, prefilled product, save returns to product, global synchronization, individual product, mobile');
}finally{await browser.close();server.close();}
