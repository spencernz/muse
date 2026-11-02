import {beforeEach,expect,it,vi} from 'vitest';
import {VisualFullscreenSession} from './fullscreen';
import {api} from '../native';
vi.mock('../native',()=>({api:{windowFullscreen:vi.fn(),enterFullscreen:vi.fn(),exitFullscreen:vi.fn()}}));
beforeEach(()=>{vi.resetAllMocks();vi.mocked(api.windowFullscreen).mockResolvedValue(false);vi.mocked(api.enterFullscreen).mockResolvedValue();vi.mocked(api.exitFullscreen).mockResolvedValue();});
it('waits for pending native entry before closing, and exits exactly once',async()=>{
 let entered!:()=>void;vi.mocked(api.enterFullscreen).mockReturnValue(new Promise(resolve=>{entered=resolve;}));
 const session=new VisualFullscreenSession();await Promise.resolve();const close=session.close();session.close();expect(api.exitFullscreen).not.toHaveBeenCalled();entered();await close;expect(api.exitFullscreen).toHaveBeenCalledTimes(1);
});
it('does not change fullscreen owned by the user before the visual opened',async()=>{
 vi.mocked(api.windowFullscreen).mockResolvedValue(true);const session=new VisualFullscreenSession();await session.ready;await session.close();expect(api.enterFullscreen).not.toHaveBeenCalled();expect(api.exitFullscreen).not.toHaveBeenCalled();
});
it('attempts restoration after partial entry failure instead of leaving a fullscreen request active',async()=>{
 vi.mocked(api.enterFullscreen).mockRejectedValue(new Error('transition failed'));const session=new VisualFullscreenSession();await expect(session.ready).rejects.toThrow('transition failed');await session.close();expect(api.exitFullscreen).toHaveBeenCalledTimes(1);
});
it('allows Close to retry after a native exit failure',async()=>{
 vi.mocked(api.exitFullscreen).mockRejectedValueOnce(new Error('temporarily unavailable'));const session=new VisualFullscreenSession();await session.ready;await expect(session.close()).rejects.toThrow('temporarily unavailable');await session.close();expect(api.exitFullscreen).toHaveBeenCalledTimes(2);
});
