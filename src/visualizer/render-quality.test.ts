import {afterEach,expect,it,vi} from 'vitest';
import {VisualizerEngine} from './engine';
vi.mock('./audio-analyzer',()=>({audioAnalyzer:{processor:{signals:{live:false},step:vi.fn()}}}));
afterEach(()=>vi.restoreAllMocks());
it('renders a4K petal viewport at native backing resolution on capable displays',()=>{
 vi.stubGlobal('requestAnimationFrame',vi.fn(()=>1));vi.stubGlobal('cancelAnimationFrame',vi.fn());const canvas=document.createElement('canvas'),background=document.createElement('canvas');vi.spyOn(canvas,'getBoundingClientRect').mockReturnValue(new DOMRect(0,0,3840,2160));vi.spyOn(canvas,'getContext').mockReturnValue({setTransform:vi.fn()} as unknown as CanvasRenderingContext2D);vi.spyOn(window,'devicePixelRatio','get').mockReturnValue(1);
 const engine=new VisualizerEngine(canvas,background,{effect:'chalk',intensity:1,theme:'album',auto:false},['#eee','#aaa','#fff'],false,vi.fn());try{expect(canvas.width).toBe(3840);expect(canvas.height).toBe(2160);}finally{engine.dispose();}
});
import {renderSize,petalComposition,petalTilt} from './render-quality';
it('bounds4K buffers, preserves Retina detail and never makes edge-on petal slivers',()=>{
 expect(renderSize(1920,1080,2,1,'chalk')).toMatchObject({width:3840,height:2160});
 const huge=renderSize(7680,4320,2,1,'chalk');expect(huge.width*huge.height).toBeLessThanOrEqual(3840*2160);
 expect(renderSize(3840,2160,1,.5,'chalk').width).toBeLessThan(3840);
 expect(petalComposition(3840,2160).baseline).toBeGreaterThan(petalComposition(1080,640).baseline);
 expect(petalComposition(3840,2160).scale).toBeGreaterThan(2);
 for(let i=0;i<100;i++)expect(petalTilt(i*.1)).toBeGreaterThanOrEqual(.64);
});
