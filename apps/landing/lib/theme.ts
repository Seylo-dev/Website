// The visitor's theme choice: "system" follows prefers-color-scheme, "light" and "dark" pin one.
// Saved in localStorage under this key; app/layout.tsx reads it before the first paint and
// components/theme-toggle.tsx writes it.

export const themeStorageKey = "theme";

export type ThemeChoice = "system" | "light" | "dark";

/** The page's ground per theme, for the browser's own chrome (`<meta name="theme-color">`). */
export const themeColors = { light: "#F3F5F9", dark: "#070B18" } as const;

/**
 * A pinned theme gets a `<meta name="theme-color">` of its own, without `media`, placed before the
 * per-scheme ones from the viewport config: the browser takes the first one that matches, so its chrome
 * follows the pinned theme instead of the system. "System" removes it. The content is the same color in
 * lowercase on purpose: during hydration React adopts server-rendered `<meta>` tags by their content
 * text, and an identical one would be taken over in place of the viewport's own tag.
 */
export const themePinAttribute = "data-theme-pin";
export const pinnedThemeColor = (theme: "light" | "dark") => themeColors[theme].toLowerCase();
