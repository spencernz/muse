import {api} from '../native';
/** Restore only fullscreen owned by this presentation; serialize close after entry. */
export class VisualFullscreenSession {
 readonly ready:Promise<void>;
 private owned=false;private closing:Promise<void>|undefined;
 constructor(){this.ready=(async()=>{if(!await api.windowFullscreen()){this.owned=true;await api.enterFullscreen();}})();}
 close():Promise<void>{
  if(!this.closing){
   const closing=(async()=>{await this.ready.catch(()=>{});if(this.owned){await api.exitFullscreen();this.owned=false;}})();
   this.closing=closing;
   void closing.catch(()=>{if(this.closing===closing)this.closing=undefined;});
  }
  return this.closing;
 }
}
