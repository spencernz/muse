export const effects = ["spectrum", "wave", "retro", "fire", "chalk"] as const;
export type EffectMode = typeof effects[number];
export const themes = ["album", "aurora", "ember", "ice", "mono"] as const;
export type ColourTheme = typeof themes[number];
export interface VisualPreferences { effect: EffectMode; theme: ColourTheme; intensity: number; auto: boolean }
export interface NativeAudioFrame { trackId: string | null; epoch:number; sequence:number; playing:boolean; available:boolean; bands:number[]; waveform:number[]; pcm?:number[]; rms:number; bass:number; mids:number; treble:number }
export type AnalysisStatus = "starting" | "live" | "paused" | "stale" | "unavailable";
export interface AudioSignals { spectrum:Float32Array; waveform:Float32Array; rms:number; bass:number; mids:number; treble:number; transient:number; onset:number; live:boolean }
export type Palette = readonly [string,string,string];
export interface DrawFrame { ctx:CanvasRenderingContext2D; width:number; height:number; time:number; dt:number; signals:AudioSignals; palette:Palette; intensity:number; reduced:boolean; quality:number }
