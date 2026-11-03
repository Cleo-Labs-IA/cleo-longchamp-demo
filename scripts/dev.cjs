'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {createHandler}=require('../server/app.cjs');
function createServer(options={}){
 const handler=createHandler(options),publicRoot=path.resolve(__dirname,'../public');
 return http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname==='/api/application'||pathname==='/app'||pathname==='/sources'||pathname==='/sources.html'){if(pathname==='/sources.html')req.url='/sources';return handler(req,res);}
  const file=path.resolve(publicRoot,'.'+(pathname==='/'?'/index.html':pathname));
  if(!file.startsWith(publicRoot+path.sep)){res.writeHead(404).end();return;}
  fs.readFile(file,(error,data)=>{if(error){res.writeHead(404).end();return;}res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html'})[path.extname(file)]||'application/octet-stream');res.setHeader('Cache-Control','no-store');res.end(data);});
 });
}
module.exports={createServer};
if(require.main===module)createServer().listen(Number(process.env.PORT||3198),'127.0.0.1',()=>console.log('Application : http://127.0.0.1:'+(process.env.PORT||3198)));
