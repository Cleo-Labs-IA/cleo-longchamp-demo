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
 await p.setViewport({width:1440,height:1000});await p.goto(url+'#cas-bijoux',{waitUntil:'networkidle0'});
 assert(await p.evaluate(()=>savedFollows.some(f=>f.value==='117-81-7')),'New DEHP example installed');
 assert(await p.$eval('#content',e=>e.innerText.includes('DEHP')&&e.innerText.includes('117-81-7')));
 assert(await p.$eval('#content',e=>e.innerText.includes('Avis privé')&&!e.innerText.includes('Rappel produit')));
 await p.screenshot({path:'/private/tmp/longchamp-dehp.png',fullPage:true});
 await p.evaluate(()=>{const old={...FDATA.initialFollow,paused:true,markets:['EU']};localStorage.setItem(FKEY,JSON.stringify([old]));localStorage.removeItem(FKEY+'-examples');});await p.reload({waitUntil:'networkidle0'});
 assert(await p.evaluate(()=>savedFollows.find(f=>f.value==='307-24-4').paused&&savedFollows.find(f=>f.value==='307-24-4').markets.join()==='EU'));
 assert.equal(await p.evaluate(()=>savedFollows.filter(f=>f.value==='117-81-7').length),1);
 await p.reload({waitUntil:'networkidle0'});assert.equal(await p.evaluate(()=>savedFollows.filter(f=>f.value==='117-81-7').length),1);
 await p.evaluate(()=>removeFollow('dehp-accessoires'));await p.reload({waitUntil:'networkidle0'});assert(await p.evaluate(()=>!savedFollows.some(f=>f.value==='117-81-7')),'Removal survives reload');
 await p.evaluate(()=>{localStorage.removeItem(FKEY+'-examples');});await p.reload({waitUntil:'networkidle0'});
 await p.evaluate(()=>{savedFollows=savedFollows.filter(f=>f.value==='117-81-7');persistFollows();setFollowFilter('mine');});const rows=await p.$$eval('#content .irow',es=>es.map(e=>e.innerText));assert(rows.length&&rows.every(t=>t.includes('DEHP')&&!t.includes('DINP')&&!t.includes('PFHxA')));
 await p.setViewport({width:390,height:844});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);console.log('PASS DEHP identity/source, second example migration, preserve existing settings, no duplicate, removal persists, CAS isolation, private notice label, mobile');
}finally{await browser.close();server.close();}
