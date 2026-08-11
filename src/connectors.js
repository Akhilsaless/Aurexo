import { PLATFORMS } from './domain.js';
export const CAPABILITIES = {
  youtube:{connect:'oauth',shortVideo:true,schedule:true,analytics:true,notes:'Official upload path via YouTube Data API/OAuth.'},
  instagram:{connect:'meta-oauth',shortVideo:true,schedule:'capability-check',analytics:true,notes:'Professional-account/API eligibility must be validated at connection time.'},
  facebook:{connect:'meta-oauth',shortVideo:true,schedule:'capability-check',analytics:true,notes:'Page permissions and API capabilities must be validated at connection time.'}
};
export function connectorStatus(settings){ return PLATFORMS.map(id=>({id,status:settings.social[id],...CAPABILITIES[id]})); }
export function publishFallback(platform){ return {platform,status:'READY_FOR_MANUAL_PUBLISH',reason:'No live connector configured in this local build.'}; }
