import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { LyricsPanel } from "./lyrics";
import { api, type Lyrics } from "../native";
import { useMuse } from "../store";
vi.mock("../native",()=>({api:{lyrics:vi.fn(),importLyrics:vi.fn()}}));
afterEach(()=>{cleanup();vi.clearAllMocks();});
it("shows timed lyrics and seeks through the existing player",async()=>{
  Element.prototype.scrollIntoView=vi.fn();
  vi.mocked(api.lyrics).mockResolvedValue({plain:null,synced:"[00:05.00]Synthetic first\n[00:15.00]Synthetic second",instrumental:false,source:"Synthetic"});
  const control=vi.fn().mockResolvedValue(undefined);useMuse.setState({control});
  render(<LyricsPanel trackId="one"/>);
  await userEvent.click(await screen.findByRole("button",{name:/Seek to 0:15/}));
  expect(control).toHaveBeenCalledWith({action:"seek",value:15});
});
it("ignores a previous track response and distinguishes missing lyrics",async()=>{
  let finish!:(value:Lyrics|null)=>void;
  vi.mocked(api.lyrics).mockReturnValueOnce(new Promise(resolve=>{finish=resolve;})).mockResolvedValueOnce(null);
  const {rerender}=render(<LyricsPanel trackId="one"/>);
  rerender(<LyricsPanel trackId="two"/>);
  await waitFor(()=>expect(screen.getByText(/aren’t available/)).toBeVisible());
  await act(async()=>finish({plain:"Stale content",synced:null,instrumental:false,source:"Synthetic"}));
  expect(screen.queryByText("Stale content")).not.toBeInTheDocument();
});
