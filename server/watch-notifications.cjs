'use strict';

function createWatchNotifications({config = {}, fetchImpl = globalThis.fetch} = {}) {
 const enabled = ['url','serviceKey','resendKey','fromEmail'].every(key => config[key]);
 const rpc = async (name, body) => {
  const response = await fetchImpl(config.url + '/rest/v1/rpc/' + name, {
   method:'POST', headers:{apikey:config.serviceKey, Authorization:'Bearer ' + config.serviceKey, 'Content-Type':'application/json'},
   body:JSON.stringify(body), signal:AbortSignal.timeout(15000)
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error('Notification database request failed');
  return data;
 };
 return {async drain({limit = 3} = {}) {
  if (!enabled) return {sent:0, failed:0, disabled:true};
  const result = {sent:0, failed:0};
  let jobs;
  try { jobs = await rpc('longchamp_claim_watch_notifications', {p_limit:Number.isInteger(limit) ? Math.max(0, Math.min(limit, 3)) : 3}); }
  catch { return {sent:0, failed:1}; }
  if (!Array.isArray(jobs)) return {sent:0, failed:1};
  for (const job of jobs) {
   let success = false, error = null;
   try {
    const lines = job.items.map(item => `${item.kind} : ${item.value}\nMarchés : ${(item.markets || []).join(', ')}\nProduits : ${(item.products || []).join(', ')}`);
    const response = await fetchImpl('https://api.resend.com/emails', {
     method:'POST', headers:{Authorization:'Bearer ' + config.resendKey, 'Content-Type':'application/json', 'Idempotency-Key':'longchamp-watch-' + job.id},
     body:JSON.stringify({from:config.fromEmail, to:['naomie@cleolabs.co'], subject:'Longchamp — ajout à Ma veille', text:`De nouveaux suivis ont été ajoutés à Ma veille (révision ${job.revision}).\n\n${lines.join('\n\n')}\n\nhttps://cleo-longchamp-demo.vercel.app/app#suivis`}),
     signal:AbortSignal.timeout(15000)
    });
    const data = await response.json().catch(() => null);
    success = response.ok && typeof data?.id === 'string' && data.id.length > 0;
    if (!success) error = 'Email provider rejected request (HTTP ' + response.status + ')';
   } catch { error = 'Email provider request failed'; }
   try {
    const acknowledged = await rpc('longchamp_finish_watch_notification', {p_id:job.id, p_claim_token:job.claim_token, p_success:success, p_error:error});
    if (success && acknowledged === true) result.sent++;
    else result.failed++;
   } catch { result.failed++; }
  }
  return result;
 }};
}
module.exports = {createWatchNotifications};
