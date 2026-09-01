import * as React from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../lib/useTheme.js";
import { Button } from "../ui/button.js";
import { Moon, Sun } from "../ui/icons.js";

export function ThemeToggle(): React.JSX.Element {
  const { t } = useTranslation();
  const [theme, toggle] = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={t("header.themeToggle")}
      title={theme === "dark" ? t("header.themeDark") : t("header.themeLight")}
      onClick={toggle}
    >
      {theme === "dark" ? <Moon /> : <Sun />}
    </Button>
  );
}
