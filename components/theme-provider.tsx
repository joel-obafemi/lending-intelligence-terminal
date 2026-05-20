/**
 * Theme provider + hook.
 *
 * Two responsibilities:
 *   1. Sync the active theme between localStorage and the
 *      `<html data-theme="...">` attribute. The pre-paint inline script in
 *      app/layout.tsx applies the persisted choice before React hydrates,
 *      so there is no light-mode flash on dark-default loads.
 *   2. Expose `useThemeColors()` — a Recharts-friendly object of computed
 *      color values that mirrors the live CSS variables. Components that
 *      cannot read CSS variables directly (Recharts axes, tooltips,
 *      gridlines) read this hook and re-render when the theme toggles.
 *
 * Default: dark. The toggle button (ThemeToggle, rendered in the nav) sets
 * "light" or "dark" and persists to localStorage under `lit-theme`.
 */
"use client"

import { createContext, useCallback, useContext, useEffect, useState } from "react"

export type Theme = "light" | "dark"

export const THEME_STORAGE_KEY = "lit-theme"

interface ThemeContextValue {
  theme: Theme
  setTheme: (next: Theme) => void
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

/**
 * Reads the active theme by inspecting the `<html data-theme>` attribute.
 * The attribute is set pre-paint by an inline script in app/layout.tsx;
 * during SSR we fall back to "dark" (the default).
 */
function readActiveTheme(): Theme {
  if (typeof document === "undefined") return "dark"
  const attr = document.documentElement.getAttribute("data-theme")
  return attr === "light" ? "light" : "dark"
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => readActiveTheme())

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next)
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-theme", next)
    }
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, next)
      } catch {
        // localStorage can be disabled (privacy mode); the in-memory state
        // and DOM attribute still flip so the UI works for this session.
      }
    }
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark")
  }, [theme, setTheme])

  // Sync on mount in case the inline script set a different value than the
  // SSR default. This is a no-op on the steady state.
  useEffect(() => {
    const active = readActiveTheme()
    if (active !== theme) setThemeState(active)
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (ctx) return ctx
  // Provider-absent fallback. Components that consume the context inside a
  // test (or in a route that forgets to wrap in ThemeProvider) get a stable
  // dark-mode reading. No-op setters keep them functional.
  return {
    theme: "dark",
    setTheme: () => {},
    toggleTheme: () => {},
  }
}

/**
 * Live color object that mirrors the active theme. Recharts components
 * read from this so axes / tooltips / gridlines flip instantly on toggle.
 *
 * Implementation: SSR / first-paint returns a fallback matching the
 * default theme. Once mounted, a single getComputedStyle pass on
 * `document.documentElement` reads the live CSS variable values. A
 * MutationObserver on the html element re-reads when `data-theme`
 * changes, so every consuming chart re-renders with the new colors.
 */
const DARK_FALLBACK = {
  background: "#0B0D11",
  cardBg: "#14171D",
  cardBorder: "rgba(255, 255, 255, 0.08)",
  textPrimary: "#E5E7EB",
  textSecondary: "#C8CCD6",
  textMuted: "#8B92A1",
  accent: "#FF8155",
  success: "#34D399",
  danger: "#F26B68",
}

const LIGHT_FALLBACK = {
  background: "#F5F6F8",
  cardBg: "#FFFFFF",
  cardBorder: "rgba(15, 17, 21, 0.08)",
  textPrimary: "#0F1115",
  textSecondary: "#2C3344",
  textMuted: "#5B6373",
  accent: "#FF6B35",
  success: "#0F9D58",
  danger: "#D6322E",
}

type ThemeColors = typeof DARK_FALLBACK

function readLiveColors(theme: Theme): ThemeColors {
  if (typeof window === "undefined") {
    return theme === "light" ? LIGHT_FALLBACK : DARK_FALLBACK
  }
  const style = window.getComputedStyle(document.documentElement)
  const read = (name: string, fallback: string) => {
    const v = style.getPropertyValue(name).trim()
    return v.length > 0 ? v : fallback
  }
  const fb = theme === "light" ? LIGHT_FALLBACK : DARK_FALLBACK
  return {
    background: read("--background", fb.background),
    cardBg: read("--card-bg", fb.cardBg) || read("--card", fb.cardBg),
    cardBorder: read("--card-border", fb.cardBorder) || read("--border", fb.cardBorder),
    textPrimary: read("--text-primary", fb.textPrimary) || read("--foreground", fb.textPrimary),
    textSecondary: read("--text-secondary", fb.textSecondary),
    textMuted: read("--text-muted", fb.textMuted),
    accent: read("--accent", fb.accent) || read("--accent-orange", fb.accent),
    success: read("--success", fb.success) || read("--accent-green", fb.success),
    danger: read("--danger", fb.danger) || read("--accent-red", fb.danger),
  }
}

export function useThemeColors(): ThemeColors {
  const { theme } = useTheme()
  const [colors, setColors] = useState<ThemeColors>(() =>
    theme === "light" ? LIGHT_FALLBACK : DARK_FALLBACK,
  )

  useEffect(() => {
    const update = () => setColors(readLiveColors(theme))
    update()
    if (typeof document === "undefined") return
    const observer = new MutationObserver(update)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    })
    return () => observer.disconnect()
  }, [theme])

  return colors
}
