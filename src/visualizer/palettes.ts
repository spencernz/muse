import type { ColourTheme, Palette } from "./types";
export function paletteFor(theme:ColourTheme, album:string):Palette {
 if(theme==="aurora")return ["#35e6cf","#986aff","#f46fbb"];
 if(theme==="ember")return ["#ff632f","#bf264e","#ffe39b"];
 if(theme==="ice")return ["#3d8cff","#55dfef","#e1f8ff"];
 if(theme==="mono")return ["#a9b2bb","#727c88","#ffffff"];
 const hex=album.replace("#","");const n=Number.parseInt(hex,16);
 if(!/^[0-9a-f]{6}$/i.test(hex))return ["#b9c3cb","#777e8a","#f1f2f4"];
 const r=(n>>16)&255,g=(n>>8)&255,b=n&255;
 const mix=(amount:number)=>"#"+[r,g,b].map(v=>Math.round(v+(255-v)*amount).toString(16).padStart(2,"0")).join("");
 return [album,mix(.2),mix(.7)];
}
export function rgb(hex:string):[number,number,number]{const n=parseInt(hex.slice(1),16);return [((n>>16)&255)/255,((n>>8)&255)/255,(n&255)/255];}
export function alpha(hex:string,opacity:number){return `${hex}${Math.round(Math.max(0,Math.min(1,opacity))*255).toString(16).padStart(2,"0")}`;}
