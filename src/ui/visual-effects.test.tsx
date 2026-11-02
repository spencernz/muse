import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {api} from '../native';
import {VisualEffectsTab} from './visual-effects';
const state=vi.hoisted(()=>({start:vi.fn(),stop:vi.fn(),dispose:vi.fn(),update:vi.fn(),construct:vi.fn()}));
vi.mock('../native',()=>({native:true,api:{windowFullscreen:vi.fn(),enterFullscreen:vi.fn(),exitFullscreen:vi.fn()}}));
vi.mock('@tauri-apps/api/event',()=>({listen:async()=>()=>{}}));
beforeEach(()=>{vi.mocked(api.windowFullscreen).mockResolvedValue(false);vi.mocked(api.enterFullscreen).mockResolvedValue();vi.mocked(api.exitFullscreen).mockResolvedValue();});
vi.mock('../use-album-atmosphere',()=>({useAlbumAtmosphere:()=>({accent:'#123456'})}));
vi.mock('../visualizer/audio-analyzer',()=>({audioAnalyzer:{subscribe:(listener:(status:string)=>void)=>{state.start();listener('live');return state.stop;}}}));
vi.mock('../visualizer/engine',()=>({VisualizerEngine:class{constructor(){state.construct();}update=state.update;dispose=state.dispose;}}));
afterEach(()=>{cleanup();vi.clearAllMocks();localStorage.clear();vi.restoreAllMocks();});
it('switches all modes and themes without recreating audio analysis or graphics resources',async()=>{
 const user=userEvent.setup();render(<VisualEffectsTab/>);expect(screen.getByRole('status')).toHaveTextContent('Live audio');
 for(const name of ['Wave','Retro','Fire','Chalk Zoo','Spectrum'])await user.click(screen.getByRole('button',{name}));
 await user.selectOptions(screen.getByRole('combobox'),'ice');fireEvent.change(screen.getByRole('slider',{name:'Visual energy'}),{target:{value:'1.5'}});
 expect(state.start).toHaveBeenCalledTimes(1);expect(state.construct).toHaveBeenCalledTimes(1);expect(state.dispose).not.toHaveBeenCalled();expect(JSON.parse(localStorage.getItem('muse.visual-effects.v1')!)).toMatchObject({effect:'spectrum',theme:'ice',intensity:1.5});
 cleanup();expect(state.stop).toHaveBeenCalledTimes(1);expect(state.dispose).toHaveBeenCalledTimes(1);
});
it('stops native analysis and graphics while the document is hidden and resumes on return',async()=>{
 render(<VisualEffectsTab/>);vi.spyOn(document,'hidden','get').mockReturnValue(true);fireEvent(document,new Event('visibilitychange'));
 await waitFor(()=>expect(state.dispose).toHaveBeenCalledTimes(1));expect(state.stop).toHaveBeenCalledTimes(1);
 vi.spyOn(document,'hidden','get').mockReturnValue(false);fireEvent(document,new Event('visibilitychange'));await waitFor(()=>expect(state.start).toHaveBeenCalledTimes(2));
});
it('shuffles to another effect every 30 seconds with a clear label and preserves the saved flag',async()=>{
 vi.useFakeTimers();vi.spyOn(Math,'random').mockReturnValue(.9);
 try{
  render(<VisualEffectsTab/>);fireEvent.click(screen.getByRole('checkbox',{name:'Shuffle effects'}));
  const {act}=await import('@testing-library/react');await act(()=>vi.advanceTimersByTimeAsync(30000));
  expect(screen.getByRole('button',{name:'Chalk Zoo'})).toHaveAttribute('aria-pressed','true');expect(JSON.parse(localStorage.getItem('muse.visual-effects.v1')!)).toMatchObject({effect:'chalk',auto:true});
  await act(()=>vi.advanceTimersByTimeAsync(30000));expect(screen.getByRole('button',{name:'Fire'})).toHaveAttribute('aria-pressed','true');expect(state.construct).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('checkbox',{name:'Shuffle effects'}));await act(()=>vi.advanceTimersByTimeAsync(30000));expect(screen.getByRole('button',{name:'Fire'})).toHaveAttribute('aria-pressed','true');
 }finally{vi.useRealTimers();}
});

it('promotes the same visual canvas to fullscreen and closes with focus restoration and no engine reset',async()=>{
 const user=userEvent.setup();render(<VisualEffectsTab expanded onExpandedChange={vi.fn()}/>);
 const button=screen.getByRole('button',{name:'Fullscreen visual'});await user.click(button);
 const dialog=screen.getByRole('dialog',{name:'Fullscreen visual effects'});expect(dialog).toHaveClass('visual-effects--fullscreen');expect(api.enterFullscreen).toHaveBeenCalledTimes(1);expect(state.construct).toHaveBeenCalledTimes(1);
 await user.click(screen.getByRole('button',{name:'Close fullscreen visual'}));await waitFor(()=>expect(screen.queryByRole('dialog',{name:'Fullscreen visual effects'})).not.toBeInTheDocument());
 expect(api.exitFullscreen).toHaveBeenCalledTimes(1);expect(screen.getByRole('button',{name:'Fullscreen visual'})).toHaveFocus();expect(screen.getByRole('button',{name:'Restore visual width'})).toHaveAttribute('aria-pressed','true');expect(state.construct).toHaveBeenCalledTimes(1);expect(state.stop).not.toHaveBeenCalled();
});
it('handles Escape and preserves a pre-existing native fullscreen window',async()=>{
 vi.mocked(api.windowFullscreen).mockResolvedValue(true);const user=userEvent.setup();render(<VisualEffectsTab/>);await user.click(screen.getByRole('button',{name:'Fullscreen visual'}));
 fireEvent(screen.getByRole('dialog',{name:'Fullscreen visual effects'}),new Event('cancel',{cancelable:true}));await waitFor(()=>expect(screen.queryByRole('dialog',{name:'Fullscreen visual effects'})).not.toBeInTheDocument());expect(api.enterFullscreen).not.toHaveBeenCalled();expect(api.exitFullscreen).not.toHaveBeenCalled();
});
it('restores the inline visual and reports failure when native fullscreen entry fails',async()=>{
 vi.mocked(api.enterFullscreen).mockRejectedValueOnce('unavailable');const user=userEvent.setup();render(<VisualEffectsTab/>);await user.click(screen.getByRole('button',{name:'Fullscreen visual'}));await waitFor(()=>expect(screen.queryByRole('dialog',{name:'Fullscreen visual effects'})).not.toBeInTheDocument());expect(screen.getByRole('alert')).toHaveTextContent('Could not open fullscreen');expect(screen.getByRole('button',{name:'Fullscreen visual'})).toBeEnabled();
});
it('keeps Chalk Zoo automatic with no energy or colour tuning controls',async()=>{
 const user=userEvent.setup();render(<VisualEffectsTab/>);await user.click(screen.getByRole('button',{name:'Chalk Zoo'}));expect(screen.queryByRole('slider',{name:'Visual energy'})).not.toBeInTheDocument();expect(screen.queryByRole('combobox')).not.toBeInTheDocument();expect(screen.getByRole('button',{name:'Fullscreen visual'})).toBeEnabled();
});
