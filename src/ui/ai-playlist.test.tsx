import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { musicAnalysis } from "../music-analysis";
import { ai, type AiPlaylist } from "../ai";
import { api } from "../native";
import { useMuse } from "../store";
import { emptyLibrary, emptyPlayback } from "../types";
import { AiPlaylistDialog, AiDjSuggestions } from "./ai-playlist";
import { App } from "./app";
vi.mock("@tauri-apps/api/event",()=>({listen:async()=>()=>{}}));
vi.mock("../ai", async (original) => ({ ...await original<typeof import("../ai")>(), ai: { settings: vi.fn(), generatePlaylist: vi.fn(), startDj:vi.fn() } }));
vi.mock("../music-analysis",()=>({musicAnalysis:{status:vi.fn(),review:vi.fn()}}));
vi.mock("../native", () => ({ native: true, artwork: (p: string) => p, api: { windowFullscreen: vi.fn(), library: vi.fn(), tracks: vi.fn(), getTracks: vi.fn(), player: vi.fn() } }));
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.windowFullscreen).mockResolvedValue(false);
  vi.mocked(ai.settings).mockResolvedValue({configured: true, model: "configured-model"});
  vi.mocked(musicAnalysis.status).mockResolvedValue({supported:true,installed:true,running:false,enabled:false,total:30,analysed:30,completed:0,skipped:0,failed:0,message:"",error:null});
  vi.mocked(musicAnalysis.review).mockResolvedValue([]);
  vi.mocked(api.library).mockResolvedValue({...emptyLibrary, tracks: 30, playlists: [{id:"mix", name:"Happy mix", tracks:20}]});
  vi.mocked(api.tracks).mockResolvedValue({items:[],total:0});
  vi.mocked(api.getTracks).mockResolvedValue([]);
  act(() => useMuse.setState({library:{...emptyLibrary,tracks:30},playback:emptyPlayback,page:"home",context:"",loading:false,error:null,notice:null,search:"",navigationHistory:[]}));
});
afterEach(cleanup);
it("offers four different moods and refreshes to different choices without calling AI", async () => {
  const user = userEvent.setup(); render(<AiPlaylistDialog onClose={() => {}}/>);
  await waitFor(() => expect(screen.getByRole("button", {name:"Show other moods"})).toBeEnabled());
  const original = screen.getAllByRole("radio").map(r => r.getAttribute("value"));
  expect(new Set(original).size).toBe(4);
  await user.click(screen.getByRole("button", {name:"Show other moods"}));
  expect(screen.getAllByRole("radio").every(r => !original.includes(r.getAttribute("value")))).toBe(true);
  expect(ai.generatePlaylist).not.toHaveBeenCalled();
});
it("prevents duplicate requests and dismissal while generating, then opens the persisted playlist without playing", async () => {
  let resolve!: (value: AiPlaylist) => void;
  vi.mocked(ai.generatePlaylist).mockReturnValue(new Promise(r => {resolve = r;}));
  const user = userEvent.setup(), close = vi.fn(); render(<AiPlaylistDialog onClose={close}/>);
  await waitFor(() => expect(screen.getByRole("button", {name:"Show other moods"})).toBeEnabled());
  const radio = screen.getAllByRole("radio")[0]; await user.click(radio);
  await user.dblClick(screen.getByRole("button",{name:"Generate playlist"}));
  expect(ai.generatePlaylist).toHaveBeenCalledExactlyOnceWith(radio.getAttribute("value"));
  expect(screen.getByRole("button",{name:"Cancel"})).toBeDisabled();
  expect(screen.getByRole("button",{name:"Close dialog"})).toBeDisabled();
  expect(fireEvent(screen.getByRole("dialog"),new Event("cancel",{cancelable:true}))).toBe(false);
  expect(close).not.toHaveBeenCalled(); expect(useMuse.getState().page).toBe("home");
  await act(async () => resolve({id:"mix",name:"Happy mix",tracks:20}));
  await waitFor(() => expect(close).toHaveBeenCalledOnce());
  expect(useMuse.getState().page).toBe("playlist"); expect(useMuse.getState().context).toBe("mix"); expect(api.player).not.toHaveBeenCalled();
});
it("preserves the selected mood after failure and allows retry", async () => {
  vi.mocked(ai.generatePlaylist).mockRejectedValueOnce("OpenAI quota reached.").mockResolvedValue({id:"mix",name:"Happy mix",tracks:20});
  const user=userEvent.setup(),close=vi.fn();render(<AiPlaylistDialog onClose={close}/>);
  await waitFor(() => expect(screen.getByRole("button",{name:"Show other moods"})).toBeEnabled());
  const radio=screen.getAllByRole("radio")[0];await user.click(radio);await user.click(screen.getByRole("button",{name:"Generate playlist"}));
  expect(await screen.findByRole("alert")).toHaveTextContent("quota");expect(radio).toBeChecked();expect(close).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button",{name:"Generate playlist"}));await waitFor(() => expect(close).toHaveBeenCalledOnce());
});
it("routes missing profiles to analysis without a generation request or key access", async () => {
  vi.mocked(musicAnalysis.status).mockResolvedValue({supported:true,installed:false,running:false,enabled:false,total:30,analysed:0,completed:0,skipped:0,failed:0,message:"",error:null});
  const user=userEvent.setup();render(<AiPlaylistDialog onClose={() => {}}/>);
  await user.click(await screen.findByRole("button",{name:"Open music analysis"}));
  expect(useMuse.getState().page).toBe("settings");expect(useMuse.getState().context).toBe("analysis");expect(ai.generatePlaylist).not.toHaveBeenCalled();
});
it("disables generation with an empty library", async () => {
  act(() => useMuse.setState({library:emptyLibrary}));render(<AiPlaylistDialog onClose={() => {}}/>);
  expect(await screen.findByText(/Import music or connect/)).toBeVisible();expect(screen.getByRole("button",{name:"Generate playlist"})).toBeDisabled();expect(ai.generatePlaylist).not.toHaveBeenCalled();
});
it("lists saved playlists beneath main navigation and opens their existing track view", async () => {
  act(() => useMuse.setState({library:{...emptyLibrary,playlists:[{id:"saved",name:"Chill mix",tracks:5}]}}));
  const user=userEvent.setup();render(<App/>);
  const nav=screen.getByRole("navigation",{name:"Your playlists"});
  expect(within(nav).getByRole("button",{name:"Create AI playlist"})).toBeVisible();
  await user.click(within(nav).getByRole("button",{name:"Playlist: Chill mix"}));
  expect(useMuse.getState().context).toBe("saved");expect(within(nav).getByRole("button",{name:"Playlist: Chill mix"})).toHaveAttribute("aria-current","page");
  expect(screen.getByRole("heading",{name:"Chill mix"})).toBeVisible();
});

