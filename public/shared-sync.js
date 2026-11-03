'use strict';
// This script runs only in the authenticated server-rendered application.
window.LongchampSharedStore={
 revision:window.LONGCHAMP_SHARED.revision,
 current:window.LONGCHAMP_SHARED,
 stopping:false,
 requests:new Set(),
 stop(){this.stopping=true;for(const controller of this.requests)controller.abort();},
 async request(method,body){
  if(this.stopping)throw new Error('Déconnexion en cours.');
  const controller=new AbortController();this.requests.add(controller);
  let response;try{response=await fetch('/api/application?action=state',{method,cache:'no-store',signal:controller.signal,headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});}finally{this.requests.delete(controller);}
  const data=await response.json();
  if(response.status===401){location.replace('/');throw new Error('Session terminée. Reconnectez-vous.');}
  if(!response.ok){const error=new Error(data.error||'Enregistrement indisponible.');error.latest=data.latest;throw error;}
  return data;
 },
 async save(follows){try{const state=await this.request('PUT',{revision:this.revision,follows});this.revision=state.revision;this.current=state;return state;}catch(error){if(error.latest){this.revision=error.latest.revision;this.current=error.latest;}throw error;}},
 async load(){return this.request('GET');},
 accept(state){if(state.revision>=this.revision){this.revision=state.revision;this.current=state;}return this.current;}
};
// Update on focus and periodically, except while a form is being edited or saved.
async function refreshSharedFollows(){
 if(LongchampSharedStore.stopping||document.hidden||typeof followSaving==='undefined'||followSaving||document.getElementById('fw-overlay'))return;
 try{const state=await LongchampSharedStore.load();
  if(LongchampSharedStore.stopping||document.hidden||followSaving||document.getElementById('fw-overlay'))return;
  if(state.revision>LongchampSharedStore.revision){LongchampSharedStore.accept(state);savedFollows=state.follows;followStorageError='';select(CUR);}
 }catch(error){followStorageError=error.message;}
}
window.addEventListener('focus',refreshSharedFollows);setInterval(refreshSharedFollows,15000);
