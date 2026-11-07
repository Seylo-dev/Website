// The visitor's theme choice: "system" follows prefers-color-scheme, "light" and "dark" pin one.
// Saved in localStorage under this key; app/layout.tsx reads it before the first paint and
// components/theme-toggle.tsx writes it.

export const themeStorageKey = "theme";

export type ThemeChoice = "system" | "light" | "dark";
