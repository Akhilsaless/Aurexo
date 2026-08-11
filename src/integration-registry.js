export const AI_INTEGRATIONS = [
  {id:'ai-hub',name:'Universal AI Hub',tier:'free-first',defaultOn:true,env:['AI_HUB_URL'],note:'Preferred shared brain. Routes AUREXO agents to configured free/zero-cost models first.'},
  {id:'openrouter',name:'OpenRouter',tier:'free-first',defaultOn:false,env:['OPENROUTER_API_KEY'],note:'Optional direct fallback. Use only models you have explicitly marked free-qualified.'},
  {id:'groq',name:'Groq',tier:'free-first',defaultOn:false,env:['GROQ_API_KEY'],note:'Optional fast-model slot. Availability and free limits depend on your account.'},
  {id:'gemini',name:'Google Gemini compatible endpoint',tier:'free-first',defaultOn:false,env:['GEMINI_OPENAI_API_KEY'],note:'Optional provider slot. Free allowance must be confirmed before zero-cost routing.'},
  {id:'qwen',name:'Qwen',tier:'free-first',defaultOn:false,env:['QWEN_API_KEY'],note:'Chinese/global model slot with configurable endpoint and model.'},
  {id:'deepseek',name:'DeepSeek',tier:'free-first',defaultOn:false,env:['DEEPSEEK_API_KEY'],note:'Chinese model slot. Zero-cost router only uses it when free-qualified.'},
  {id:'kimi',name:'Kimi',tier:'free-first',defaultOn:false,env:['KIMI_API_KEY'],note:'Chinese model slot with configurable OpenAI-compatible endpoint.'},
  {id:'openai',name:'OpenAI',tier:'paid',defaultOn:false,env:['OPENAI_API_KEY'],note:'Optional premium AI brain. OFF by default and hard-blocked while Zero-Cost Lock is enabled.'},
  {id:'custom-ai-1',name:'Custom AI Provider 1',tier:'optional',defaultOn:false,env:['CUSTOM_AI_1_API_KEY'],note:'Generic compatible endpoint for future models.'},
  {id:'custom-ai-2',name:'Custom AI Provider 2',tier:'optional',defaultOn:false,env:['CUSTOM_AI_2_API_KEY'],note:'Second generic compatible endpoint for future models.'}
];

export const VIDEO_INTEGRATIONS = [
  {id:'hybrid-local',name:'Hybrid / No Generative Video',tier:'free',defaultOn:true,env:[],note:'Default zero-cost path: images, B-roll, captions, motion graphics and local/programmatic editing.'},
  {id:'wan',name:'Wan hosted/self-hosted slot',tier:'free-first',defaultOn:false,env:['WAN_API_BASE_URL'],note:'Optional open-model video endpoint. Compute may still cost money depending on host.'},
  {id:'hunyuan',name:'Hunyuan hosted/self-hosted slot',tier:'free-first',defaultOn:false,env:['HUNYUAN_API_BASE_URL'],note:'Optional open-model video endpoint. Compute may still cost money depending on host.'},
  {id:'runway',name:'Runway',tier:'paid-optional',defaultOn:false,env:['RUNWAY_API_KEY'],note:'Premium/credit-based video provider slot. Never called unless enabled and Zero-Cost Lock is off.'},
  {id:'pika',name:'Pika',tier:'paid-optional',defaultOn:false,env:['PIKA_API_KEY'],note:'Optional video provider. Can use any account allowance you have, otherwise remains disabled.'},
  {id:'kling',name:'Kling',tier:'paid-optional',defaultOn:false,env:['KLING_API_KEY'],note:'Optional premium video provider slot.'},
  {id:'hailuo',name:'Hailuo',tier:'paid-optional',defaultOn:false,env:['HAILUO_API_KEY'],note:'Optional premium video provider slot.'},
  {id:'custom-video',name:'Custom Video API',tier:'optional',defaultOn:false,env:['CUSTOM_VIDEO_API_BASE_URL'],note:'Generic slot for Veo/other future video APIs without changing AUREXO core.'}
];

export const VOICE_INTEGRATIONS = [
  {id:'browser-tts',name:'Browser / local voice preview',tier:'free',defaultOn:true,env:[],note:'Zero-cost fallback for preview/testing.'},
  {id:'custom-tts',name:'Custom TTS API',tier:'optional',defaultOn:false,env:['TTS_API_BASE_URL'],note:'Generic voice endpoint.'},
  {id:'elevenlabs',name:'ElevenLabs',tier:'paid-optional',defaultOn:false,env:['ELEVENLABS_API_KEY'],note:'Optional premium voice provider, OFF by default.'}
];

export const STORAGE_INTEGRATIONS = [
  {id:'local',name:'Local browser/runtime storage',tier:'free',defaultOn:true,env:[],note:'Default for personal prototype and offline/demo operation.'},
  {id:'supabase',name:'Supabase',tier:'free-first',defaultOn:false,env:['SUPABASE_URL','SUPABASE_ANON_KEY'],note:'Optional persistent database/auth/storage slot.'}
];

export function defaultIntegrationFlags(list){
  return Object.fromEntries(list.map(x=>[x.id,Boolean(x.defaultOn)]));
}

export function isPaidIntegration(x){
  return String(x.tier).includes('paid');
}

export function activeIntegrations(list, flags={}, zeroCostLock=true){
  return list.filter(x=>flags[x.id] && !(zeroCostLock && isPaidIntegration(x)));
}
