import { VIDEO_INTEGRATIONS, activeIntegrations } from './integration-registry.js';

export const VIDEO_PROVIDERS = VIDEO_INTEGRATIONS.map(v=>({
  ...v,
  kind: v.id==='hybrid-local'?'local':'external',
  cost: v.tier,
  status: v.defaultOn?'ready':'optional',
  note: v.note
}));

export function chooseVideoProvider(mode='Economy', settings=null){
  if (!settings) return VIDEO_PROVIDERS.find(x=>x.id==='hybrid-local');
  const allowed=activeIntegrations(VIDEO_INTEGRATIONS,settings.integrationFlags?.video,settings.zeroCostLock);
  if(mode==='Economy') return allowed.find(x=>x.id==='hybrid-local') || allowed[0] || VIDEO_PROVIDERS[0];
  return allowed.find(x=>x.id!=='hybrid-local') || allowed.find(x=>x.id==='hybrid-local') || VIDEO_PROVIDERS[0];
}

export function estimateCampaignCost(mode='Economy', scenes=7){
  const base = mode==='Economy'? 0 : mode==='Balanced'? 35 : 120;
  return {currency:'INR',estimated:base + Math.max(0,scenes-6)*(mode==='Premium'?12:mode==='Balanced'?5:0),mode};
}
