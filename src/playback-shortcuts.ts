import { useEffect } from "react";
import { useMuse } from "./store";

export function usePlayerShortcuts() {
  useEffect(() => {
    function key(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (target.closest("input,textarea,select,button,dialog") || event.altKey)
        return;
      const { playback, control } = useMuse.getState();
      const mod = event.ctrlKey || event.metaKey;
      if (event.code === "Space") {
        event.preventDefault();
        void control({ action: "toggle" });
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        void control(
          mod
            ? { action: "next" }
            : { action: "seek", value: playback.position + 5 },
        );
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        void control(
          mod
            ? { action: "previous" }
            : { action: "seek", value: playback.position - 5 },
        );
      } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        event.preventDefault();
        void control({
          action: "volume",
          value: playback.volume + (event.key === "ArrowUp" ? 0.05 : -0.05),
        });
      } else if (!mod && event.key.toLowerCase() === "s")
        void control({ action: "shuffle" });
      else if (!mod && event.key.toLowerCase() === "r")
        void control({ action: "repeat" });
      else if (!mod && event.key.toLowerCase() === "m")
        void control({
          action: "volume",
          value: playback.volume === 0 ? 0.8 : 0,
        });
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
}
