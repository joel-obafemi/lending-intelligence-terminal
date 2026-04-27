/**
 * Light-mode-only theme tokens, exposed as a hook so existing chart
 * components (Recharts axes, tooltips, gridlines) can read color values
 * inline. The terminal is light-only — aligned with `@datumlabs/dashboard-kit`'s
 * canonical theme.
 *
 * NOTE: this file used to host a full ThemeProvider with light/dark toggle.
 * That toggle was removed when the SDK standardized on light-only. The
 * `useThemeColors` export stays to avoid touching every chart consumer.
 */

const LIGHT_COLORS = {
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

/** Returns CSS-equivalent color values for inline use (Recharts, etc). */
export function useThemeColors() {
  return LIGHT_COLORS
}
