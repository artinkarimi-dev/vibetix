import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
interface State {
  failed: boolean;
}
export class AppErrorBoundary extends Component<
  { children: ReactNode },
  State
> {
  state: State = { failed: false };
  static getDerivedStateFromError(): State {
    return { failed: true };
  }
  componentDidCatch(_error: Error, _info: ErrorInfo) {

  }
  render() {
    return this.state.failed ? (
      <div className="empty-state">
        <h1>Something interrupted the night.</h1>
        <p>
          Your saved orders are still on this browser. Reload to recover the
          page.
        </p>
        <button
          className="button button-primary"
          onClick={() => window.location.assign("/")}
        >
          Reload VIBETIX
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}
