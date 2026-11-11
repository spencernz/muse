import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
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
 const user=userEvent.setup();render(<VisualEffectsTab/>);expect(screen.queryByText('Live audio')).not.toBeInTheDocument();
 expect(within(screen.getByRole('group',{name:'Visual effect'})).getAllByRole('button').map(button=>button.textContent)).toEqual(['Spectrum','Wave','Retro','Fire']);
 for(const name of ['Wave','Retro','Fire','Spectrum'])await user.click(screen.getByRole('button',{name}));
 await user.click(screen.getByRole('radio',{name:'Ice'}));expect(screen.getByRole('radio',{name:'Ice'})).toHaveAttribute('aria-checked','true');
 await user.click(screen.getByRole('button',{name:'Visual settings'}));fireEvent.change(screen.getByRole('slider',{name:'Visual energy'}),{target:{value:'1.5'}});
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
  render(<VisualEffectsTab/>);fireEvent.click(screen.getByRole('button',{name:'Visual settings'}));fireEvent.click(screen.getByRole('checkbox',{name:'Shuffle effects'}));
  const {act}=await import('@testing-library/react');await act(()=>vi.advanceTimersByTimeAsync(30000));
  expect(screen.getByRole('button',{name:'Fire'})).toHaveAttribute('aria-pressed','true');expect(JSON.parse(localStorage.getItem('muse.visual-effects.v1')!)).toMatchObject({effect:'fire',auto:true});
  await act(()=>vi.advanceTimersByTimeAsync(30000));expect(screen.getByRole('button',{name:'Retro'})).toHaveAttribute('aria-pressed','true');expect(state.construct).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('checkbox',{name:'Shuffle effects'}));await act(()=>vi.advanceTimersByTimeAsync(30000));expect(screen.getByRole('button',{name:'Retro'})).toHaveAttribute('aria-pressed','true');
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
it('keeps Retro free of energy and colour tuning and closes visual settings with Escape',async()=>{
 const user=userEvent.setup();render(<VisualEffectsTab/>);await user.click(screen.getByRole('button',{name:'Retro'}));expect(screen.queryByRole('radiogroup',{name:'Colour'})).not.toBeInTheDocument();
 const settings=screen.getByRole('button',{name:'Visual settings'});await user.click(settings);expect(settings).toHaveAttribute('aria-expanded','true');expect(screen.queryByRole('slider',{name:'Visual energy'})).not.toBeInTheDocument();expect(screen.getByRole('checkbox',{name:'Shuffle effects'})).toBeVisible();
 screen.getByRole('checkbox',{name:'Shuffle effects'}).focus();await user.keyboard('{Escape}');expect(screen.queryByRole('dialog',{name:'Visual settings'})).not.toBeInTheDocument();expect(settings).toHaveFocus();
});
it('migrates a saved Chalk Zoo effect to Wave',()=>{
 localStorage.setItem('muse.visual-effects.v1',JSON.stringify({effect:'chalk',theme:'ice',intensity:1,auto:false}));render(<VisualEffectsTab/>);expect(screen.getByRole('button',{name:'Wave'})).toHaveAttribute('aria-pressed','true');expect(screen.queryByRole('button',{name:'Chalk Zoo'})).not.toBeInTheDocument();
});
