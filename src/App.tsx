import {
  FluentProvider,
  webLightTheme,
  webDarkTheme,
} from "@fluentui/react-components";
import { useEffect, useState } from "react";
import { Taskpane } from "./taskpane/Taskpane";
import { ErrorBoundary } from "./taskpane/ErrorBoundary";
import { useAppStore } from "./store/useAppStore";

function isOfficeDarkTheme(): boolean {
  try {
    if (typeof Office !== "undefined" && Office.context?.officeTheme) {
      return Boolean(Office.context.officeTheme.isDarkTheme);
    }
  } catch {
    // not running inside Office
  }
  return false;
}

export default function App(): JSX.Element {
  const theme = useAppStore((s) => s.theme);
  const [officeDark, setOfficeDark] = useState(false);

  useEffect(() => {
    if (theme !== "auto") return;
    const check = (): void => setOfficeDark(isOfficeDarkTheme());
    check();
    const interval = setInterval(check, 2000);
    return () => clearInterval(interval);
  }, [theme]);

  const dark = theme === "dark" || (theme === "auto" && officeDark);

  return (
    <FluentProvider
      theme={dark ? webDarkTheme : webLightTheme}
      style={{ height: "100%" }}
    >
      <ErrorBoundary>
        <Taskpane />
      </ErrorBoundary>
    </FluentProvider>
  );
}
