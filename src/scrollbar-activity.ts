/** Zero-gutter scroll panes with temporary overlay thumbs; no per-frame React state. */
export function installScrollbarActivity(root:Document=document){
 type Overlay={vertical:HTMLDivElement;horizontal:HTMLDivElement};
 const timers=new Map<HTMLElement,ReturnType<typeof setTimeout>>(),overlays=new Map<HTMLElement,Overlay>();
 let held:HTMLElement|null=null,drag:{element:HTMLElement;horizontal:boolean;start:number;scroll:number;travel:number;range:number}|null=null;
 root.documentElement.classList.add('muse-auto-scrollbars');
 function remove(element:HTMLElement){element.classList.remove('scrollbar-active');const bars=overlays.get(element);bars?.vertical.remove();bars?.horizontal.remove();overlays.delete(element);timers.delete(element);}
 function visibleRect(element:HTMLElement){
  const pane=element.getBoundingClientRect(),visible={left:pane.left,right:pane.right,top:pane.top,bottom:pane.bottom};
  for(let parent=element.parentElement;parent;parent=parent.parentElement){
   const style=getComputedStyle(parent),rect=parent.getBoundingClientRect();
   if(/auto|scroll|hidden|clip/.test(style.overflowX)){visible.left=Math.max(visible.left,rect.left);visible.right=Math.min(visible.right,rect.right);}
   if(/auto|scroll|hidden|clip/.test(style.overflowY)){visible.top=Math.max(visible.top,rect.top);visible.bottom=Math.min(visible.bottom,rect.bottom);}
  }
  const viewport=root.defaultView;
  if(viewport){visible.left=Math.max(0,visible.left);visible.top=Math.max(0,visible.top);visible.right=Math.min(viewport.innerWidth,visible.right);visible.bottom=Math.min(viewport.innerHeight,visible.bottom);}
  return {pane,visible};
 }
 function position(element:HTMLElement){let bars=overlays.get(element);if(!bars){
   const create=(horizontal:boolean)=>{const bar=root.createElement('div');bar.className='muse-scroll-indicator';bar.setAttribute('aria-hidden','true');(element.closest('dialog')??root.body).append(bar);
    bar.addEventListener('pointerdown',event=>{event.preventDefault();held=element;const size=horizontal?element.clientWidth:element.clientHeight,total=horizontal?element.scrollWidth:element.scrollHeight,visible=visibleRect(element).visible,track=horizontal?visible.right-visible.left:visible.bottom-visible.top;drag={element,horizontal,start:horizontal?event.clientX:event.clientY,scroll:horizontal?element.scrollLeft:element.scrollTop,travel:Math.max(1,track-Math.min(track,Math.max(24,track*size/total))),range:Math.max(0,total-size)};bar.setPointerCapture?.(event.pointerId);reveal(element);});return bar;};
   bars={vertical:create(false),horizontal:create(true)};overlays.set(element,bars);
  }
  const {pane,visible}=visibleRect(element),style=getComputedStyle(element);
  for(const horizontal of [false,true]){const bar=horizontal?bars.horizontal:bars.vertical,size=horizontal?element.clientWidth:element.clientHeight,total=horizontal?element.scrollWidth:element.scrollHeight,track=horizontal?visible.right-visible.left:visible.bottom-visible.top;
   const axisOverflow=horizontal?style.overflowX:style.overflowY;
   bar.hidden=!/auto|scroll/.test(axisOverflow)||total-size<=2||track<24||(horizontal?pane.bottom>visible.bottom+1||pane.bottom<visible.top: pane.right>visible.right+1||pane.right<visible.left);
   if(bar.hidden)continue;
   const length=Math.min(track,Math.max(24,track*size/total)),scroll=horizontal?element.scrollLeft:element.scrollTop,offset=(track-length)*Math.max(0,scroll)/Math.max(1,total-size);
   Object.assign(bar.style,{left:`${horizontal?visible.left+offset:visible.right-10}px`,top:`${horizontal?pane.bottom-10:visible.top+offset}px`,width:`${horizontal?length:8}px`,height:`${horizontal?8:length}px`});}
 }
 function reveal(element:HTMLElement){clearTimeout(timers.get(element));element.classList.add('scrollbar-active');position(element);timers.set(element,setTimeout(()=>{if(element===held)return;remove(element);},1000));}
 function scrollable(target:EventTarget|null){let element=target instanceof HTMLElement?target:null;while(element){const style=getComputedStyle(element);if((element.scrollHeight>element.clientHeight&&/auto|scroll/.test(style.overflowY))||(element.scrollWidth>element.clientWidth&&/auto|scroll/.test(style.overflowX)))return element;element=element.parentElement;}return null;}
 function scroll(event:Event){if(event.target instanceof HTMLElement&&scrollable(event.target)===event.target)reveal(event.target);for(const pane of overlays.keys())if(pane!==event.target)position(pane);}
 function wheel(event:Event){const element=scrollable(event.target);if(element)reveal(element);}
 function edge(event:PointerEvent){if(drag&&event.type==='pointermove'){const delta=(drag.horizontal?event.clientX:event.clientY)-drag.start,value=drag.scroll+delta/drag.travel*drag.range;if(drag.horizontal)drag.element.scrollLeft=value;else drag.element.scrollTop=value;reveal(drag.element);return;}
  let element=event.target instanceof HTMLElement?event.target:null;while(element){const pane=scrollable(element);if(!pane)break;const rect=pane.getBoundingClientRect();const vertical=pane.scrollHeight>pane.clientHeight&&(event.clientX>=rect.right-18||getComputedStyle(pane).direction==='rtl'&&event.clientX<=rect.left+18);const horizontal=pane.scrollWidth>pane.clientWidth&&event.clientY>=rect.bottom-18;if(vertical||horizontal){reveal(pane);if(event.type==='pointerdown')held=pane;return;}element=pane.parentElement;}}
 function release(){const previous=held;held=null;drag=null;if(previous)reveal(previous);}
 function resize(){for(const pane of overlays.keys())position(pane);}
 root.addEventListener('scroll',scroll,true);root.addEventListener('wheel',wheel,{passive:true,capture:true});root.addEventListener('focusin',wheel,true);root.addEventListener('pointermove',edge,{passive:true});root.addEventListener('pointerdown',edge,{passive:true});root.addEventListener('pointerup',release);root.addEventListener('pointercancel',release);root.defaultView?.addEventListener('blur',release);root.defaultView?.addEventListener('resize',resize);
 return()=>{root.removeEventListener('scroll',scroll,true);root.removeEventListener('wheel',wheel,true);root.removeEventListener('focusin',wheel,true);root.removeEventListener('pointermove',edge);root.removeEventListener('pointerdown',edge);root.removeEventListener('pointerup',release);root.removeEventListener('pointercancel',release);root.defaultView?.removeEventListener('blur',release);root.defaultView?.removeEventListener('resize',resize);for(const [element,timer] of timers){clearTimeout(timer);remove(element);}held=null;drag=null;root.documentElement.classList.remove('muse-auto-scrollbars');};
}
