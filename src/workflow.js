import { PLATFORMS } from './domain.js';
import { publishFallback } from './connectors.js';

export function approveCampaign(c) {
  if (c.state !== 'AWAITING_APPROVAL') throw new Error('Campaign is not awaiting approval');
  const at = new Date().toISOString();
  return {...c,state:'APPROVED',audit:[...(c.audit||[]),{at,to:'APPROVED',note:'Owner approved all platform variants'}]};
}
export function regenerateHook(c) {
  if (!c.script?.altHooks?.length) throw new Error('No alternate hook available');
  const at=new Date().toISOString();
  return {...c,script:{...c.script,hook:c.script.altHooks[0]},audit:[...(c.audit||[]),{at,to:c.state,note:'Owner regenerated hook only'}]};
}
export function rejectCampaign(c) {
  const at=new Date().toISOString();
  return {...c,state:'FAILED_BLOCKED',audit:[...(c.audit||[]),{at,to:'FAILED_BLOCKED',note:'Owner rejected campaign'}]};
}
export function scheduleCampaign(c, publishAt = new Date(Date.now()+60*60*1000).toISOString()) {
  if (c.state !== 'APPROVED') throw new Error('Only approved campaigns can be scheduled');
  const at=new Date().toISOString();
  return {...c,state:'SCHEDULED',scheduledAt:publishAt,audit:[...(c.audit||[]),{at,to:'SCHEDULED',note:'Owner scheduled campaign'}]};
}
export function simulatePublish(c, socialStatus) {
  if (c.state !== 'SCHEDULED') throw new Error('Only scheduled campaigns can publish');
  const variants=structuredClone(c.variants||{});
  for (const p of PLATFORMS) {
    const result=socialStatus[p]==='connected' ? {status:'SIMULATED_CONFIRMED',externalId:`demo_${p}_${Date.now()}`} : publishFallback(p);
    variants[p]={...variants[p],publishResult:result,status:result.status};
  }
  const at=new Date().toISOString();
  return {...c,state:'PUBLISHED',variants,publishedAt:at,audit:[...(c.audit||[]),{at,to:'PUBLISHED',note:'Local publish simulation completed; disconnected platforms recorded manual-publish fallback'}]};
}
