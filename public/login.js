'use strict';
(()=>{
 const login=document.getElementById('login'),verify=document.getElementById('verify'),step=document.getElementById('code-step'),resend=document.getElementById('resend');
 let email='',busy=false,retryAt=0;
 function updateResend(){const seconds=Math.max(0,Math.ceil((retryAt-Date.now())/1000));resend.disabled=busy||seconds>0;resend.textContent=seconds?'Renvoyer dans '+seconds+' s':'Renvoyer un code';}
 function setBusy(value){busy=value;login.querySelector('button').disabled=value;verify.querySelector('button').disabled=value;document.getElementById('change-email').disabled=value;updateResend();}
 async function post(action,body){const response=await fetch('/api/application?action='+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const result=await response.json();if(!response.ok){if(response.status===429)retryAt=Date.now()+60000;throw new Error(result.error||'Connexion indisponible.');}return result;}
 async function send(){if(busy)return;const error=document.getElementById(step.hidden?'error':'code-error');error.textContent='';setBusy(true);
  try{await post('request-code',{email});retryAt=Date.now()+60000;login.hidden=true;step.hidden=false;document.getElementById('sent-to').textContent='Si '+email+' dispose d’un accès Longchamp, un code vient de lui être envoyé.';document.getElementById('code').value='';document.getElementById('code').focus();}
  catch(e){error.textContent=e.message;}finally{setBusy(false);}
 }
 login.addEventListener('submit',event=>{event.preventDefault();email=document.getElementById('email').value.trim();send();});
 resend.onclick=send;
 document.getElementById('change-email').onclick=()=>{step.hidden=true;login.hidden=false;document.getElementById('code').value='';document.getElementById('error').textContent='';document.getElementById('email').focus();};
 verify.addEventListener('submit',async event=>{event.preventDefault();if(busy)return;const error=document.getElementById('code-error');error.textContent='';setBusy(true);
  try{await post('verify-code',{code:document.getElementById('code').value.trim()});location.assign('/app'+location.hash);}catch(e){error.textContent=e.message;}finally{setBusy(false);}
 });
 setInterval(updateResend,1000);
})();