it("starts a mood DJ queue without saving a playlist or reading OpenAI settings",async()=>{
 let resolve!:(value:Awaited<ReturnType<typeof ai.startDj>>)=>void;vi.mocked(ai.startDj).mockReturnValue(new Promise(r=>{resolve=r;}));const user=userEvent.setup();render(<AiDjSuggestions/>);
 const selected=screen.getAllByRole('button',{name:/^Start .+ DJ$/})[0],mood=selected.querySelector('strong')!.textContent!;await user.dblClick(selected);expect(ai.startDj).toHaveBeenCalledExactlyOnceWith(mood);expect(ai.generatePlaylist).not.toHaveBeenCalled();expect(ai.settings).not.toHaveBeenCalled();
 await act(async()=>resolve({playback:{...emptyPlayback,playing:true,queue:['one','two']},mood,tracks:2,duration:420,shorter:true}));expect(useMuse.getState().playback.queue).toEqual(['one','two']);expect(useMuse.getState().page).toBe('now');expect(useMuse.getState().notice).toContain('Shorter session');expect(useMuse.getState().library.playlists).toHaveLength(0);
});

it("reshuffles home suggestions without requesting a playlist", async () => {
  const user = userEvent.setup(); render(<AiDjSuggestions />);
  const before = screen.getAllByRole("button", {name: /^Start .+ DJ$/}).map(b => b.getAttribute("aria-label"));
  await user.click(screen.getByRole("button", {name:"Show other moods"}));
  const after = screen.getAllByRole("button", {name: /^Start .+ DJ$/}).map(b => b.getAttribute("aria-label"));
  expect(after.every(name => !before.includes(name))).toBe(true);
  expect(ai.settings).not.toHaveBeenCalled(); expect(ai.generatePlaylist).not.toHaveBeenCalled();
});
