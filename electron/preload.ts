const { contextBridge, ipcRenderer } = require("electron") as typeof import("electron");

/**
 * Preload script — runs in an isolated context with Node.js access, and
 * exposes a minimal, safe API to the renderer via contextBridge.
 * The `hellstats` object is available on `window.hellstats` in the renderer.
 */
const api = {
  /** Fetch current system metrics (CPU, RAM, disk, network, uptime). */
  getMetrics: () => ipcRenderer.invoke("metrics:get"),

  /** Whether we're running in dev mode (vite dev server). */
  isDev: (): Promise<boolean> => ipcRenderer.invoke("app:is-dev"),

  /** Platform identifier (darwin, win32, linux). */
  platform: process.platform,
};

export type HellstatsAPI = typeof api;

contextBridge.exposeInMainWorld("hellstats", api);
