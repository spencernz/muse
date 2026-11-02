import { useEffect, useState } from "react";
import {
  cachedAtmosphere,
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
