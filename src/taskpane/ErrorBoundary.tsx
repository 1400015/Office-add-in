import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@fluentui/react-components";
import i18n from "../i18n";
import { logger } from "../services/LoggerService";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    logger.error("ui", "Unhandled render error", {
      error: error.message,
      component: info.componentStack ?? "",
    });
  }

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="empty-state">
        <div style={{ fontSize: 15, fontWeight: 600 }}>
          {i18n.t("errors.uiCrash")}
        </div>
        <Button appearance="primary" onClick={() => window.location.reload()}>
          {i18n.t("common.reload")}
        </Button>
      </div>
    );
  }
}
