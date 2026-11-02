/** Content-only Metro navigation. Owns temporary DOM/animations, never playback. */
export type AlbumRoute = { page: string; context: string; search: string };
type Navigation = {
  read: () => AlbumRoute & { navigationHistory: AlbumRoute[] };
  navigate: (page: "album", id: string) => void;
  goBack: () => void;
};
type Origin = {
  route: AlbumRoute;
  id: string;
  scroll: number;
  keyboard: boolean;
};
type Run = {
  phase:
    "selecting" | "arriving" | "forward" | "leaving" | "returning" | "reverse";
  layer: HTMLElement;
  art: HTMLElement;
  from: DOMRect;
  viewport: DOMRect;
  animations: Animation[];
  timers: ReturnType<typeof setTimeout>[];
  hidden: Map<HTMLElement, string>;
  frames: number[];
};
const ease = "cubic-bezier(0.22, 1, 0.36, 1)";
const same = (a: AlbumRoute, b: AlbumRoute) =>
  a.page === b.page && a.context === b.context && a.search === b.search;
const motionReduced = () =>
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const valid = (r: DOMRect) => r.width > 0 && r.height > 0;
const inside = (a: DOMRect, b: DOMRect) =>
  a.bottom > b.top && a.top < b.bottom && a.right > b.left && a.left < b.right;

export function scatterVector(tile: DOMRect, selected: DOMRect, rank: number) {
  const dx = tile.x + tile.width / 2 - selected.x - selected.width / 2;
  const dy = tile.y + tile.height / 2 - selected.y - selected.height / 2;
  const length = Math.hypot(dx, dy) || 1;
  return {
    transform: `perspective(900px) translate3d(${Math.round((dx / length) * 85)}px, ${Math.round((dy / length) * 45)}px, 0) rotateY(${dx >= 0 ? 10 : -10}deg) scale(0.9)`,
    delay: Math.min(rank * 20, 120),
  };
}

