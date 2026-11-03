'use strict';
(()=>{
 const style=document.createElement('style');style.textContent='.lc-account{position:fixed;bottom:16px;left:12px;z-index:50;display:flex;align-items:center;gap:8px;background:#fff;padding:7px 10px;border:1px solid #e4e4e7;border-radius:7px;font:11px system-ui}.lc-account button{background:white;border:1px solid #d4d4d8;border-radius:4px;padding:5px;cursor:pointer}@media(max-width:768px){.lc-account{bottom:66px;left:auto;right:8px}.lc-account span{display:none}}';document.head.append(style);
 const bar=document.createElement('div');bar.className='lc-account';bar.innerHTML='<span>Espace partagé Longchamp</span><button type="button">Se déconnecter</button>';document.body.append(bar);
 bar.querySelector('button').onclick=async()=>{window.LongchampSharedStore?.stop();try{const r=await fetch('/api/application?action=logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});if(!r.ok)throw new Error();location.replace('/');}catch{bar.querySelector('button').textContent='Réessayer la déconnexion';}};
})();
