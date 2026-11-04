const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function fixture(){
 const nodes=[];
 const node=()=>{const n={id:'',dataset:{},innerHTML:'',textContent:'',setAttribute(){},prepend(child){nodes.push(child);},after(){},querySelector(){return null;}};nodes.push(n);return n;};
 const content=node();content.id='content';const crumb=node();crumb.id='crumb';
 const scope={window:{},document:{hidden:false,createElement:node,getElementById:id=>nodes.find(n=>n.id===id)||null,querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){}},SIG:[{id:1,raw:'key-1',title:'Article de veille'}],CUR:'veille',srow:()=>'<article>Article de veille</article>',openSig(){},select(){},fToolbar:()=>'',setActive(){},navtop:node(),setInterval(){},AbortController,location:{replace(){}},fetch:async()=>new Response(JSON.stringify({viewer_id:'u',favorites:['key-1'],reviews:[]}),{status:200})};
 scope.window=Object.assign(scope.window,{scrollTo(){},addEventListener(){}});vm.createContext(scope);vm.runInContext(fs.readFileSync('public/article-feedback.js','utf8'),scope);return {scope,content,nodes};
}
test('feed and favorites rows show no rating or reaction commands before opening an article',async()=>{
 const {scope,content}=fixture();await scope.window.LongchampArticles.refresh();
 assert.doesNotMatch(scope.srow(1),/data-lc-(favorite|like|dislike|edit)/);
 scope.select('favoris');assert.doesNotMatch(content.innerHTML,/data-lc-(favorite|like|dislike|edit)/);
});
test('opening an article exposes favorite, reactions and comment commands in its detail',async()=>{
 const {scope,nodes}=fixture();await scope.window.LongchampArticles.refresh();scope.openSig(1);
 const detail=nodes.find(n=>n.id==='lc-article-detail');assert(detail);
 for(const control of ['favorite','like','dislike','edit'])assert.match(detail.innerHTML,new RegExp('data-lc-'+control));
 assert.match(detail.innerHTML,/Noter et commenter/);
});