export class AlbumNavigation {
  private origin?: Origin;
  private run?: Run;
  private restore = false;
  private ownScroll = false;
  private last: AlbumRoute;
  private media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  constructor(
    private content: HTMLElement,
    private navigation: Navigation,
  ) {
    this.last = navigation.read();
    window.addEventListener("resize", this.interrupt);
    content.addEventListener("wheel", this.interrupt, { passive: true });
    content.addEventListener("scroll", this.onScroll, { passive: true });
    this.media?.addEventListener?.("change", this.interrupt);
  }
  private onScroll = () => {
    if (
      this.run &&
      !this.ownScroll &&
      this.content.scrollTop !== this.expectedScroll
    )
      this.interrupt();
  };
  private expectedScroll = 0;
  private scrollTo(top: number) {
    this.ownScroll = true;
    try {
      this.content.scrollTo({ top, behavior: "instant" });
    } finally {
      this.expectedScroll = this.content.scrollTop;
      this.ownScroll = false;
    }
  }
  private interrupt = () => {
    const phase = this.run?.phase;
    this.clear();
    // A resize/motion change must not swallow navigation during the selection delay.
    if (phase === "selecting" && this.origin)
      this.navigation.navigate("album", this.origin.id);
    if (phase === "leaving") {
      this.restore = true;
      this.navigation.goBack();
    }
  };
  private clear() {
    const run = this.run;
    this.run = undefined;
    if (!run) return;
    run.timers.forEach(clearTimeout);
    run.frames.forEach(cancelAnimationFrame);
    run.animations.forEach((animation) => animation.cancel());
    run.hidden.forEach((visibility, element) => {
      element.style.visibility = visibility;
    });
    run.layer.remove();
  }
  private later(run: Run, delay: number, action: () => void) {
    run.timers.push(
      setTimeout(() => {
        if (this.run === run) action();
      }, delay),
    );
  }
  private animate(
    run: Run,
    element: HTMLElement,
    frames: Keyframe[],
    duration: number,
    delay = 0,
  ) {
    const animation = element.animate(frames, {
      duration,
      delay,
      easing: ease,
      fill: "both",
    });
    animation.finished?.catch(() => {});
    run.animations.push(animation);
    return animation;
  }
  private hide(run: Run, element: HTMLElement) {
    if (!run.hidden.has(element))
      run.hidden.set(element, element.style.visibility);
    element.querySelectorAll("img").forEach((image) => {
      image.loading = "eager";
    });
    element.style.visibility = "hidden";
  }
  private artwork(element: HTMLElement | null) {
    if (!element) return null;
    const image = element.querySelector("img");
    return image?.complete && image.naturalWidth > 0 ? element : null;
  }
  private start(source: HTMLElement, phase: Run["phase"]) {
    const viewport = this.content.getBoundingClientRect();
    const from = source.getBoundingClientRect();
    if (!valid(from) || !inside(from, viewport)) return;
    const layer = document.createElement("div");
    layer.className = "album-motion-layer";
    layer.setAttribute("aria-hidden", "true");
    layer.inert = true;
    Object.assign(layer.style, {
      left: `${viewport.left}px`,
      top: `${viewport.top}px`,
      width: `${viewport.width}px`,
      height: `${viewport.height}px`,
    });
    const run: Run = {
      phase,
      layer,
      art: source,
      from,
      viewport,
      animations: [],
      timers: [],
      hidden: new Map(),
      frames: [],
    };
    run.art = this.clone(run, source, from, "album-motion-art");
    document.body.append(layer);
    this.run = run;
    this.expectedScroll = this.content.scrollTop;
    this.hide(run, source);
    return run;
  }
  private clone(
    run: Run,
    element: HTMLElement,
    rect: DOMRect,
    className: string,
  ) {
    const clone = element.cloneNode(true) as HTMLElement;
    clone.removeAttribute("id");
    clone
      .querySelectorAll("[id]")
      .forEach((child) => child.removeAttribute("id"));
    const viewport = run.viewport;
    clone.classList.add(className);
    Object.assign(clone.style, {
      position: "absolute",
      margin: "0",
      visibility: "visible",
      left: `${rect.left - viewport.left}px`,
      top: `${rect.top - viewport.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });
    clone.querySelectorAll("img").forEach((image) => {
      image.loading = "eager";
      image.decoding = "sync";
    });
    run.layer.append(clone);
    return clone;
  }
  private neighbors(card: HTMLElement) {
    const grid = card.closest(".albums");
    const cards = [
      ...(grid?.querySelectorAll<HTMLElement>("[data-album-id]") ?? []),
    ];
    const index = cards.indexOf(card);
    const viewport = this.content.getBoundingClientRect();
    const center = card.getBoundingClientRect();
    // Bound measurement work even when the mounted library contains thousands of albums.
    return cards
      .slice(Math.max(0, index - 80), index + 81)
      .filter((tile) => tile !== card)
      .map((tile) => ({ tile, rect: tile.getBoundingClientRect() }))
      .filter(({ rect }) => valid(rect) && inside(rect, viewport))
      .sort(
        (a, b) =>
          Math.hypot(a.rect.x - center.x, a.rect.y - center.y) -
          Math.hypot(b.rect.x - center.x, b.rect.y - center.y),
      );
  }
  private scatter(run: Run, card: HTMLElement, reverse: boolean) {
    const selected = card.getBoundingClientRect();
    const neighbors = this.neighbors(card);
    neighbors.forEach(({ tile, rect }, rank) => {
      const clone = this.clone(run, tile, rect, "album-motion-tile");
      this.hide(run, tile);
      const vector = scatterVector(rect, selected, rank);
      const rest = {
        transform:
          "perspective(900px) translate3d(0,0,0) rotateY(0deg) scale(1)",
        opacity: 1,
      };
      const away = { transform: vector.transform, opacity: 0 };
      this.animate(
        run,
        clone,
        reverse ? [away, rest] : [rest, { ...rest, opacity: 0.65 }, away],
        reverse ? 240 : 260,
        (reverse ? 40 : 80) + Math.min(vector.delay, reverse ? 80 : 120),
      );
    });
  }
  private fly(run: Run, to: DOMRect, reverse: boolean) {
    return this.animate(
      run,
      run.art,
      [
        {
          transform: reverse
            ? "translate3d(0,0,0) scale(1)"
            : `translate3d(${-0.03 * run.from.width}px,${-0.03 * run.from.height}px,0) scale(1.06)`,
        },
        {
          transform: `translate3d(${to.left - run.from.left}px,${to.top - run.from.top}px,0) scale(${to.width / run.from.width},${to.height / run.from.height})`,
        },
      ],
      reverse ? 400 : 400,
    );
  }
  private details(run: Run, reverse: boolean) {
    const groups =
      this.content.querySelectorAll<HTMLElement>("[data-album-enter]");
    groups.forEach((element, index) => {
      const rest = { transform: "translateY(0)", opacity: 1 };
      const away = {
        transform: `translateY(${reverse ? -12 : 20}px)`,
        opacity: 0,
      };
      this.animate(
        run,
        element,
        reverse ? [rest, away] : [away, rest],
        reverse ? 120 : 260,
        reverse ? index * 12 : 160 + index * 35,
      );
    });
  }
  open(card: HTMLElement, id: string, keyboard = false) {
    this.clear();
    this.restore = false;
    const route = this.navigation.read();
    this.origin = {
      route: { page: route.page, context: route.context, search: route.search },
      id,
      scroll: this.content.scrollTop,
      keyboard,
    };
    const source = this.artwork(
      card.querySelector<HTMLElement>(".cover .artwork"),
    );
    if (motionReduced() || !source || !source.animate) {
      this.navigation.navigate("album", id);
      return;
    }
    const run = this.start(source, "selecting");
    if (!run) {
      this.navigation.navigate("album", id);
      return;
    }
    this.animate(
      run,
      run.art,
      [
        { transform: "translate3d(0,0,0) scale(1)" },
        {
          transform: `translate3d(${-0.03 * run.from.width}px,${-0.03 * run.from.height}px,0) scale(1.06)`,
        },
      ],
      120,
    );
    this.scatter(run, card, false);
    this.later(run, 120, () => {
      run.phase = "arriving";
      this.navigation.navigate("album", id);
    });
  }
  back() {
    const current = this.navigation.read();
    const origin = this.origin;
    const previous = current.navigationHistory.at(-1);
    this.clear();
    if (
      !origin ||
      current.page !== "album" ||
      current.context !== origin.id ||
      !previous ||
      !same(previous, origin.route)
    ) {
      this.origin = undefined;
      this.navigation.goBack();
      return;
    }
    const source = this.artwork(
      this.content.querySelector<HTMLElement>("[data-album-hero] .artwork"),
    );
    const run =
      !motionReduced() && source?.animate
        ? this.start(source, "leaving")
        : undefined;
    this.restore = true;
    if (!run) {
      this.navigation.goBack();
      return;
    }
    this.details(run, true);
    this.later(run, 100, () => {
      run.phase = "returning";
      this.navigation.goBack();
    });
  }
  /** Called after React has committed the destination and before browser paint. */
  sync() {
    const route = this.navigation.read();
    const changed = !same(route, this.last);
    this.last = {
      page: route.page,
      context: route.context,
      search: route.search,
    };
    const run = this.run;
    const origin = this.origin;
    if (origin && this.restore && same(route, origin.route)) {
      this.restore = false;
      this.scrollTo(origin.scroll);
      const card = [
        ...this.content.querySelectorAll<HTMLElement>("[data-album-id]"),
      ].find((element) => element.dataset.albumId === origin.id);
      const target = card?.querySelector<HTMLElement>(".cover .artwork");
      if (
        run?.phase === "returning" &&
        card &&
        target &&
        valid(target.getBoundingClientRect()) &&
        inside(
          target.getBoundingClientRect(),
          this.content.getBoundingClientRect(),
        )
      ) {
        run.phase = "reverse";
        this.hide(run, target);
        this.scatter(run, card, true);
        const flight = this.fly(run, target.getBoundingClientRect(), true);
        void this.settle(run, flight, target, () => {
          card.focus({ preventScroll: true });
        });
      } else {
        this.clear();
        (card ?? this.content).focus({ preventScroll: true });
        this.fade();
      }
      this.origin = undefined;
      return;
    }
    if (
      run?.phase === "arriving" &&
      route.page === "album" &&
      route.context === origin?.id
    ) {
      this.scrollTo(0);
      const target = this.content.querySelector<HTMLElement>(
        "[data-album-hero] .artwork",
      );
      if (!target || !valid(target.getBoundingClientRect())) {
        this.clear();
        this.fade();
        return;
      }
      run.phase = "forward";
      this.hide(run, target);
      const flight = this.fly(run, target.getBoundingClientRect(), false);
      this.details(run, false);
      void this.settle(run, flight, target, () => {
        if (origin.keyboard) this.focusHeading();
      });
      return;
    }
    if (changed) {
      this.clear();
      if (route.page !== "album" || route.context !== origin?.id)
        this.origin = undefined;
      if (!(route.page === "now" && route.context === "queue"))
        this.scrollTo(0);
      if (route.page === "album" && origin?.keyboard) this.focusHeading();
    }
  }
  /** Wall-clock timers can outrun WebKit's compositor and image decoder. */
  private async settle(
    run: Run,
    flight: Animation,
    target: HTMLElement,
    done: () => void,
  ) {
    try {
      await flight.finished;
      if (this.run !== run) return;
      const image = target.querySelector("img");
      if (image?.decode) await image.decode().catch(() => {});
      if (this.run !== run) return;
      target.style.visibility = run.hidden.get(target) ?? "";
      run.hidden.delete(target);
      // Keep the finished projection for one paint while the real image is revealed.
      await new Promise<void>((resolve) => {
        run.frames.push(requestAnimationFrame(() => resolve()));
      });
      if (this.run !== run) return;
      run.art.remove();
      await Promise.all(run.animations.map((animation) => animation.finished));
      if (this.run !== run) return;
      this.clear();
      done();
    } catch {
      // Cancellation belongs to clear(); a stale completion must not touch a new run.
    }
  }
  private focusHeading() {
    const heading = this.content.querySelector<HTMLElement>(".album-page h1");
    heading?.setAttribute("tabindex", "-1");
    heading?.focus({ preventScroll: true });
  }
  private fade() {
    if (motionReduced() || !this.content.animate) return;
    // A finite animation without fill requires no retained overlay or cleanup state.
    this.content.animate([{ opacity: 0.65 }, { opacity: 1 }], {
      duration: 120,
      easing: ease,
    });
  }
  dispose() {
    this.clear();
    window.removeEventListener("resize", this.interrupt);
    this.content.removeEventListener("wheel", this.interrupt);
    this.content.removeEventListener("scroll", this.onScroll);
    this.media?.removeEventListener?.("change", this.interrupt);
  }
}
