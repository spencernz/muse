import React from "react";
import ReactDOM from "react-dom/client";
import { BackgroundPlayer } from "./ui/background-player";
import { App } from "./ui/app";
import { initialize, useMuse } from "./store";
import "./styles.css";
import "./desktop.css";
import "./metro.css";
import "./album-atmosphere.css";
import "./now-playing.css";
import "./unified-layout.css";
import "./album-navigation.css";
import "./ai-playlists.css";
import "./playlist-collage.css";
import "./background-player.css";
import "./visual-effects.css";
import "./music-analysis.css";
import "./scrollbars.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {new URLSearchParams(window.location.search).get("mini")==="1" ? <BackgroundPlayer/> : <App />}
  </React.StrictMode>,
);
void initialize().catch((error) => {
  useMuse.setState({ loading: false });
  useMuse.getState().fail(error);
});
