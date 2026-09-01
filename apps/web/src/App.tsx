import * as React from "react";
import { useTranslation } from "react-i18next";
import { isRtl } from "./i18n/index.js";
import { api } from "./lib/api.js";
import { Header } from "./components/layout/Header.js";
import { ChatView } from "./components/chat/ChatView.js";
import { SettingsDialog } from "./components/settings/SettingsDialog.js";

/**
 * ADR-010: `dir`/`lang` on `<html>` react live to a language switch, not
 * just at initial load — driven off `i18n.language` here rather than a
 * one-time index.html attribute.
 */
function useDocumentLocale(): string {
  const { i18n } = useTranslation();
  React.useEffect(() => {
    document.documentElement.lang = i18n.language;
    document.documentElement.dir = isRtl(i18n.language) ? "rtl" : "ltr";
  }, [i18n.language]);
  return i18n.language;
}

export default function App(): React.JSX.Element {
  useDocumentLocale();
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [tokens, setTokens] = React.useState(0);
  const checkedOnboarding = React.useRef(false);

  React.useEffect(() => {
    if (checkedOnboarding.current) return;
    checkedOnboarding.current = true;
    // UX.md §10 / P2-T7: a brand-new user with no API key lands on
    // Settings first, not a chat screen that quietly only produces mock
    // replies with no explanation.
    api
      .keyStatus()
      .then((status) => {
        if (!status.hasKey) setSettingsOpen(true);
      })
      .catch(() => {
        // Runtime unreachable at all is a bigger problem than this nicety.
      });
  }, []);

  return (
    <div className="flex h-screen flex-col">
      <Header tokens={tokens} onOpenSettings={() => setSettingsOpen(true)} />
      <main className="flex flex-1 overflow-hidden">
        <ChatView onTokensChange={setTokens} />
      </main>
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}
