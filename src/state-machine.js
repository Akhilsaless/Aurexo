import { PIPELINE, STATES } from './domain.js';
export function canTransition(from,to){
  if (!STATES.includes(from) || !STATES.includes(to)) return false;
  if (to==='FAILED_RETRYABLE' || to==='FAILED_BLOCKED' || to==='NEEDS_FIX') return true;
  if (from==='NEEDS_FIX') return ['PRODUCTION_PLANNED','ASSETS_GENERATING','QUALITY_REVIEW'].includes(to);
  const a=PIPELINE.indexOf(from), b=PIPELINE.indexOf(to);
  return a>=0 && b===a+1;
}
export function transition(campaign,to,note=''){
  if (!canTransition(campaign.state,to)) throw new Error(`Invalid transition ${campaign.state} -> ${to}`);
  const stamp = new Date().toISOString();
  return {...campaign,state:to,updatedAt:stamp,audit:[...(campaign.audit||[]),{at:stamp,from:campaign.state,to,note}]};
}
export function progressFor(state){
  const idx=PIPELINE.indexOf(state); return idx<0?0:Math.round((idx/(PIPELINE.length-1))*100);
}
