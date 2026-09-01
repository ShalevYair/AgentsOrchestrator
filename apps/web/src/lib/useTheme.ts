import * as React from "react";
import { applyTheme, getInitialTheme, type Theme } from "./theme.js";

export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = React.useState<Theme>(getInitialTheme);

  React.useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const toggle = React.useCallback(() => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  }, []);

  return [theme, toggle];
}
