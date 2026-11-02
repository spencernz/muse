import { invoke } from "@tauri-apps/api/core";
export interface AudioOutputState {
  devices: { id: string; name: string }[];
  selected: string;
  selectedName: string;
  systemDefaultName: string | null;
  airplaySupported: boolean;
  available: boolean;
}
export const audioOutput = {
  list: () => invoke<AudioOutputState>("audio_outputs"),
  select: (id: string) => invoke<AudioOutputState>("select_audio_output", { id }),
  openSettings: () => invoke<void>("open_sound_settings"),
};
