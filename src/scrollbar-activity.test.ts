import {afterEach,expect,it,vi} from 'vitest';
import {installScrollbarActivity} from './scrollbar-activity';
afterEach(()=>{vi.useRealTimers();document.body.innerHTML='';});
function pane(){const p=document.createElement('div');p.style.overflowY='auto';Object.defineProperties(p,{scrollHeight:{value:800},clientHeight:{value:200}});vi.spyOn(p,'getBoundingClientRect').mockReturnValue(new DOMRect(0,0,300,200));document.body.append(p);return p;}
it('reveals only the active pane, hides after idle, and cleans up timers and listeners',()=>{
 vi.useFakeTimers();const a=pane(),b=pane(),stop=installScrollbarActivity();a.dispatchEvent(new Event('scroll'));expect(a.classList.contains('scrollbar-active')).toBe(true);expect(b.classList.contains('scrollbar-active')).toBe(false);vi.advanceTimersByTime(800);a.dispatchEvent(new Event('scroll'));vi.advanceTimersByTime(800);expect(a.classList.contains('scrollbar-active')).toBe(true);vi.advanceTimersByTime(201);expect(a.classList.contains('scrollbar-active')).toBe(false);a.dispatchEvent(new Event('scroll'));stop();expect(a.classList.contains('scrollbar-active')).toBe(false);expect(vi.getTimerCount()).toBe(0);a.dispatchEvent(new Event('scroll'));expect(a.classList.contains('scrollbar-active')).toBe(false);
});
it('reveals at the scrollbar edge and holds visibility during dragging',()=>{
 vi.useFakeTimers();const p=pane(),stop=installScrollbarActivity();const down=new MouseEvent('pointerdown',{bubbles:true,clientX:297,clientY:100});p.dispatchEvent(down);expect(p.classList.contains('scrollbar-active')).toBe(true);vi.advanceTimersByTime(3000);expect(p.classList.contains('scrollbar-active')).toBe(true);document.dispatchEvent(new Event('pointerup'));vi.advanceTimersByTime(1001);expect(p.classList.contains('scrollbar-active')).toBe(false);stop();
});
it('handles wheel and keyboard focus in nested scroll containers',()=>{vi.useFakeTimers();const outer=pane(),inner=pane(),button=document.createElement('button');outer.append(inner);inner.append(button);const stop=installScrollbarActivity();button.dispatchEvent(new Event('wheel',{bubbles:true}));expect(inner.classList.contains('scrollbar-active')).toBe(true);expect(outer.classList.contains('scrollbar-active')).toBe(false);vi.advanceTimersByTime(1001);button.dispatchEvent(new Event('focusin',{bubbles:true}));expect(inner.classList.contains('scrollbar-active')).toBe(true);stop();});
it('draws overlay thumbs without reserving space and dragging changes the pane scroll position',()=>{
 vi.useFakeTimers();const p=pane(),stop=installScrollbarActivity();p.dispatchEvent(new Event('scroll'));const thumb=document.querySelector<HTMLDivElement>('.muse-scroll-indicator:not([hidden])')!;expect(thumb).not.toBeNull();expect(thumb.parentElement).toBe(document.body);expect(thumb.style.height).toBe('50px');thumb.dispatchEvent(new MouseEvent('pointerdown',{bubbles:true,clientY:20,clientX:295}));document.dispatchEvent(new MouseEvent('pointermove',{bubbles:true,clientY:95,clientX:295}));expect(p.scrollTop).toBe(300);document.dispatchEvent(new Event('pointerup'));vi.advanceTimersByTime(1001);expect(document.querySelector('.muse-scroll-indicator')).toBeNull();stop();
});
it('keeps nested indicators inside the clipped content viewport and hides offscreen horizontal thumbs',()=>{
 const content=document.createElement('div');content.style.overflowX='auto';content.style.overflowY='auto';vi.spyOn(content,'getBoundingClientRect').mockReturnValue(new DOMRect(0,0,300,180));document.body.append(content);
 const p=pane();p.style.overflowX='auto';Object.defineProperties(p,{scrollWidth:{value:600},clientWidth:{value:300}});vi.spyOn(p,'getBoundingClientRect').mockReturnValue(new DOMRect(0,80,300,200));content.append(p);
 const stop=installScrollbarActivity();p.dispatchEvent(new Event('scroll'));
 const bars=[...document.querySelectorAll<HTMLDivElement>('.muse-scroll-indicator')];
 expect(bars).toHaveLength(2);
 expect(bars[0].hidden).toBe(false);
 expect(Number.parseFloat(bars[0].style.top)+Number.parseFloat(bars[0].style.height)).toBeLessThanOrEqual(180);
 expect(bars[1].hidden).toBe(true);
 stop();
});
it('does not draw an indicator for a non-scrollable overflow axis',()=>{
 const p=pane();Object.defineProperties(p,{scrollWidth:{value:600},clientWidth:{value:300}});const stop=installScrollbarActivity();p.dispatchEvent(new Event('scroll'));
 expect([...document.querySelectorAll<HTMLDivElement>('.muse-scroll-indicator')].map(bar=>bar.hidden)).toEqual([false,true]);stop();
});
