export type ThemeId =
  | "retrowave"
  | "ghibli"
  | "fiesta"
  | "dawn"
  | "synthwave84"
  | "solarizedDark";

export interface ThemeMeta {
  id: ThemeId;
  name: string;
  swatches: [string, string, string]; // bg, surface, accent
}

export const THEMES: Record<ThemeId, ThemeMeta> = {
  retrowave: { id: "retrowave", name: "Retrowave", swatches: ["#050010", "#160a35", "#ff2e9a"] },
  ghibli: { id: "ghibli", name: "Ghibli", swatches: ["#f4ecd8", "#fff8e7", "#4a8b6f"] },
  fiesta: { id: "fiesta", name: "Fiesta", swatches: ["#1a0b3d", "#2d1b55", "#ff006e"] },
  dawn: { id: "dawn", name: "Dawn", swatches: ["#e9eef6", "#f7f3fb", "#ff7e6b"] },
  synthwave84: { id: "synthwave84", name: "Synthwave '84", swatches: ["#1a1126", "#34294f", "#ff7edb"] },
  solarizedDark: { id: "solarizedDark", name: "Solarized Dark", swatches: ["#002b36", "#073642", "#268bd2"] },
};

export const THEME_IDS = Object.keys(THEMES) as ThemeId[];
export const DEFAULT_THEME: ThemeId = "retrowave";
const STORAGE_KEY = "hellstats.theme";

class ThemeStore {
  current = $state<ThemeId>(DEFAULT_THEME);

  init() {
    const saved = localStorage.getItem(STORAGE_KEY) as ThemeId | null;
    if (saved && THEMES[saved]) this.set(saved);
    else this.apply(this.current);
  }

  set(id: ThemeId) {
    this.current = id;
    localStorage.setItem(STORAGE_KEY, id);
    this.apply(id);
  }

  toggle() {
    const idx = THEME_IDS.indexOf(this.current);
    this.set(THEME_IDS[(idx + 1) % THEME_IDS.length]);
  }

  private apply(id: ThemeId) {
    document.documentElement.setAttribute("data-theme", id);
  }
}

export const themeStore = new ThemeStore();
