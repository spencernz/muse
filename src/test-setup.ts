import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
  configurable: true,
  get() {
    return this.classList.contains("track-scroll") ? 384 : 48;
  },
});
Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
  configurable: true,
  get() {
    return 800;
  },
});
Object.defineProperty(HTMLElement.prototype, "clientHeight", {
  configurable: true,
  get() {
    return this.classList.contains("track-scroll") ? 384 : 48;
  },
});
Object.defineProperty(HTMLElement.prototype, "clientWidth", {
  configurable: true,
  get() {
    return 800;
  },
});
HTMLElement.prototype.getBoundingClientRect = function () {
  return new DOMRect(
    0,
    0,
    800,
    this.classList.contains("track-scroll") ? 384 : 48,
  );
};
HTMLElement.prototype.scrollTo = function (options) {
  this.scrollTop = typeof options === "object" ? (options.top ?? 0) : 0;
  this.dispatchEvent(new Event("scroll"));
};
class Observer implements ResizeObserver {
  callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  observe(target: Element) {
    queueMicrotask(() => {
      const size = [{ inlineSize: 800, blockSize: 384 }];
      if (target.isConnected)
        this.callback(
          [
            {
              target,
              contentRect: target.getBoundingClientRect(),
              borderBoxSize: size,
              contentBoxSize: size,
              devicePixelContentBoxSize: size,
            },
          ],
          this,
        );
    });
  }
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", Observer);
HTMLDialogElement.prototype.showModal = function () {
  this.setAttribute("open", "");
};
HTMLDialogElement.prototype.show = function () {
  this.setAttribute("open", "");
};
HTMLDialogElement.prototype.close = function () {
  this.removeAttribute("open");
};

// JSDOM does not implement matchMedia; tests may override this default preference.
Object.defineProperty(window, "matchMedia", { configurable:true, writable:true, value:(query:string)=>({matches:false,media:query,onchange:null,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){},dispatchEvent(){return true;}}) });
