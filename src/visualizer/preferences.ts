import { effects, themes, type EffectMode, type VisualPreferences } from "./types";
const key="muse.visual-effects.v1";
export function validatePreferences(value:unknown):VisualPreferences {
 const v=(value&&typeof value==="object"?value:{}) as Partial<VisualPreferences>;
 return {effect:String(v.effect)==="storm"?"retro":["petals","nebula"].includes(String(v.effect))?"spectrum":effects.includes(v.effect!)?v.effect!:"spectrum",theme:themes.includes(v.theme!)?v.theme!:"album",intensity:typeof v.intensity==="number"&&Number.isFinite(v.intensity)?Math.max(.25,Math.min(2,v.intensity)):1,auto:v.auto===true};
}
export function loadPreferences():VisualPreferences { try{return validatePreferences(JSON.parse(localStorage.getItem(key)??"null"));}catch{return validatePreferences(null);} }
export function savePreferences(value:VisualPreferences) {try{localStorage.setItem(key,JSON.stringify(value));}catch{/* Storage is optional; the player must remain usable. */}}

/** Pick uniformly from the other modes, avoiding consecutive repeats. */
export function shuffledEffect(current:EffectMode):EffectMode {
 const offset=1+Math.floor(Math.random()*(effects.length-1));
 return effects[(effects.indexOf(current)+offset)%effects.length];
}
