import * as React from "react"
import { Moon, Sun } from "lucide-react"

import { Button } from "@/components/ui/button"
import { currentColorScheme, storeColorScheme, type ColorScheme } from "@/lib/color-scheme"

type ColorSchemeToggleProps = {
  label?: string
}

function ColorSchemeToggle({ label = "Dark mode" }: ColorSchemeToggleProps) {
  const [scheme, setScheme] = React.useState<ColorScheme>(currentColorScheme)
  const dark = scheme === "dark"

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={label}
      aria-pressed={dark}
      onClick={() => setScheme(storeColorScheme(dark ? "light" : "dark"))}
    >
      {dark ? <Moon aria-hidden /> : <Sun aria-hidden />}
    </Button>
  )
}

export { ColorSchemeToggle }
