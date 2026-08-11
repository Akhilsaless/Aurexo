import { uid, nowISO } from './domain.js';
import { estimateCampaignCost, chooseVideoProvider } from './providers.js';

const wait = ms => new Promise(r=>setTimeout(r,ms));
export async function runCampaignFromOpportunity(opp, settings, onStage=()=>{}){
  const campaign={id:uid('cmp'),title:opp.title,category:opp.category,state:'DISCOVERED',createdAt:nowISO(),updatedAt:nowISO(),audit:[],opportunity:opp};
  const emit=async(stage,label)=>{campaign.state=stage; campaign.updatedAt=nowISO(); campaign.audit.push({at:campaign.updatedAt,to:stage,note:label}); onStage({...campaign}); await wait(70);};
  await emit('RESEARCHING','Researcher gathering sources and claims');
  campaign.research={confidence:'High',sources:[
    {name:'Primary source placeholder',url:'#',claim:'Core announcement / technical fact'},
    {name:'Independent verification placeholder',url:'#',claim:'Context and comparison'}
  ],verifiedFacts:['The topic has enough evidence for an explainer.'],unknowns:['Live-source connector will replace placeholder research when the secure backend is connected.']};
  await emit('RESEARCH_READY','Fact Checker separated facts and unknowns');
  campaign.strategy={angle:`Why ${opp.category.toLowerCase()} is moving faster than most people realize`,audience:'Tech-curious global English audience',format:'45-second vertical explainer',cta:'Follow AUREXO for tomorrow’s technology explained today.',presenter:settings.nova.enabled?'Nova + B-roll':'Faceless cinematic'};
  await emit('STRATEGY_READY','Strategist locked angle, audience and format');
  campaign.script={hook:'What if this stops being a demo and becomes normal life?',body:`${opp.title}. Here is the part that matters: the shift is not just about a single product. It shows how quickly experimental technology can move into practical use. AUREXO will track what becomes real, what remains hype, and what changes next.`,cta:campaign.strategy.cta,altHooks:['This looked like science fiction until now.','The next tech shift may already be happening.']};
  await emit('SCRIPT_READY','Writer created master story and hook variants');
  const provider=chooseVideoProvider(settings.budgetMode,settings);
  campaign.scenePlan=[
    ['0–3s','Hook','Kinetic headline + rapid reveal'],['3–9s','Context','Nova or animated explainer frame'],['9–16s','Evidence','Source-led graphic / screenshot'],['16–24s','Meaning','B-roll + motion typography'],['24–32s','Implication','Future-use visualization'],['32–40s','Reality check','Fact vs hype split-screen'],['40–45s','CTA','AUREXO branded finish']
  ].map(([time,type,visual],i)=>({id:i+1,time,type,visual,provider:i===0&&settings.budgetMode!=='Economy'?'auto-video':provider.id}));
  campaign.render={aspect:'9:16',resolution:'1080x1920',mode:'hybrid',provider:provider.name,captions:true,voice:settings.nova.enabled?settings.nova.voice:'Narration',status:'manifest-ready'};
  campaign.cost=estimateCampaignCost(settings.budgetMode,campaign.scenePlan.length);
  await emit('PRODUCTION_PLANNED','Video Director created scene plan and render manifest');
  await emit('ASSETS_GENERATING','Editor assembled placeholder asset manifest');
  campaign.assets={masterVideo:'demo://master-vertical-video',cover:'demo://cover',voice:'demo://voice',rights:'Generated/demo placeholders — no unlicensed third-party media'};
  await emit('RENDER_READY','Render manifest ready');
  await emit('QUALITY_REVIEW','Quality Reviewer checking campaign');
  campaign.quality={score:92,threshold:85,checks:[['Factual confidence','pass'],['Hook','pass'],['Pacing','pass'],['Originality','pass'],['Captions','pass'],['Platform fit','pass'],['Media provenance','pass']],blocked:false};
  campaign.variants={
    youtube:{title:`${opp.title} — explained in 45 seconds`,caption:'The future is moving fast. Here’s what actually matters. #FutureTech #AI #Innovation',duration:45,status:'READY'},
    instagram:{title:'Reel',caption:'This looked futuristic. Now it’s getting practical. Save this for the next tech shift. #futuretech #innovation',duration:38,status:'READY'},
    facebook:{title:'The future is arriving faster than expected',caption:'A quick, clear look at what this technology means beyond the headline.',duration:45,status:'READY'}
  };
  await emit('AWAITING_APPROVAL','Campaign passed quality gate and awaits owner approval');
  return campaign;
}
