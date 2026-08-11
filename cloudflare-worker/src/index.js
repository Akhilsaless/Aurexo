const jsonHeaders={'content-type':'application/json; charset=utf-8'};
const FREE_AI=['ai-hub','openrouter','groq','qwen','deepseek','kimi','gemini'];
const PAID_AI=['openai'];
const PROVIDERS={
'ai-hub':{url:'AI_HUB_URL',key:'AI_HUB_API_KEY',model:null},
openrouter:{url:null,key:'OPENROUTER_API_KEY',model:'OPENROUTER_MODEL',base:'https://openrouter.ai/api/v1'},
groq:{url:null,key:'GROQ_API_KEY',model:'GROQ_MODEL',base:'https://api.groq.com/openai/v1'},
qwen:{url:'QWEN_BASE_URL',key:'QWEN_API_KEY',model:'QWEN_MODEL'},
deepseek:{url:null,key:'DEEPSEEK_API_KEY',model:'DEEPSEEK_MODEL',base:'https://api.deepseek.com'},
kimi:{url:'KIMI_BASE_URL',key:'KIMI_API_KEY',model:'KIMI_MODEL'},
gemini:{url:'GEMINI_OPENAI_BASE_URL',key:'GEMINI_OPENAI_API_KEY',model:'GEMINI_MODEL'},
openai:{url:null,key:'OPENAI_API_KEY',model:'OPENAI_MODEL',base:'https://api.openai.com/v1'}};
function cors(env,req){const origin=req.headers.get('origin')||'';const allowed=env.AUREXO_ALLOWED_ORIGIN||'https://akhilsaless.github.io';return {'access-control-allow-origin':origin===allowed?origin:allowed,'access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'content-type,authorization','access-control-max-age':'86400'};}
function respond(env,req,body,status=200,extra={}){return new Response(JSON.stringify(body),{status,headers:{...jsonHeaders,...cors(env,req),...extra}})}
function error(env,req,status,code,message,details){return respond(env,req,{ok:false,error:{code,message,details}},status)}
function secretPresent(env,n){return Boolean(env[n]&&String(env[n]).trim())}
function configured(env,id){const p=PROVIDERS[id];if(!p)return false;if(id==='ai-hub')return secretPresent(env,'AI_HUB_URL');return secretPresent(env,p.key)&&Boolean((p.url&&env[p.url])||p.base)}
function providerSummary(env){return Object.keys(PROVIDERS).map(id=>({id,configured:configured(env,id),tier:PAID_AI.includes(id)?'paid':'free-first'}));}
async function kvPut(env,key,value,ttl=3600){if(!env.AUREXO_KV)throw new Error('AUREXO_KV is not bound');await env.AUREXO_KV.put(key,JSON.stringify(value),{expirationTtl:ttl});}
async function kvGet(env,key){if(!env.AUREXO_KV)return null;return env.AUREXO_KV.get(key,'json');}
function b64url(bytes){return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
async function sha256(s){return new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)));}
function frontend(env){return env.AUREXO_FRONTEND_URL||'https://akhilsaless.github.io/Aurexo/';}
function callback(req,platform){return `${new URL(req.url).origin}/api/oauth/${platform}/callback`;}
async function oauthStart(env,req,platform){const state=crypto.randomUUID();const returnTo=frontend(env);await kvPut(env,`oauth:${state}`,{platform,returnTo,createdAt:Date.now()},900);
  if(platform==='youtube'){
    if(!env.YOUTUBE_CLIENT_ID)return error(env,req,503,'YOUTUBE_NOT_CONFIGURED','Set YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET.');
    const verifier=b64url(crypto.getRandomValues(new Uint8Array(32)));const challenge=b64url(await sha256(verifier));await kvPut(env,`pkce:${state}`,{verifier},900);
    const auth=new URL('https://accounts.google.com/o/oauth2/v2/auth');auth.search=new URLSearchParams({client_id:env.YOUTUBE_CLIENT_ID,redirect_uri:callback(req,'youtube'),response_type:'code',scope:'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly',access_type:'offline',include_granted_scopes:'true',prompt:'consent',state,code_challenge:challenge,code_challenge_method:'S256'}).toString();return Response.redirect(auth.toString(),302);
  }
  if(platform==='meta'){
    if(!env.META_APP_ID)return error(env,req,503,'META_NOT_CONFIGURED','Set META_APP_ID and META_APP_SECRET.');
    const auth=new URL('https://www.facebook.com/dialog/oauth');auth.search=new URLSearchParams({client_id:env.META_APP_ID,redirect_uri:callback(req,'meta'),response_type:'code',scope:'pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publish',state}).toString();return Response.redirect(auth.toString(),302);
  }
  return error(env,req,404,'UNKNOWN_PLATFORM','Unknown OAuth platform');
}
async function oauthCallback(env,req,platform){const u=new URL(req.url),state=u.searchParams.get('state'),code=u.searchParams.get('code');if(!state||!code)return error(env,req,400,'OAUTH_MISSING','Missing OAuth state or code');const ctx=await kvGet(env,`oauth:${state}`);if(!ctx||ctx.platform!==platform)return error(env,req,400,'OAUTH_STATE','OAuth state expired or invalid');let tokenData;
  if(platform==='youtube'){
    const pkce=await kvGet(env,`pkce:${state}`);const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:env.YOUTUBE_CLIENT_ID,client_secret:env.YOUTUBE_CLIENT_SECRET,code,code_verifier:pkce?.verifier||'',grant_type:'authorization_code',redirect_uri:callback(req,'youtube')})});tokenData=await r.json();if(!r.ok)return error(env,req,502,'YOUTUBE_TOKEN_ERROR','YouTube token exchange failed',tokenData);await kvPut(env,'social:youtube',{...tokenData,connectedAt:Date.now()},Math.max(tokenData.expires_in||3600,3600));
  } else {
    const r=await fetch('https://graph.facebook.com/v23.0/oauth/access_token?'+new URLSearchParams({client_id:env.META_APP_ID,client_secret:env.META_APP_SECRET,redirect_uri:callback(req,'meta'),code}));tokenData=await r.json();if(!r.ok)return error(env,req,502,'META_TOKEN_ERROR','Meta token exchange failed',tokenData);await kvPut(env,'social:meta',{...tokenData,connectedAt:Date.now()},Math.max(tokenData.expires_in||3600,3600));
  }
  const ret=new URL(ctx.returnTo);ret.hash='publishing';return Response.redirect(ret.toString(),302);
}
async function aiGenerate(env,req){let body;try{body=await req.json()}catch{return error(env,req,400,'BAD_JSON','Request body must be JSON')};const zeroCost=body.zeroCostLock!==false;let order=Array.isArray(body.providers)?body.providers:FREE_AI;if(!zeroCost)order=[...order,...PAID_AI];else order=order.filter(x=>!PAID_AI.includes(x));const chosen=order.find(id=>configured(env,id));if(!chosen)return error(env,req,503,'NO_AI_PROVIDER','No allowed AI provider is configured. Configure Universal AI Hub or another provider.');const p=PROVIDERS[chosen];const base=(p.url&&env[p.url])||p.base;if(chosen==='ai-hub'){const r=await fetch(base.replace(/\/$/,'')+'/v1/chat/completions',{method:'POST',headers:{'content-type':'application/json',...(env[p.key]?{authorization:`Bearer ${env[p.key]}`}:{})},body:JSON.stringify({model:body.model||'auto',messages:body.messages||[{role:'user',content:body.prompt||''}],temperature:body.temperature??0.4})});const data=await r.json().catch(()=>({}));return respond(env,req,{ok:r.ok,provider:chosen,data},r.ok?200:r.status);}
  const model=body.model||env[p.model];if(!model)return error(env,req,503,'MODEL_NOT_CONFIGURED',`${chosen} requires its model environment variable.`);const r=await fetch(base.replace(/\/$/,'')+'/chat/completions',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${env[p.key]}`},body:JSON.stringify({model,messages:body.messages||[{role:'user',content:body.prompt||''}],temperature:body.temperature??0.4})});const data=await r.json().catch(()=>({}));return respond(env,req,{ok:r.ok,provider:chosen,data},r.ok?200:r.status);
}
async function socialStatus(env,req){return respond(env,req,{ok:true,status:{youtube:Boolean(await kvGet(env,'social:youtube')),instagram:Boolean(await kvGet(env,'social:meta')),facebook:Boolean(await kvGet(env,'social:meta'))}})}
async function publish(env,req){let b;try{b=await req.json()}catch{return error(env,req,400,'BAD_JSON','JSON required')};if(b.approved!==true)return error(env,req,409,'APPROVAL_REQUIRED','Campaign must be explicitly approved before publish.');if(!['youtube','instagram','facebook'].includes(b.platform))return error(env,req,400,'BAD_PLATFORM','Unsupported platform');const token=await kvGet(env,b.platform==='youtube'?'social:youtube':'social:meta');if(!token)return error(env,req,409,'NOT_CONNECTED',`${b.platform} is not connected.`);return respond(env,req,{ok:false,ready:true,platform:b.platform,message:'Authenticated connector is ready. Media upload/publish remains gated until a real media file/URL is supplied; AUREXO will not fake publication.'},202)}
async function route(env,req){if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors(env,req)});const u=new URL(req.url),p=u.pathname;if(p==='/'||p==='/api/health')return respond(env,req,{ok:true,service:'AUREXO Secure Backend',version:'1.0.0',zeroCostDefault:env.AUREXO_ZERO_COST_DEFAULT!=='false'});if(p==='/api/providers')return respond(env,req,{ok:true,ai:providerSummary(env),social:{youtube:secretPresent(env,'YOUTUBE_CLIENT_ID')&&secretPresent(env,'YOUTUBE_CLIENT_SECRET'),meta:secretPresent(env,'META_APP_ID')&&secretPresent(env,'META_APP_SECRET')},video:{wan:Boolean(env.WAN_API_BASE_URL),hunyuan:Boolean(env.HUNYUAN_API_BASE_URL),runway:Boolean(env.RUNWAY_API_KEY),pika:Boolean(env.PIKA_API_KEY),kling:Boolean(env.KLING_API_KEY),hailuo:Boolean(env.HAILUO_API_KEY)}});if(p==='/api/ai/generate'&&req.method==='POST')return aiGenerate(env,req);if(p==='/api/social/status')return socialStatus(env,req);if(p==='/api/oauth/youtube/start')return oauthStart(env,req,'youtube');if(p==='/api/oauth/youtube/callback')return oauthCallback(env,req,'youtube');if(p==='/api/oauth/meta/start')return oauthStart(env,req,'meta');if(p==='/api/oauth/meta/callback')return oauthCallback(env,req,'meta');if(p==='/api/social/publish'&&req.method==='POST')return publish(env,req);return error(env,req,404,'NOT_FOUND','Route not found');}
export default {fetch(req,env){return route(env,req).catch(e=>error(env,req,500,'INTERNAL_ERROR',e?.message||'Unexpected backend error'));}};
