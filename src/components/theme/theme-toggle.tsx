"use client";

import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppearance } from "@/components/theme/theme-provider";

export function ThemeToggle() {
  const { theme, toggleTheme } = useAppearance();
  const label = theme === "dark" ? "Switch to light theme" : "Switch to dark theme";

  return (
    <Button type="button" variant="outline" size="icon" onClick={toggleTheme} aria-label={label} title={label}>
      {theme === "dark" ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
    </Button>
  );
}
