import { StrictMode } from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ai, type AlbumInfoPreview } from "../ai";
import { AiSettingsSection, AlbumInfoDialog } from "./ai";
import { useMuse } from "../store";
import { api } from "../native";
import { emptyLibrary } from "../types";
vi.mock("../ai",async(importOriginal)=>{const original=await importOriginal<typeof import("../ai")>();return {...original,ai:{settings:vi.fn(),save:vi.fn(),removeKey:vi.fn(),test:vi.fn(),searchAlbum:vi.fn(),applyAlbum:vi.fn(),discard:vi.fn()}};});
vi.mock("../native",()=>({native:true,artwork:(path:string)=>path,api:{library:vi.fn()}}));
const preview:AlbumInfoPreview={id:"preview-one",albumId:"album",title:"Verified album",artist:"Verified artist",year:2025,genre:"Pop",cover:"/cache/cover.jpg",newCover:true,source:"MusicBrainz / Cover Art Archive",warning:null};
beforeEach(()=>{vi.resetAllMocks();vi.mocked(ai.settings).mockResolvedValue({configured:true,model:"gpt-4o-mini"});vi.mocked(ai.searchAlbum).mockResolvedValue(preview);vi.mocked(ai.discard).mockResolvedValue();vi.mocked(api.library).mockResolvedValue(emptyLibrary);act(()=>useMuse.setState({error:null,context:"",page:"album"}));});
afterEach(cleanup);
it("starts one album-level AI lookup even in StrictMode and applies reviewed local metadata",async()=>{
  const user=userEvent.setup();const close=vi.fn();vi.mocked(ai.applyAlbum).mockResolvedValue();render(<StrictMode><AlbumInfoDialog albumId="album" onClose={close}/></StrictMode>);
  expect(await screen.findByLabelText("Album title")).toHaveValue("Verified album");expect(ai.searchAlbum).toHaveBeenCalledTimes(1);expect(ai.searchAlbum).toHaveBeenCalledWith("album");expect(ai.applyAlbum).not.toHaveBeenCalled();
  await user.clear(screen.getByLabelText("Album title"));await user.type(screen.getByLabelText("Album title"),"Reviewed album");await user.click(screen.getByRole("button",{name:"Apply album info"}));
  await waitFor(()=>expect(close).toHaveBeenCalledOnce());expect(ai.applyAlbum).toHaveBeenCalledWith("preview-one",{title:"Reviewed album",artist:"Verified artist",year:2025,genre:"Pop",applyCover:true});expect(api.library).toHaveBeenCalled();
});
it("routes missing keys to AI settings without making a billed lookup",async()=>{
  const user=userEvent.setup();vi.mocked(ai.settings).mockResolvedValue({configured:false,model:"gpt-4o-mini"});render(<AlbumInfoDialog albumId="album" onClose={()=>{}}/>);
  await user.click(await screen.findByRole("button",{name:"Open AI settings"}));expect(ai.searchAlbum).not.toHaveBeenCalled();expect(useMuse.getState().page).toBe("settings");expect(useMuse.getState().context).toBe("ai");
});
it("keeps retryable lookup/apply errors visible and preserves edits",async()=>{
  const user=userEvent.setup();const close=vi.fn();vi.mocked(ai.searchAlbum).mockRejectedValueOnce("OpenAI quota reached.");render(<AlbumInfoDialog albumId="album" onClose={close}/>);expect(await screen.findByRole("alert")).toHaveTextContent("quota");
  await user.click(screen.getByRole("button",{name:"Retry lookup"}));await screen.findByLabelText("Album title");vi.mocked(ai.applyAlbum).mockRejectedValue("The album changed. Search again.");await user.clear(screen.getByLabelText("Genre"));await user.type(screen.getByLabelText("Genre"),"Soul");await user.click(screen.getByRole("button",{name:"Apply album info"}));
  expect(await screen.findByRole("alert")).toHaveTextContent("album changed");expect(screen.getByLabelText("Genre")).toHaveValue("Soul");expect(close).not.toHaveBeenCalled();
});
it("retains the existing cover when no artwork is found and discards cancelled previews",async()=>{
  vi.mocked(ai.searchAlbum).mockResolvedValue({...preview,newCover:false,warning:"No cover is available. Existing cover kept."});const {unmount}=render(<AlbumInfoDialog albumId="album" onClose={()=>{}}/>);
  expect(await screen.findByText(/Existing cover kept/)).toBeVisible();expect(screen.queryByRole("checkbox",{name:"Update album cover"})).not.toBeInTheDocument();expect(ai.applyAlbum).not.toHaveBeenCalled();unmount();expect(ai.discard).toHaveBeenCalledWith("preview-one");
});
it("saves a key through native credentials, clears the input and tests/removes only saved settings",async()=>{
  const user=userEvent.setup();vi.mocked(ai.settings).mockResolvedValue({configured:false,model:"gpt-4o-mini"});vi.mocked(ai.save).mockResolvedValue({configured:true,model:"gpt-4o-mini"});vi.mocked(ai.test).mockResolvedValue();vi.mocked(ai.removeKey).mockResolvedValue({configured:false,model:"gpt-4o-mini"});render(<AiSettingsSection/>);
  expect(ai.settings).not.toHaveBeenCalled();await user.click(screen.getByRole("button",{name:"Configure OpenAI"}));const key=await screen.findByLabelText("OpenAI API key");expect(key).toHaveAttribute("type","password");await user.type(key,"sk-synthetic-only-test-key");await user.click(screen.getByRole("button",{name:"Save AI settings"}));
  await waitFor(()=>expect(screen.getByLabelText(/OpenAI API key/)).toHaveValue(""));expect(ai.save).toHaveBeenCalledWith("gpt-4o-mini","sk-synthetic-only-test-key");expect(JSON.stringify(localStorage)).not.toContain("synthetic");
  await user.click(screen.getByRole("button",{name:"Test saved connection"}));expect(await screen.findByText("OpenAI connection is ready.")).toBeVisible();await user.click(screen.getByRole("button",{name:"Remove API key"}));expect(await screen.findByText("Saved OpenAI API key removed.")).toBeVisible();
});
