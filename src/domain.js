export const STATES = [
  'DISCOVERED','RESEARCHING','RESEARCH_READY','STRATEGY_READY','SCRIPT_READY','PRODUCTION_PLANNED',
  'ASSETS_GENERATING','RENDER_READY','QUALITY_REVIEW','NEEDS_FIX','AWAITING_APPROVAL','APPROVED',
  'SCHEDULED','PUBLISHING','PUBLISHED','ANALYTICS_SYNCED','LEARNED','FAILED_RETRYABLE','FAILED_BLOCKED'
];
export const PIPELINE = ['DISCOVERED','RESEARCHING','RESEARCH_READY','STRATEGY_READY','SCRIPT_READY','PRODUCTION_PLANNED','ASSETS_GENERATING','RENDER_READY','QUALITY_REVIEW','AWAITING_APPROVAL','APPROVED','SCHEDULED','PUBLISHING','PUBLISHED','ANALYTICS_SYNCED','LEARNED'];
export const PLATFORMS = ['youtube','instagram','facebook'];
export const AGENTS = [
  ['Scout','Finds fresh opportunities'],['Opportunity Scorer','Ranks reach, freshness, fit and effort'],['Researcher','Builds source-backed fact packs'],
  ['Fact Checker','Separates verified, inferred and blocked claims'],['Strategist','Chooses angle, audience, format and CTA'],['Writer','Creates master narrative and hooks'],
  ['Creative Director','Defines campaign look and visual concept'],['Nova','Maintains presenter identity and delivery'],['Video Director','Creates timestamped shot plan'],
  ['Editor','Builds render manifest and edit decisions'],['Thumbnail Agent','Creates cover/title pairings'],['Platform Adapter','Creates native variants per network'],
  ['Quality Reviewer','Checks facts, pacing, originality and fit'],['Publisher','Prepares and tracks external publishing'],['Growth Analyst','Normalizes performance'],
  ['Learning Agent','Turns evidence into next-run recommendations']
];
import { AI_INTEGRATIONS, VIDEO_INTEGRATIONS, VOICE_INTEGRATIONS, STORAGE_INTEGRATIONS, defaultIntegrationFlags } from './integration-registry.js';
export const DEFAULT_SETTINGS = {
  brand: 'AUREXO', niche: 'Future Tech + AI + Innovation', tagline: "Tomorrow's technology explained today.",
  approvalRequired: true, budgetMode: 'Economy', monthlyBudget: 2500, postsPerDay: 2, backendUrl:'',
  pillars: [{name:'AI & emerging software',weight:50},{name:'Gadgets + future living',weight:30},{name:'Robotics, space + future discoveries',weight:20}],
  nova: {enabled:true, voice:'Energetic futuristic', pace:'Fast-clear', look:'AUREXO Nova v1', pronunciation:'AI, AGI, NVIDIA, OpenAI, humanoid'},
  providers: {video:'hybrid-local', voice:'browser-tts', render:'hybrid', ai:'ai-hub'}, zeroCostLock: true,
  integrationFlags: {ai:defaultIntegrationFlags(AI_INTEGRATIONS),video:defaultIntegrationFlags(VIDEO_INTEGRATIONS),voice:defaultIntegrationFlags(VOICE_INTEGRATIONS),storage:defaultIntegrationFlags(STORAGE_INTEGRATIONS)},
  social: {youtube:'disconnected', instagram:'disconnected', facebook:'disconnected'}
};
export function nowISO(){ return new Date().toISOString(); }
export function uid(prefix='id'){ return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`; }
