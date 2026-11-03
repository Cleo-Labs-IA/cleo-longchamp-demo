'use strict';
document.getElementById('login').addEventListener('submit',async event=>{
 event.preventDefault();const button=event.currentTarget.querySelector('button'),error=document.getElementById('error');button.disabled=true;error.textContent='';
 try{const response=await fetch('/api/application?action=login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:document.getElementById('email').value,password:document.getElementById('password').value})});const result=await response.json();if(!response.ok)throw new Error(result.error||'Connexion indisponible.');location.assign('/app'+location.hash);}catch(e){error.textContent=e.message;}finally{button.disabled=false;}
});
