import React from "react";
import ReactDOM from "react-dom/client";
import { BackgroundPlayer } from "./ui/background-player";
import { App } from "./ui/app";
import { initialize, useMuse } from "./store";
import { installAppearance } from "./appearance";
import "./theme.css";
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
import "./settings.css";

const mini = new URLSearchParams(window.location.search).get("mini") === "1";
// The mini player sits on blurred artwork and stays dark; the main window follows the chosen appearance.
if (!mini) installAppearance();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {mini ? <BackgroundPlayer /> : <App />}
  </React.StrictMode>,
);
void initialize().catch((error) => {
  useMuse.setState({ loading: false });
  useMuse.getState().fail(error);
});
