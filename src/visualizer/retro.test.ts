import {afterEach,expect,it,vi} from 'vitest';
import {PresetClock,RetroRenderer,chooseStartingPreset} from './retro';
import {retroPresets} from './retro-presets';
import {validatePreferences} from './preferences';
const mocks=vi.hoisted(()=>({loadPreset:vi.fn(),render:vi.fn(),setRendererSize:vi.fn(),createVisualizer:vi.fn()}));
vi.mock('butterchurn',()=>({default:{createVisualizer:mocks.createVisualizer}}));
afterEach(()=>{vi.restoreAllMocks();vi.clearAllMocks();});
it('migrates Storm and blends only after45 seconds of live playback',()=>{
 expect(validatePreferences({effect:'storm'}).effect).toBe('retro');const clock=new PresetClock();for(let i=0;i<1000;i++)expect(clock.step(.1,false,6)).toBe(false);for(let i=0;i<449;i++)expect(clock.step(.1,true,6)).toBe(false);expect(clock.step(.1,true,6)).toBe(true);expect(clock.index).toBe(1);
});
it('precompiles all curated equations without runtime eval and keeps full artist names',()=>{
 expect(retroPresets).toHaveLength(6);
 for(const {name,preset} of retroPresets){expect(name).toContain(' - ');expect(typeof preset.init_eqs).toBe('function');expect(typeof preset.frame_eqs).toBe('function');expect(preset.pixel_eqs===''||typeof preset.pixel_eqs==='function').toBe(true);
  // Real authored equation functions run on a finite zero-default MilkDrop state.
  const state=new Proxy<Record<string,number>>({time:1,fps:60,bass:1,mid:1,treb:1,bass_att:1,mid_att:1,treb_att:1,rad:.5},{get:(target,key)=>target[String(key)]??0});preset.init_eqs(state);preset.frame_eqs(state);expect(Object.values(state).every(Number.isFinite)).toBe(true);
 }
});
it('uses external PCM, resizes, freezes on pause and releases its own GPU context',async()=>{
 const random=vi.spyOn(Math,'random').mockReturnValue(.9);const loseContext=vi.fn();vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({isContextLost:()=>false,getExtension:()=>({loseContext})} as unknown as WebGL2RenderingContext);mocks.createVisualizer.mockReturnValue(mocks);
 const host=document.createElement('canvas'),parent=document.createElement('div');parent.append(host);const diagnostic=vi.fn(),renderer=new RetroRenderer(host,diagnostic);renderer.resize(3840,2160,1);await vi.waitFor(()=>expect(mocks.createVisualizer).toHaveBeenCalled());
 expect(mocks.createVisualizer.mock.calls[0][0]).toBe(null);const suppliedCanvas=mocks.createVisualizer.mock.calls[0][1] as HTMLCanvasElement;expect(suppliedCanvas.width).toBe(3840);expect(suppliedCanvas.height).toBe(2160);const options=mocks.createVisualizer.mock.calls[0][2];expect(options.pixelRatio).toBe(1);expect(options.textureRatio).toBe(.5);expect(mocks.loadPreset.mock.calls[0][0]).toBe(retroPresets[5].preset);expect(random).toHaveBeenCalled();
 const pcm=new Uint8Array(1024).fill(150);expect(renderer.draw(.016,true,pcm)).toBe(true);expect(mocks.render.mock.calls[0][0].audioLevels.timeByteArray).toBe(pcm);
 renderer.draw(.016,false,pcm);expect(mocks.render).toHaveBeenCalledTimes(1);
 for(let i=0;i<451;i++)renderer.draw(.1,true,pcm);expect(mocks.loadPreset.mock.calls.at(-1)?.[1]).toBe(5);
 renderer.resize(1600,900,1);expect(suppliedCanvas.width).toBe(1600);expect(suppliedCanvas.height).toBe(900);expect(mocks.setRendererSize).toHaveBeenLastCalledWith(1600,900,expect.objectContaining({width:1600,height:900,pixelRatio:1}));
 renderer.dispose();expect(loseContext).toHaveBeenCalledOnce();expect(parent.children).toHaveLength(1);
});
it('reports unavailable WebGL2 without touching the player',async()=>{
 vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(null);const report=vi.fn();const renderer=new RetroRenderer(document.createElement('canvas'),report);await vi.waitFor(()=>expect(report).toHaveBeenCalledWith(expect.stringContaining('needs WebGL2')));expect(renderer.draw(.016,true,new Uint8Array(1024))).toBe(false);renderer.dispose();
});

it('starts each Retro session from a random curated preset without repeating the last opening',()=>{const first=chooseStartingPreset(6,()=>0);const second=chooseStartingPreset(6,()=>0);expect(first).not.toBe(second);const third=chooseStartingPreset(6,()=>.999);expect(third).not.toBe(second);expect([first,second,third].every(index=>index>=0&&index<6)).toBe(true);});
