'use strict';
// Operator command. It never sends an email and never changes an existing password.
function createAdminRequest(url,key,fetchImpl=globalThis.fetch){return async(endpoint,{method='GET',body,prefer}={})=>{
 const r=await fetchImpl(url+endpoint,{method,headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',...(prefer?{Prefer:prefer}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw new Error('Opération Supabase refusée ('+r.status+'). Aucun mail n’a été envoyé.');const text=await r.text();return text?JSON.parse(text):null;
};}
async function main(){
 const args=process.argv.slice(2),value=flag=>args[args.indexOf(flag)+1],apply=args.includes('--apply');
 const emails=(args.includes('--emails')?value('--emails'):'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
 if(emails.length!==2||new Set(emails).size!==2||emails.some(e=>!/^\S+@[^\s@]+\.[^\s@]+$/.test(e)))throw new Error('Fournir exactement les deux adresses distinctes : --emails adresse1,adresse2');
 if(!apply){console.log(JSON.stringify({mode:'dry-run',emails,actions:['réutiliser les comptes existants sans changer leurs mots de passe','créer les comptes manquants sans envoi de mail','autoriser ces personnes dans l’espace commun Longchamp'],outbound_email:false},null,2));return;}
 const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(url!=='https://tuzjcmvlclpfuroqnuis.supabase.co'||!key)throw new Error('Projet Supabase incorrect ou clé opérateur absente.');
 const request=createAdminRequest(url,key);
 const users=[];for(let page=1;;page++){const data=await request('/auth/v1/admin/users?page='+page+'&per_page=1000');users.push(...data.users);if(data.users.length<1000)break;}
 const existing=await request('/rest/v1/longchamp_members?select=user_id');
 const targetIds=users.filter(u=>emails.includes(u.email?.toLowerCase())).map(u=>u.id);
 if(existing.some(m=>!targetIds.includes(m.user_id)))throw new Error('Un autre accès Longchamp existe déjà. Vérifier les membres avant de continuer.');
 for(const email of emails){
  let user=users.find(u=>u.email?.toLowerCase()===email);
  if(!user)user=await request('/auth/v1/admin/users',{method:'POST',body:{email,email_confirm:true}});
  await request('/rest/v1/longchamp_members?on_conflict=user_id',{method:'POST',body:{user_id:user.id},prefer:'resolution=ignore-duplicates,return=minimal'});
 }
 console.log('Accès Longchamp autorisés. Aucun mot de passe fixe créé et aucun e-mail envoyé. Chaque personne demandera son code depuis la connexion.');
}
module.exports={createAdminRequest};
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
