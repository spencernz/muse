import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  AlbumNavigation,
  scatterVector,
  type AlbumRoute,
} from "./album-navigation";

type Recorded = {
  element: HTMLElement;
  frames: Keyframe[];
  options: KeyframeAnimationOptions;
  cancel: ReturnType<typeof vi.fn>;
  finish: () => void;
};
let records: Recorded[];
let manualCompletion = false;
let controller: AlbumNavigation | undefined;
const originalAnimate = HTMLElement.prototype.animate;
beforeEach(() => {
  vi.useFakeTimers();
  records = [];
  manualCompletion = false;
  Object.defineProperty(HTMLElement.prototype, "animate", {
    configurable: true,
    writable: true,
    value: function (
      this: HTMLElement,
      frames: Keyframe[],
      options: KeyframeAnimationOptions,
    ) {
      let finish = () => {};
      const finished = new Promise<void>((resolve) => {
        finish = resolve;
      });
      const timer = manualCompletion
        ? undefined
        : setTimeout(
            () => finish(),
            Number(options.duration) + Number(options.delay ?? 0),
          );
      const cancel = vi.fn(() => clearTimeout(timer));
      records.push({ element: this, frames, options, cancel, finish });
      return { cancel, finished };
    },
  });
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
});
afterEach(() => {
  controller?.dispose();
  controller = undefined;
  document.body.innerHTML = "";
  if (originalAnimate) HTMLElement.prototype.animate = originalAnimate;
  else Reflect.deleteProperty(HTMLElement.prototype, "animate");
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
const position = (
  element: HTMLElement,
  x: number,
  y: number,
  size: number,
  height = size,
) => {
  element.getBoundingClientRect = () => new DOMRect(x, y, size, height);
};
function art(parent: HTMLElement, x: number, y: number, size: number) {
  const element = document.createElement("div");
  element.className = "artwork";
  const img = document.createElement("img");
  img.src = "/cover.jpg";
  Object.defineProperties(img, {
    complete: { value: true },
    naturalWidth: { value: 600 },
  });
  element.append(img);
  position(element, x, y, size);
  parent.append(element);
  return element;
}
function fixture() {
  document.body.innerHTML =
    '<aside>Sidebar</aside><main tabindex="-1"></main><footer>Player</footer>';
  const main = document.querySelector("main")!;
  position(main, 100, 50, 800, 600);
  let route: AlbumRoute = { page: "library", context: "", search: "" };
  const history: AlbumRoute[] = [];
  let removeReturnTile = false;
  const grid = () => {
    main.innerHTML = '<div class="albums"></div>';
    ["left", "selected", "right", "offscreen"].forEach((id, index) => {
      if (id === "selected" && removeReturnTile) return;
      const card = document.createElement("button");
      card.className = "albumcard";
      card.dataset.albumId = id;
      const cover = document.createElement("div");
      cover.className = "cover";
      card.append(cover);
      const x = 120 + index * 150,
        y = id === "offscreen" ? 2000 : 150;
      position(card, x, y, 100, 140);
      art(cover, x, y, 100);
      main.firstElementChild!.append(card);
    });
  };
  const detail = (id: string) => {
    main.innerHTML = `<article class="album-page"><div data-album-hero="${id}"></div><div data-album-enter="title"><h1>Album title</h1></div><div data-album-enter="metadata"></div><div data-album-enter="actions"></div><div data-album-enter="tracks"></div></article>`;
    art(main.querySelector<HTMLElement>("[data-album-hero]")!, 180, 130, 280);
  };
  grid();
  const navigate = vi.fn((page: "album", id: string) => {
    history.push(route);
    route = { page, context: id, search: "" };
    detail(id);
    controller!.sync();
  });
  const goBack = vi.fn(() => {
    const previous = history.pop();
    if (!previous) return;
    route = previous;
    grid();
    controller!.sync();
  });
  controller = new AlbumNavigation(main, {
    read: () => ({ ...route, navigationHistory: history }),
    navigate,
    goBack,
  });
  return {
    main,
    navigate,
    goBack,
    card: (id = "selected") =>
      main.querySelector<HTMLElement>(`[data-album-id="${id}"]`)!,
    hero: () => main.querySelector<HTMLElement>("[data-album-hero] .artwork")!,
    removeReturnTile: () => {
      removeReturnTile = true;
    },
    navigateAway: () => {
      route = { page: "songs", context: "", search: "" };
      controller!.sync();
    },
  };
}

it("emphasizes, scatters visible neighbors and flies one shared artwork into the real hero", async () => {
  const f = fixture();
  const source = f.card().querySelector<HTMLElement>(".artwork")!;
  controller!.open(f.card(), "selected", true);
  expect(source.style.visibility).toBe("hidden");
  const layer = document.querySelector<HTMLElement>(".album-motion-layer")!;
  expect(layer.style.left).toBe("100px");
  expect(layer.style.top).toBe("50px");
  expect(layer.style.width).toBe("800px");
  expect(layer.getAttribute("aria-hidden")).toBe("true");
  expect(layer.querySelectorAll(".album-motion-tile")).toHaveLength(2);
  expect(records[0].frames.at(-1)?.transform).toContain("1.06");
  const scatter = records.filter((r) =>
    r.element.classList.contains("album-motion-tile"),
  );
  expect(scatter.map((r) => r.options.delay)).toEqual([80, 100]);
  expect(scatter[0].frames.at(-1)?.transform).not.toBe(
    scatter[1].frames.at(-1)?.transform,
  );
  await vi.advanceTimersByTimeAsync(119);
  expect(f.navigate).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(f.navigate).toHaveBeenCalledWith("album", "selected");
  expect(f.hero().style.visibility).toBe("hidden");
  const flight = records
    .filter((r) => r.element.classList.contains("album-motion-art"))
    .at(-1)!;
  expect(flight.frames.at(-1)?.transform).toContain("scale(2.8,2.8)");
  expect(flight.options.duration).toBe(400);
  expect(
    records
      .filter((r) => r.element.hasAttribute("data-album-enter"))
      .map((r) => r.options.delay),
  ).toEqual([160, 195, 230, 265]);
  await vi.advanceTimersByTimeAsync(416);
  expect(f.hero().style.visibility).toBe("");
  expect(document.querySelector(".album-motion-art")).toBeNull();
  await vi.advanceTimersByTimeAsync(114);
  expect(document.querySelector(".album-motion-layer")).toBeNull();
  expect(document.activeElement?.tagName).toBe("H1");
  expect(
    records.every((r) => !["ASIDE", "FOOTER"].includes(r.element.tagName)),
  ).toBe(true);
});

it("reverses to the matching grid tile and restores scroll and focus", async () => {
  const f = fixture();
  f.main.scrollTop = 350;
  controller!.open(f.card(), "selected");
  await vi.advanceTimersByTimeAsync(650);
  expect(f.main.scrollTop).toBe(0);
  controller!.back();
  expect(f.hero().style.visibility).toBe("hidden");
  await vi.advanceTimersByTimeAsync(100);
  expect(f.goBack).toHaveBeenCalledOnce();
  expect(f.main.scrollTop).toBe(350);
  expect(
    f.card().querySelector<HTMLElement>(".artwork")!.style.visibility,
  ).toBe("hidden");
  const reverse = records
    .filter((r) => r.element.classList.contains("album-motion-art"))
    .at(-1)!;
  expect(reverse.frames.at(-1)?.transform).toContain(
    `scale(${100 / 280},${100 / 280})`,
  );
  await vi.advanceTimersByTimeAsync(420);
  expect(document.querySelector(".album-motion-layer")).toBeNull();
  expect(
    f.card().querySelector<HTMLElement>(".artwork")!.style.visibility,
  ).toBe("");
  expect(document.activeElement).toBe(f.card());
});

it("uses immediate reduced-motion navigation while preserving scroll restoration", async () => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  const f = fixture();
  f.main.scrollTop = 240;
  controller!.open(f.card(), "selected", true);
  expect(f.navigate).toHaveBeenCalledOnce();
  expect(records).toHaveLength(0);
  expect(document.querySelector(".album-motion-layer")).toBeNull();
  controller!.back();
  expect(f.main.scrollTop).toBe(240);
  expect(document.activeElement).toBe(f.card());
});

it("handles a rapid second selection without stale delayed navigation", async () => {
  const f = fixture();
  const selected = f.card();
  controller!.open(selected, "selected");
  await vi.advanceTimersByTimeAsync(40);
  controller!.open(f.card("right"), "right");
  expect(
    selected.querySelector<HTMLElement>(".artwork")!.style.visibility,
  ).toBe("");
  expect(document.querySelectorAll(".album-motion-layer")).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(120);
  expect(f.navigate).toHaveBeenCalledExactlyOnceWith("album", "right");
  await vi.advanceTimersByTimeAsync(1000);
  expect(document.querySelector(".album-motion-layer")).toBeNull();
});

it("cancels delayed album navigation when the user opens a different route", async () => {
  const f = fixture();
  const source = f.card().querySelector<HTMLElement>(".artwork")!;
  controller!.open(f.card(), "selected");
  f.navigateAway();
  await vi.advanceTimersByTimeAsync(1000);
  expect(f.navigate).not.toHaveBeenCalled();
  expect(source.style.visibility).toBe("");
  expect(document.querySelector(".album-motion-layer")).toBeNull();
});

it("settles on resize and removes clones, hidden state and timers on dispose", async () => {
  const f = fixture();
  controller!.open(f.card(), "selected");
  window.dispatchEvent(new Event("resize"));
  expect(f.navigate).toHaveBeenCalledExactlyOnceWith("album", "selected");
  expect(document.querySelector(".album-motion-layer")).toBeNull();
  expect(f.hero().style.visibility).toBe("");
  controller!.back();
  await vi.advanceTimersByTimeAsync(100);
  controller!.dispose();
  expect(document.querySelector(".album-motion-layer")).toBeNull();
  expect(
    f.card().querySelector<HTMLElement>(".artwork")!.style.visibility,
  ).toBe("");
  expect(vi.getTimerCount()).toBe(0);
});

it("falls back cleanly when the original tile is unavailable on return", async () => {
  const f = fixture();
  controller!.open(f.card(), "selected");
  await vi.advanceTimersByTimeAsync(650);
  f.removeReturnTile();
  controller!.back();
  await vi.advanceTimersByTimeAsync(100);
  expect(f.goBack).toHaveBeenCalledOnce();
  expect(document.querySelector(".album-motion-layer")).toBeNull();
});

it("does not clone missing artwork", async () => {
  const f = fixture();
  f.card().querySelector("img")!.remove();
  controller!.open(f.card(), "selected");
  expect(f.navigate).toHaveBeenCalledOnce();
  expect(document.querySelector(".album-motion-layer")).toBeNull();
});

it("uses outward directions and bounded nearest-first delays", () => {
  const center = new DOMRect(200, 200, 100, 100);
  expect(
    scatterVector(new DOMRect(50, 200, 100, 100), center, 0).transform,
  ).toContain("rotateY(-10deg)");
  expect(
    scatterVector(new DOMRect(350, 200, 100, 100), center, 200).transform,
  ).toContain("rotateY(10deg)");
  expect(scatterVector(center, center, 200).delay).toBe(120);
});

it("can reverse immediately during the forward flight without leaving hidden elements", async () => {
  const f = fixture();
  controller!.open(f.card(), "selected");
  await vi.advanceTimersByTimeAsync(160);
  controller!.back();
  await vi.advanceTimersByTimeAsync(520);
  expect(f.goBack).toHaveBeenCalledOnce();
  expect(
    f.card().querySelector<HTMLElement>(".artwork")!.style.visibility,
  ).toBe("");
  expect(document.querySelector(".album-motion-layer")).toBeNull();
  // jsdom schedules a selection-change task when focus returns to the button.
  vi.runOnlyPendingTimers();
  expect(vi.getTimerCount()).toBe(0);
});

it("cancels the shared projection if the user scrolls during the artwork flight", async () => {
  const f = fixture();
  controller!.open(f.card(), "selected");
  await vi.advanceTimersByTimeAsync(120);
  f.main.scrollTop = 100;
  f.main.dispatchEvent(new Event("scroll"));
  expect(f.hero().style.visibility).toBe("");
  expect(document.querySelector(".album-motion-layer")).toBeNull();
});

it("keeps the travelling cover visible until the browser finishes the flight", async () => {
  manualCompletion = true;
  const f = fixture();
  controller!.open(f.card(), "selected");
  await vi.advanceTimersByTimeAsync(120);
  // Simulate a busy compositor: wall-clock duration elapsed, animation still pending.
  await vi.advanceTimersByTimeAsync(600);
  expect(document.querySelector(".album-motion-art")).not.toBeNull();
  expect(f.hero().style.visibility).toBe("hidden");
});

it("does not reveal an undecoded destination when the flight finishes", async () => {
  manualCompletion = true;
  const f = fixture();
  controller!.open(f.card(), "selected");
  await vi.advanceTimersByTimeAsync(120);
  let decode!: () => void;
  f.hero().querySelector("img")!.decode = () =>
    new Promise<void>((resolve) => {
      decode = resolve;
    });
  const flight = records
    .filter((r) => r.element.classList.contains("album-motion-art"))
    .at(-1)!;
  flight.finish();
  await vi.advanceTimersByTimeAsync(600);
  expect(document.querySelector(".album-motion-art")).not.toBeNull();
  expect(f.hero().style.visibility).toBe("hidden");
  decode();
  await vi.advanceTimersByTimeAsync(32);
  expect(f.hero().style.visibility).toBe("");
  expect(document.querySelector(".album-motion-art")).toBeNull();
});

it("ignores a late decode after navigation interrupts the handoff", async () => {
  manualCompletion = true;
  const f = fixture();
  controller!.open(f.card(), "selected");
  await vi.advanceTimersByTimeAsync(120);
  let decode!: () => void;
  f.hero().querySelector("img")!.decode = () =>
    new Promise<void>((resolve) => {
      decode = resolve;
    });
  records
    .filter((r) => r.element.classList.contains("album-motion-art"))
    .at(-1)!
    .finish();
  await vi.advanceTimersByTimeAsync(0);
  f.navigateAway();
  decode();
  await vi.advanceTimersByTimeAsync(1000);
  expect(document.querySelector(".album-motion-layer")).toBeNull();
  expect(f.hero().style.visibility).toBe("");
});
