export type ColorScheme = "light" | "dark"

export const COLOR_SCHEME_STORAGE_KEY = "color-scheme"

export function storedColorScheme(): ColorScheme | null {
  try {
    const stored = window.localStorage.getItem(COLOR_SCHEME_STORAGE_KEY)
    return stored === "light" || stored === "dark" ? stored : null
  } catch {
    return null
  }
}

export function systemColorScheme(): ColorScheme {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

export function currentColorScheme(): ColorScheme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light"
}

export function applyColorScheme(scheme: ColorScheme = storedColorScheme() ?? systemColorScheme()): ColorScheme {
  const root = document.documentElement
  root.classList.toggle("dark", scheme === "dark")
  root.style.colorScheme = scheme
  return scheme
}

export function storeColorScheme(scheme: ColorScheme): ColorScheme {
  writeStoredColorScheme(scheme)
  return applyColorScheme(scheme)
}

function writeStoredColorScheme(scheme: ColorScheme): boolean {
  try {
    window.localStorage.setItem(COLOR_SCHEME_STORAGE_KEY, scheme)
    return true
  } catch {
    return false
  }
}
