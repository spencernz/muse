import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SettingsScreen } from "./settings";
import { useMuse } from "../store";
import { api } from "../native";
import { sftp } from "../sftp";
import { installAppearance, setAppearance } from "../appearance";

vi.mock("../native", () => ({
  native: false,
  artwork: (p: string) => p,
  api: { preferences: vi.fn(), setCloseBehavior: vi.fn() },
}));
vi.mock("../sftp", async (importOriginal) => {
  const original = await importOriginal<typeof import("../sftp")>();
  return { ...original, sftp: { state: vi.fn() } };
});
vi.mock("./music-analysis", () => ({
  MusicAnalysisSection: () => <section aria-label="Music analysis section" />,
}));
vi.mock("./ai", () => ({
  AiSettingsSection: () => <section aria-label="AI section" />,
}));

let systemLight = false;
const changeListeners = new Set<() => void>();
beforeEach(() => {
  vi.mocked(api.preferences).mockResolvedValue({
    closeBehavior: "quit",
    backgroundAvailable: true,
  });
  vi.mocked(sftp.state).mockResolvedValue({
    profile: {
      host: "nas.example.test",
      port: 22,
      username: "listener",
      root: "/volume1/Music",
      identityFile: null,
      passwordAuth: true,
    },
    status: "configured",
    listing: null,
    trustedKey: null,
    keyMismatch: null,
  });
  systemLight = false;
  changeListeners.clear();
  window.matchMedia = ((media: string) => ({
    get matches() {
      return systemLight;
    },
    media,
    addEventListener: (_: string, listener: () => void) =>
      changeListeners.add(listener),
    removeEventListener: (_: string, listener: () => void) =>
      changeListeners.delete(listener),
  })) as unknown as typeof window.matchMedia;
  localStorage.clear();
  act(() => useMuse.setState({ page: "settings", context: "" }));
});
afterEach(() => {
  cleanup();
  act(() => setAppearance("system"));
});

it("groups settings into categories with keyboard navigation", async () => {
  const user = userEvent.setup();
  render(<SettingsScreen />);
  const tabs = screen.getAllByRole("tab");
  expect(tabs.map((tab) => tab.textContent)).toEqual([
    "GeneralAppearance and window",
    "LibraryMusic folders and remote music",
    "IntelligenceMusic analysis and AI",
    "ShortcutsKeyboard and media keys",
    "AboutVersion and storage",
  ]);
  expect(tabs[0]).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("heading", { name: "Appearance" })).toBeVisible();
  expect(
    screen.queryByRole("heading", { name: "Local music folders" }),
  ).not.toBeInTheDocument();
  tabs[0].focus();
  await user.keyboard("{ArrowDown}");
  expect(screen.getByRole("tab", { name: /Library/ })).toHaveFocus();
  expect(
    screen.getByRole("heading", { name: "Local music folders" }),
  ).toBeVisible();
  expect(
    await screen.findByText("listener@nas.example.test · /volume1/Music"),
  ).toBeVisible();
  await user.keyboard("{End}");
  expect(screen.getByRole("tab", { name: /About/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await user.keyboard("{ArrowDown}");
  expect(screen.getByRole("tab", { name: /General/ })).toHaveFocus();
});

it("opens Intelligence from analysis and AI links", () => {
  act(() => useMuse.setState({ context: "ai" }));
  render(<SettingsScreen />);
  expect(screen.getByRole("tab", { name: /Intelligence/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(screen.getByLabelText("AI section")).toBeInTheDocument();
  expect(screen.getByLabelText("Music analysis section")).toBeInTheDocument();
});

it("applies, saves and follows the device appearance", async () => {
  const user = userEvent.setup();
  const stop = installAppearance();
  render(<SettingsScreen />);
  // The last category is remembered for the session.
  await user.click(screen.getByRole("tab", { name: /General/ }));
  expect(screen.getByRole("radio", { name: /System/ })).toBeChecked();
  expect(document.documentElement.dataset.theme).toBe("dark");
  await user.click(screen.getByRole("radio", { name: /Light/ }));
  expect(document.documentElement.dataset.theme).toBe("light");
  expect(localStorage.getItem("muse.appearance")).toBe("light");
  await user.click(screen.getByRole("radio", { name: /System/ }));
  expect(localStorage.getItem("muse.appearance")).toBeNull();
  act(() => {
    systemLight = true;
    changeListeners.forEach((listener) => listener());
  });
  expect(document.documentElement.dataset.theme).toBe("light");
  expect(screen.getByText(/now light/)).toBeVisible();
  await user.click(screen.getByRole("radio", { name: /Dark/ }));
  act(() => changeListeners.forEach((listener) => listener()));
  expect(document.documentElement.dataset.theme).toBe("dark");
  stop();
});
