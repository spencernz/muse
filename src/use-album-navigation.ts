import {
  useLayoutEffect,
  useRef,
  type MouseEvent,
  type RefObject,
} from "react";
import { AlbumNavigation } from "./album-navigation";
import { useMuse } from "./store";

export function useAlbumNavigation(content: RefObject<HTMLElement | null>) {
  const controller = useRef<AlbumNavigation | undefined>(undefined);
  const page = useMuse((state) => state.page);
  const context = useMuse((state) => state.context);
  const loading = useMuse((state) => state.loading);
  useLayoutEffect(() => {
    if (!content.current) return;
    const navigation = new AlbumNavigation(content.current, {
      read: useMuse.getState,
      navigate: (page, id) => useMuse.getState().navigate(page, id),
      goBack: () => useMuse.getState().goBack(),
    });
    controller.current = navigation;
    return () => {
      navigation.dispose();
      controller.current = undefined;
    };
  }, [content]);
  useLayoutEffect(() => {
    controller.current?.sync();
  }, [page, context, loading]);
  return {
    onAlbumClick(event: MouseEvent<HTMLElement>) {
      const card = (event.target as Element).closest<HTMLElement>(
        ".albumcard[data-album-id]",
      );
      if (
        !card ||
        !content.current?.contains(card) ||
        !card.dataset.albumId ||
        !controller.current
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      controller.current.open(card, card.dataset.albumId, event.detail === 0);
    },
    back() {
      controller.current?.back();
    },
  };
}
