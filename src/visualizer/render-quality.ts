import type {EffectMode} from './types';
/** One 4K RGBA canvas is32MiB. Retro feedback is separately capped at1080p. */
export function renderSize(width:number,height:number,dpr:number,quality:number,mode:EffectMode){
 const area=Math.max(1,width*height),detailed=mode==='chalk'||mode==='retro';
 const ratio=Math.min(Math.max(1,dpr||1),3,Math.sqrt((detailed?3840*2160:650000)/area),8192/Math.max(width,height))*Math.sqrt(Math.max(.25,Math.min(1,quality)));
 return {width:Math.max(1,Math.round(width*ratio)),height:Math.max(1,Math.round(height*ratio)),ratio};
}
export function petalComposition(width:number,height:number){const area=Math.max(1,width*height)/(1080*640);return {scale:Math.max(.7,Math.min(2.8,Math.sqrt(area))),baseline:Math.round(Math.max(14,Math.min(28,14*Math.pow(area,.25))))};}
export function petalTilt(roll:number){return .64+.36*Math.abs(Math.cos(roll));}
