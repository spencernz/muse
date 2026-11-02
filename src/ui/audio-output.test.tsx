import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AudioOutputButton } from "./audio-output";
import { audioOutput, type AudioOutputState } from "../audio-output";
import { useMuse } from "../store";
import { emptyPlayback } from "../types";
vi.mock("../audio-output",()=>({audioOutput:{list:vi.fn(),select:vi.fn(),openSettings:vi.fn()}}));
const initial: AudioOutputState = {devices:[{id:"speaker-1",name:"Living room"},{id:"speaker-2",name:"Headphones"}],selected:"system",selectedName:"Mac speakers",systemDefaultName:"Mac speakers",airplaySupported:true,available:true};
beforeEach(()=>{vi.resetAllMocks();vi.mocked(audioOutput.list).mockResolvedValue(initial);act(()=>useMuse.setState({error:null,playback:emptyPlayback}));});
afterEach(cleanup);
it("loads native outputs on demand and connects without changing playback or provider state",async()=>{
  const user=userEvent.setup();render(<AudioOutputButton/>);const playback=useMuse.getState().playback;
  expect(audioOutput.list).not.toHaveBeenCalled();await user.click(screen.getByRole("button",{name:"AirPlay / audio output"}));
  expect(await screen.findByText("Mac speakers",{selector:"strong"})).toBeVisible();
  expect(screen.getByText(/Control Center/)).toBeVisible();await user.selectOptions(screen.getByLabelText("Play audio through"),"speaker-1");
  vi.mocked(audioOutput.select).mockResolvedValue({...initial,selected:"speaker-1",selectedName:"Living room"});
  await user.click(screen.getByRole("button",{name:"Use this output"}));expect(audioOutput.select).toHaveBeenCalledWith("speaker-1");
  expect(await screen.findByText("Audio output connected: Living room.")).toBeVisible();expect(useMuse.getState().playback).toBe(playback);
});
it("keeps the existing route on failure and refreshes removed devices",async()=>{
  const user=userEvent.setup();render(<AudioOutputButton/>);await user.click(screen.getByRole("button",{name:"AirPlay / audio output"}));
  await screen.findByLabelText("Play audio through");await user.selectOptions(screen.getByLabelText("Play audio through"),"speaker-1");
  vi.mocked(audioOutput.select).mockRejectedValue("Speaker disconnected. Refresh the list.");await user.click(screen.getByRole("button",{name:"Use this output"}));
  expect(await screen.findByRole("alert")).toHaveTextContent("Speaker disconnected");expect(screen.getByText("Mac speakers",{selector:"strong"})).toBeVisible();
  vi.mocked(audioOutput.list).mockResolvedValue({...initial,devices:[]});await user.click(screen.getByRole("button",{name:"Refresh outputs"}));
  expect(await screen.findByText(/No separate audio outputs/)).toBeVisible();expect(screen.getByLabelText("Play audio through")).toHaveValue("system");
});
it("shows loading and retryable list failures and restores trigger focus after Escape",async()=>{
  const user=userEvent.setup();let reject!:(e:unknown)=>void;vi.mocked(audioOutput.list).mockImplementation(()=>new Promise((_,r)=>{reject=r;}));
  render(<AudioOutputButton/>);const trigger=screen.getByRole("button",{name:"AirPlay / audio output"});await user.click(trigger);
  expect(screen.getByText("Loading outputs…")).toBeVisible();expect(screen.getByRole("button",{name:"Use this output"})).toBeDisabled();
  await act(async()=>reject("Cannot list audio outputs."));expect(await screen.findByRole("alert")).toHaveTextContent("Cannot list");
  expect(screen.getByRole("button",{name:"Refresh outputs"})).toBeEnabled();await user.keyboard("{Escape}");
  // jsdom does not implement native dialog Escape dispatch.
  const dialog=screen.queryByRole("dialog");if(dialog) await act(async()=>{dialog.dispatchEvent(new Event("cancel",{bubbles:true}));});
  await waitFor(()=>expect(screen.queryByRole("dialog")).not.toBeInTheDocument());await waitFor(()=>expect(trigger).toHaveFocus());
});
it("opens only native Sound settings and prevents duplicate output submissions",async()=>{
  const user=userEvent.setup();render(<AudioOutputButton/>);await user.click(screen.getByRole("button",{name:"AirPlay / audio output"}));
  await screen.findByLabelText("Play audio through");vi.mocked(audioOutput.openSettings).mockResolvedValue();await user.click(screen.getByRole("button",{name:"Open Sound settings"}));expect(audioOutput.openSettings).toHaveBeenCalledOnce();
  vi.mocked(audioOutput.select).mockImplementation(()=>new Promise(()=>{}));await user.dblClick(screen.getByRole("button",{name:"Use this output"}));expect(audioOutput.select).toHaveBeenCalledOnce();
});
