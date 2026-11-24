import { useEffect, useState } from "react";
import { useAppearance } from "./appearance";
import {
  cachedAtmosphere,
  lightAtmosphere,
  loadAtmosphere,
  type AlbumAtmosphere,
} from "./album-atmosphere";

export function useAlbumAtmosphere(source?: string) {
  const [result, setResult] = useState<{
    source: string;
    theme: AlbumAtmosphere;
  }>();
  useEffect(() => {
    if (!source) return;
    let active = true;
    void loadAtmosphere(source).then((theme) => {
      if (active) setResult({ source, theme });
    });
    return () => {
      active = false;
    };
  }, [source]);
  // Resolve during render so a changed identity never paints the previous palette.
  return result && result.source === source
    ? result.theme
    : cachedAtmosphere(source);
}

/** The cover palette for the current appearance (Now Playing and the mini player use the dark one). */
export function useAppearanceAtmosphere(source?: string) {
  const dark = useAlbumAtmosphere(source);
  const { scheme } = useAppearance();
  return scheme === "light" ? lightAtmosphere(dark) : dark;
}
