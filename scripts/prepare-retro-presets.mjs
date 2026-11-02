// Compile trusted, pinned package equations into static source, preserving strict CSP.
// Runs on `npm install` (postinstall). The output is gitignored, so preset content is not redistributed in this repository.
import {readFileSync,writeFileSync} from 'node:fs';
const names=['Geiss - Plasma','Geiss - Ribbons','Flexi + Martin - tunnel of supraschismatika','Geiss - Kaleidoscope 1','Geiss - Cosmic Dust 2 - Trails 5b','martin - electric pool'];
function source(value){if(Array.isArray(value))return `[${value.map(source).join(',')}]`;if(value&&typeof value==='object'){const fields=[];for(const [key,v] of Object.entries(value)){if(key.endsWith('_str')){const name=key.slice(0,-4);if(v||name==='init_eqs'||name==='frame_eqs')fields.push(`${JSON.stringify(name)}:(a:Record<string,number>)=>{${v} return a;}`);else fields.push(`${JSON.stringify(name)}:""`);}else if(!Object.hasOwn(value,`${key}_str`))fields.push(`${JSON.stringify(key)}:${source(v)}`);}return `{${fields.join(',')}}`;}return JSON.stringify(value);}
const helpers=`const equal=(x:number,y:number)=>Math.abs(x-y)<.00001?1:0;
const above=(x:number,y:number)=>x>y?1:0,below=(x:number,y:number)=>x<y?1:0;
const mod=(x:number,y:number)=>y===0?0:Math.floor(x)%Math.floor(y);
const div=(x:number,y:number)=>y===0?0:x/y;
const sqrt=(x:number)=>Math.sqrt(Math.abs(x));
const pow=(x:number,y:number)=>Number.isFinite(Math.pow(x,y))?Math.pow(x,y):0;
const sqr=(x:number)=>x*x,bnot=(x:number)=>Math.abs(x)<.00001?1:0;
const randint=(x:number)=>Math.floor(Math.random()*Math.max(1,Math.floor(x)));
`;
const presets=names.map(name=>({name,preset:JSON.parse(readFileSync(`node_modules/butterchurn-presets/presets/converted/${name}.json`,'utf8'))}));
writeFileSync('src/visualizer/retro-presets.ts','// Generated at install time by scripts/prepare-retro-presets.mjs from the butterchurn-presets npm package. Do not commit.\n// butterchurn-presets: MIT ©2013–2018 Jordan Berg. Each preset remains the work of the artist named in its title.\n'+helpers+'export const retroPresets='+source(presets)+';\n');
