declare module 'butterchurn' {
 interface Visualizer {loadPreset(preset:object,blend:number):void;setRendererSize(width:number,height:number,options?:object):void;render(options:{elapsedTime:number;audioLevels:{timeByteArray:Uint8Array;timeByteArrayL:Uint8Array;timeByteArrayR:Uint8Array}}):void}
 const butterchurn:{createVisualizer(context:null,canvas:HTMLCanvasElement,options:object):Visualizer};
 export default butterchurn;
}
