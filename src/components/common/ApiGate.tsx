import {
  subscribeAccountChanges,
  invalidateAccount,
} from "../../api/authScope";
import { useEffect, useState, type ReactNode } from "react";
import { FIXTURE_MODE } from "../../api/client";
import { loadCatalog } from "../../api/catalogApi";
import { restoreSession } from "../../api/authApi";
let initialization: Promise<void> | null = null;
export function ApiGate({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (FIXTURE_MODE) return;
    return subscribeAccountChanges(() => {
      invalidateAccount();
      window.location.reload();
    });
  }, []);
  const [state, setState] = useState(FIXTURE_MODE ? "ready" : "loading");
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (FIXTURE_MODE) return;
    let active = true;
    setState("loading");
    (initialization ??= loadCatalog().then(() => restoreSession()))
      .then(() => {
        if (active) setState("ready");
      })
      .catch((e) => {
        if (active) {
          initialization = null;
          setError(e instanceof Error ? e.message : "Cannot load VIBETIX.");
          setState("error");
        }
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  if (state === "loading")
    return (
      <main className="flow-page" aria-busy="true">
        <h1>Loading VIBETIX…</h1>
        <p role="status">Connecting to the event catalog.</p>
      </main>
    );
  if (state === "error")
    return (
      <main className="flow-page">
        <h1>VIBETIX is temporarily unavailable</h1>
        <p role="alert">{error}</p>
        <button
          className="button button-primary"
          onClick={() => setAttempt((x) => x + 1)}
        >
          Retry connection
        </button>
      </main>
    );
  return children;
}
