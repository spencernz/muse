import { useEffect, useRef, useState } from "react";
import { Cloud, Disc3, X } from "lucide-react";
import { artwork } from "../native";
import { useMuse } from "../store";
import type { Album } from "../types";

export function Cover({
  path,
  title,
  artist = "",
  className = "",
  remote = false,
}: {
  path?: string | null;
  title: string;
  artist?: string;
  className?: string;
  remote?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={`artwork ${className}`}>
      {remote && <span className="remote-cover-icon" role="img" aria-label="Remote music (SSH)" title="Remote music (SSH)"><Cloud size={16} aria-hidden="true" /></span>}
      {path && !failed ? (
        <img
          src={artwork(path)}
          alt={`Cover for ${title}`}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      ) : (
        <>
          <div className="art-text">{title || <Disc3 />}</div>
          <div className="art-sub">{artist || "muse"}</div>
        </>
      )}
    </div>
  );
}
export function AlbumCard({ album }: { album: Album }) {
  const navigate = useMuse((s) => s.navigate);
  return (
    <button
      className="albumcard"
      data-album-id={album.id}
      onClick={() => navigate("album", album.id)}
    >
      <div className="cover">
        <Cover
          key={album.cover}
          path={album.cover}
          remote={album.id.startsWith("sftp:")}
          title={album.title}
          artist={album.artist}
        />
      </div>
      <div className="albumtitle" title={album.title}>
        {album.title}
      </div>
      <div className="albumartist">{album.artist}</div>
    </button>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <p>{title}</p>
      {children && <div className="empty-actions">{children}</div>}
    </div>
  );
}
export function Heading({
  overline,
  title,
  children,
  actions,
}: {
  overline: string;
  title: string;
  children?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{overline}</div>
        <h1 className="heading">{title}</h1>
        {children && <div className="sub">{children}</div>}
      </div>
      {actions && <div className="heading-actions">{actions}</div>}
    </div>
  );
}
export function Dialog({
  title,
  children,
  onClose,
  dismissible = true,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  dismissible?: boolean;
}) {
  const error = useMuse((s) => s.error);
  const previousFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    return () => { const previous=previousFocus.current; if(previous?.isConnected) previous.focus({preventScroll:true}); };
  }, []);
  return (
    <dialog
      ref={(node) => {
        if (node && !node.open) {
          if (!previousFocus.current && document.activeElement instanceof HTMLElement) previousFocus.current=document.activeElement;
          node.showModal();
        }
      }}
      onCancel={(event) => { if (!dismissible) event.preventDefault(); else onClose(); }}
      onClose={onClose}
      aria-labelledby="dialog-title"
    >
      <div className="dialog-heading">
        <h2 id="dialog-title">{title}</h2>
        <button className="iconbtn" aria-label="Close dialog" onClick={onClose} disabled={!dismissible}>
          <X size={18} />
        </button>
      </div>
      {error && (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      )}
      {children}
    </dialog>
  );
}
