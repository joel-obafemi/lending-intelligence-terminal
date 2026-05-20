/**
 * Theme toggle — sun ⇄ moon button rendered in the nav header.
 *
 * Reads from `useTheme()` and flips the active theme. The toggle keeps
 * its own focus state so keyboard users get a visible affordance.
 */
"use client"

import { Moon, Sun } from "lucide-react"
import { useTheme } from "./theme-provider"

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  const label = theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={label}
      title={label}
      className="inline-flex items-center justify-center rounded-md border transition-colors"
      style={{
        width: 30,
        height: 30,
        borderColor: "var(--border)",
        background: "transparent",
        color: "var(--text-muted)",
        cursor: "pointer",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = "var(--text-primary)"
        e.currentTarget.style.borderColor = "var(--border-bright)"
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = "var(--text-muted)"
        e.currentTarget.style.borderColor = "var(--border)"
      }}
    >
      {theme === "dark" ? (
        <Sun size={14} strokeWidth={2} />
      ) : (
        <Moon size={14} strokeWidth={2} />
      )}
    </button>
  )
}
