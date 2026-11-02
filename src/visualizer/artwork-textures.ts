/** Real transparent artwork. Decoding/preprocessing happens once, never per frame. */
export interface ArtworkTextureSource {
 get(variant:number,layer:number,erosion:number):CanvasImageSource|undefined;
 point?(variant:number,index:number):readonly [number,number];
 status?():string|null;
 dispose():void;
}
const SIZE=512, CACHE_LIMIT=24;
type Sprite={canvas:HTMLCanvasElement;pixels:ImageData;distance:Float32Array;points:[number,number][]};
export class ArtworkTextures implements ArtworkTextureSource {
 private sprites:Sprite[]=[];private cache=new Map<string,HTMLCanvasElement>();private images:HTMLImageElement[]=[];private started=false;private dead=false;private error=false;
 constructor(private paths:string[],private grid=1){}
 status(){return this.error?'Artwork could not load. Switch effects to retry.':this.sprites.filter(Boolean).length<this.paths.length*this.grid*this.grid?'Loading artwork…':null;}
 private load(){
  this.started=true;
  for(const [file,path] of this.paths.entries()){
   const image=new Image();this.images.push(image);image.onload=()=>{if(this.dead)return;try{
    const cellW=image.naturalWidth/this.grid,cellH=image.naturalHeight/this.grid;
    if(cellW<512||cellH<512)throw new Error('Artwork resolution too small');
    for(let y=0;y<this.grid;y++)for(let x=0;x<this.grid;x++){
     const canvas=document.createElement('canvas');canvas.width=canvas.height=SIZE;const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw new Error('Canvas unavailable');
     ctx.drawImage(image,x*cellW,y*cellH,cellW,cellH,0,0,SIZE,SIZE);
     const pixels=ctx.getImageData(0,0,SIZE,SIZE),distance=new Float32Array(SIZE*SIZE),points:[number,number][]=[];
     // Remove isolated generated dust, while retaining fine alpha at the main silhouette.
     const visited=new Uint8Array(SIZE*SIZE),queue=new Int32Array(SIZE*SIZE);let largest:number[]=[];
     for(let start=0;start<visited.length;start++){if(visited[start]||pixels.data[start*4+3]<24)continue;let head=0,tail=1;queue[0]=start;visited[start]=1;const component:number[]=[];
      while(head<tail){const i=queue[head++];component.push(i);for(const j of [i-SIZE,i+SIZE,i%SIZE?i-1:-1,i%SIZE<SIZE-1?i+1:-1])if(j>=0&&j<visited.length&&!visited[j]&&pixels.data[j*4+3]>=24){visited[j]=1;queue[tail++]=j;}}
      if(component.length>largest.length)largest=component;
     }
     // Multi-cell atlases remove detached generated flecks; single heads retain chalk grain.
     if(this.grid>1){visited.fill(0);for(const i of largest)for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const xx=i%SIZE+dx,yy=Math.floor(i/SIZE)+dy;if(xx>=0&&xx<SIZE&&yy>=0&&yy<SIZE)visited[yy*SIZE+xx]=1;}for(let i=0;i<visited.length;i++)if(!visited[i])pixels.data[i*4+3]=0;}
     for(let i=0;i<distance.length;i++)distance[i]=pixels.data[i*4+3]>32?SIZE:0;
     for(let yy=1;yy<SIZE;yy++)for(let xx=1;xx<SIZE;xx++){const i=yy*SIZE+xx;distance[i]=Math.min(distance[i],distance[i-1]+1,distance[i-SIZE]+1);}
     for(let yy=SIZE-2;yy>=0;yy--)for(let xx=SIZE-2;xx>=0;xx--){const i=yy*SIZE+xx;distance[i]=Math.min(distance[i],distance[i+1]+1,distance[i+SIZE]+1);}
     for(let i=0;i<distance.length;i+=31)if(distance[i]>1&&distance[i]<14)points.push([i%SIZE/SIZE-.5,Math.floor(i/SIZE)/SIZE-.5]);
     ctx.putImageData(pixels,0,0);this.sprites[file*this.grid*this.grid+y*this.grid+x]={canvas,pixels,distance,points};
    }
    image.onload=image.onerror=null;image.removeAttribute('src');
   }catch{this.error=true;}};image.onerror=()=>{if(!this.dead)this.error=true;};image.src=path;
  }
 }
 point(variant:number,index:number):readonly[number,number]{const points=this.sprites[variant]?.points;return points?.length?points[(index*37)%points.length]:[0,0];}
 get(variant:number,layer:number,erosion:number){
  if(this.dead)return;if(!this.started)this.load();const sprite=this.sprites[variant];if(!sprite)return;
  const stage=Math.max(0,Math.min(6,Math.floor(erosion)));if(layer===1&&stage===0)return sprite.canvas;
  const key=`${variant}:${layer}:${stage}`;const cached=this.cache.get(key);if(cached){this.cache.delete(key);this.cache.set(key,cached);return cached;}
  const canvas=document.createElement('canvas');canvas.width=canvas.height=SIZE;const ctx=canvas.getContext('2d');if(!ctx)return;
  if(stage){const pixels=new ImageData(new Uint8ClampedArray(sprite.pixels.data),SIZE,SIZE);for(let i=0;i<sprite.distance.length;i++){const threshold=stage*(this.grid===1?2.5:14);pixels.data[i*4+3]*=Math.max(0,Math.min(1,(sprite.distance[i]-threshold+Math.sin(i*3.17)*3)/8));}ctx.putImageData(pixels,0,0);}else ctx.drawImage(sprite.canvas,0,0);
  // A downsample/upsample depth blur is supported in WKWebView as well as Chromium.
  if(layer!==1){const small=document.createElement('canvas');small.width=small.height=layer===0?64:160;const sc=small.getContext('2d');sc?.drawImage(canvas,0,0,small.width,small.height);ctx.clearRect(0,0,SIZE,SIZE);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(small,0,0,SIZE,SIZE);small.width=small.height=1;}
  this.cache.set(key,canvas);if(this.cache.size>CACHE_LIMIT){const first=this.cache.keys().next().value!;const old=this.cache.get(first)!;old.width=old.height=1;this.cache.delete(first);}return canvas;
 }
 dispose(){this.dead=true;for(const image of this.images){image.onload=image.onerror=null;image.src='';}for(const sprite of this.sprites)if(sprite)sprite.canvas.width=sprite.canvas.height=1;for(const canvas of this.cache.values())canvas.width=canvas.height=1;this.sprites=[];this.images=[];this.cache.clear();}
}
