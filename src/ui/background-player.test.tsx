import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BackgroundPlayer } from "./background-player";
import { api } from "../native";
import { useMuse } from "../store";
import { emptyLibrary, emptyPlayback, type Track } from "../types";
vi.mock("../native",()=>({artwork:(path:string)=>path,api:{getTracks:vi.fn(),favourite:vi.fn(),showMainWindow:vi.fn(),hideMiniPlayer:vi.fn()}}));
vi.mock("../use-album-atmosphere",()=>({useAlbumAtmosphere:()=>({accent:"#eee",onAccent:"#111",background:"#151515",muted:"#aaa"})}));
const track:Track={id:"song",title:"Synthetic song",artist:"Artist",album:"Album",albumArtist:"Artist",albumId:"album",year:null,genre:"",duration:180,trackNo:1,discNo:1,cover:null,liked:false,available:true,addedAt:1};
beforeEach(()=>{vi.resetAllMocks();vi.mocked(api.getTracks).mockResolvedValue([track]);useMuse.setState({playback:{...emptyPlayback,current:track,playing:true},library:emptyLibrary,error:null,control:vi.fn().mockResolvedValue(undefined)});});
afterEach(cleanup);
it("controls the shared player, updates favourite, and restores/dismisses the full app",async()=>{
 const user=userEvent.setup();render(<BackgroundPlayer/>);
 expect(screen.getByText(track.title)).toBeVisible();
 await user.click(screen.getByRole("button",{name:"Previous track"}));
 await user.click(screen.getByRole("button",{name:"Pause"}));
 await user.click(screen.getByRole("button",{name:"Next track"}));
 expect(useMuse.getState().control).toHaveBeenNthCalledWith(1,{action:"previous"});
 expect(useMuse.getState().control).toHaveBeenNthCalledWith(2,{action:"toggle"});
 expect(useMuse.getState().control).toHaveBeenNthCalledWith(3,{action:"next"});
 await user.click(screen.getByRole("button",{name:"Add to favourites"}));
 expect(api.favourite).toHaveBeenCalledWith(track.id,true);
 await waitFor(()=>expect(screen.getByRole("button",{name:"Remove from favourites"})).toHaveAttribute("aria-pressed","true"));
 await user.click(screen.getByRole("button",{name:"Open Muse"}));expect(api.showMainWindow).toHaveBeenCalledOnce();
 await user.keyboard("{Escape}");expect(api.hideMiniPlayer).toHaveBeenCalledOnce();
 act(()=>useMuse.setState({playback:{...emptyPlayback,current:{...track,id:"two",title:"Next song"}}}));
 expect(screen.getByText("Next song")).toBeVisible();expect(screen.getByRole("button",{name:"Play"})).toBeVisible();
});
it("offers the full app when no track is loaded",()=>{
 useMuse.setState({playback:emptyPlayback});render(<BackgroundPlayer/>);
 expect(screen.getByText("Nothing playing")).toBeVisible();expect(screen.getByRole("button",{name:"Play"})).toBeDisabled();expect(screen.getByRole("button",{name:"Open Muse"})).toBeEnabled();
});

it("updates blurred background artwork on track changes and removes it without a cover",()=>{
 useMuse.setState({playback:{...emptyPlayback,current:{...track,cover:"/art/first.jpg"}}});
 const {container}=render(<BackgroundPlayer/>);
 expect(container.querySelector(".background-player-art")).toHaveAttribute("src","/art/first.jpg");
 act(()=>useMuse.setState({playback:{...emptyPlayback,current:{...track,id:"two",cover:"/art/second.jpg"}}}));
 expect(container.querySelector(".background-player-art")).toHaveAttribute("src","/art/second.jpg");
 act(()=>useMuse.setState({playback:{...emptyPlayback,current:track}}));
 expect(container.querySelector(".background-player-art")).not.toBeInTheDocument();
 expect(container.querySelector<HTMLElement>(".background-player")!.style.getPropertyValue("--mini-background")).toBe("#151515");
});
