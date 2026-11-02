import {afterEach,expect,it,vi} from 'vitest';
import {SignalProcessor,AudioAnalyzer} from './audio-analyzer';
import {validatePreferences,loadPreferences,savePreferences} from './preferences';
import {paletteFor} from './palettes';
import {api} from '../native';
import {useMuse} from '../store';
import {emptyPlayback} from '../types';
import type {NativeAudioFrame} from './types';
vi.mock('../native',()=>({native:true,api:{visualizerActive:vi.fn(async()=>{}),visualizerFrame:vi.fn()}}));
const frame=(change:Partial<NativeAudioFrame>={}):NativeAudioFrame=>({trackId:null,epoch:1,sequence:1,available:true,playing:true,bands:Array(64).fill(.8),waveform:Array(128).fill(.2),rms:.1,bass:.2,mids:.05,treble:.01,...change});
afterEach(()=>{vi.useRealTimers();vi.clearAllMocks();localStorage.clear();});
it('smooths real frequency energy and waveform, then decays paused audio',()=>{
 const p=new SignalProcessor();expect(p.accept(frame(),0)).toBe('live');p.step(.016);expect(p.signals.bass).toBeGreaterThan(p.signals.mids);expect(p.signals.mids).toBeGreaterThan(p.signals.treble);expect(p.signals.spectrum[0]).toBeGreaterThan(0);expect(p.signals.spectrum[0]).toBeLessThan(.8);expect(p.signals.waveform[0]).toBeGreaterThan(0);
 const old=p.signals.bass;expect(p.accept(frame({playing:false}),20)).toBe('paused');p.step(.1);expect(p.signals.bass).toBeLessThan(old);expect(p.signals.live).toBe(false);
});
it('bounds transient triggers with adaptive flux and cooldown; resets stale epochs',()=>{
 const p=new SignalProcessor();p.accept(frame(),0);expect(p.signals.transient).toBe(1);p.step(.1);const peak=p.signals.transient;
 p.accept(frame({sequence:2,bands:Array(64).fill(0)}),100);p.accept(frame({sequence:3}),150);expect(p.signals.transient).toBe(peak);
 expect(p.accept(frame({sequence:3}),700)).toBe('stale');expect(p.signals.live).toBe(false);
 p.accept(frame({epoch:2,sequence:1,bands:Array(64).fill(0),rms:0,bass:0,mids:0,treble:0}),710);expect(p.signals.bass).toBe(0);expect(p.signals.transient).toBe(0);
});
it('validates persisted options and safely falls back from corrupted storage',()=>{
 expect(validatePreferences({effect:'unknown',theme:'unknown',intensity:Infinity,auto:'true'})).toEqual({effect:'spectrum',theme:'album',intensity:1,auto:false});expect(validatePreferences({intensity:100}).intensity).toBe(2);
 const value=validatePreferences({effect:'fire',theme:'ember',intensity:.6,auto:true});savePreferences(value);expect(loadPreferences()).toEqual(value);localStorage.setItem('muse.visual-effects.v1','bad');expect(loadPreferences().theme).toBe('album');expect(paletteFor('album','#123456')[0]).toBe('#123456');expect(paletteFor('album','bad')).toHaveLength(3);
});
it('shares one native lease, never overlaps polling, and stops after last subscriber',async()=>{
 vi.useFakeTimers();useMuse.setState({playback:emptyPlayback});let resolve!:(value:NativeAudioFrame)=>void;vi.mocked(api.visualizerFrame).mockImplementation(()=>new Promise(r=>{resolve=r;}));
 const analyzer=new AudioAnalyzer(),a=analyzer.subscribe(vi.fn()),b=analyzer.subscribe(vi.fn());await Promise.resolve();expect(api.visualizerActive).toHaveBeenCalledTimes(1);expect(api.visualizerFrame).toHaveBeenCalledTimes(1);
 await vi.advanceTimersByTimeAsync(1000);expect(api.visualizerFrame).toHaveBeenCalledTimes(1);a();expect(api.visualizerActive).not.toHaveBeenCalledWith(false);b();expect(api.visualizerActive).toHaveBeenLastCalledWith(false);resolve(frame());await vi.advanceTimersByTimeAsync(1000);expect(api.visualizerFrame).toHaveBeenCalledTimes(1);expect(analyzer.processor.signals.live).toBe(false);
});
