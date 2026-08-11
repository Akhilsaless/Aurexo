import { DEFAULT_SETTINGS } from './domain.js';
const KEY='aurexo_v2_state';
const clone=x=>structuredClone(x);
const fallback=()=>({settings:clone(DEFAULT_SETTINGS),campaigns:[],scheduled:[],spend:{today:0,month:0},growth:{youtube:{followers:0,views:0},instagram:{followers:0,views:0},facebook:{followers:0,views:0}},events:[]});
function merge(base, value){
  if(Array.isArray(base)) return Array.isArray(value)?value:clone(base);
  if(base && typeof base==='object'){
    const out={...base};
    for(const [k,v] of Object.entries(value||{})) out[k]=k in base?merge(base[k],v):v;
    return out;
  }
  return value===undefined?base:value;
}
export function load(){
  try {
    const raw=JSON.parse(localStorage.getItem(KEY)||'{}');
    const base=fallback();
    return {...base,...raw,settings:merge(base.settings,raw.settings||{}),spend:merge(base.spend,raw.spend||{}),growth:merge(base.growth,raw.growth||{})};
  } catch { return fallback(); }
}
export function save(s){ localStorage.setItem(KEY,JSON.stringify(s)); }
export function reset(){ localStorage.removeItem(KEY); return fallback(); }
