'use strict';
const fs=require('node:fs');
const crypto=require('node:crypto');
for(const file of ['public/index.html','public/login.js','public/login.css','public/shared-sync.js','public/account.js','public/article-feedback.js','public/article-feedback.css','index.html','sources.html','server/app.cjs','follow-ui.js'])if(!fs.existsSync(file))throw new Error('Missing '+file);
fs.mkdirSync('.generated',{recursive:true});fs.mkdirSync('public/assets',{recursive:true});
for(const [source,target] of [['index.html','app.html'],['sources.html','sources.html']]){
 const html=fs.readFileSync(source,'utf8').replace(/data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/=]+)/g,(_,type,encoded)=>{
  const image=Buffer.from(encoded,'base64'),name=crypto.createHash('sha256').update(image).digest('hex')+'.'+type;
  fs.writeFileSync('public/assets/'+name,image);return '/assets/'+name;
 });
 if(Buffer.byteLength(html)>4400000)throw new Error('Authenticated HTML exceeds the server response budget');
 fs.writeFileSync('.generated/'+target,html);
}
const data=JSON.parse(fs.readFileSync('index.html','utf8').match(/<script>const DATA=([\s\S]*?);\s*const PM=/)[1]);
fs.writeFileSync('.generated/article-keys.json',JSON.stringify([...new Set(data.sig.map(s=>s.raw))]));
fs.writeFileSync('.generated/chat-context.json',JSON.stringify({articles:data.sig.map(s=>({key:s.raw,title:s.title,market:s.ctry,date:s.date||null,url:s.su||null,summary:String(s.why||'').slice(0,3000)})),products:data.products.map(p=>({key:p.key,label:p.label,description:p.sub}))}));
fs.mkdirSync('public/vendor',{recursive:true});
const markdownDist=require('node:path').dirname(require.resolve('markdown-it'));
fs.copyFileSync(markdownDist+'/browser/markdown-it.umd.min.js','public/vendor/markdown-it.js');
fs.copyFileSync(markdownDist+'/../LICENSE','public/vendor/markdown-it.LICENSE');
console.log('Application prête : fichiers publics limités à la connexion ; pages et données servies après authentification.');
