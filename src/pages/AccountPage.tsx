import { safeReturnPath } from "../utils/returnPath";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { signIn, signOut, useAuth } from "../api/authApi";
import { post } from "../api/client";
export default function AccountPage() {
  const user = useAuth((s) => s.user),
    navigate = useNavigate();
  const [params] = useSearchParams();
  const [registering, setRegistering] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  if (user)
    return (
      <div className="flow-page">
        <h1>Your account</h1>
        <p>
          Signed in as {user.firstName} {user.lastName} ({user.email}).
        </p>
        <p>Role: {user.role}</p>
        <Link className="button button-primary" to="/tickets">
          My Tickets
        </Link>
        <button
          className="button button-secondary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await signOut();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Sign out
        </button>
        {error && <p role="alert">{error}</p>}
      </div>
    );
  return (
    <div className="flow-page">
      <h1>{registering ? "Create your account" : "Sign in to VIBETIX"}</h1>
      <p>
        Sign in before reserving seats. Payments are simulated; inventory and
        orders are stored on the server. Use fictional contact details and a
        unique demo password. Accounts may be reset; email verification and
        recovery are not provided.
      </p>
      <form
        className="panel form-panel account-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          const values = new FormData(e.currentTarget),
            email = String(values.get("email")),
            password = String(values.get("password"));
          try {
            if (registering)
              await post("/auth/register", {
                email,
                password,
                firstName: values.get("firstName"),
                lastName: values.get("lastName"),
              });
            await signIn(email, password);
            const next = params.get("next");
            navigate(safeReturnPath(next));
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="form-grid">
          {registering && (
            <>
              <label>
                First name
                <input
                  name="firstName"
                  autoComplete="given-name"
                  maxLength={80}
                  required
                />
              </label>
              <label>
                Last name
                <input
                  name="lastName"
                  autoComplete="family-name"
                  maxLength={80}
                  required
                />
              </label>
            </>
          )}
          <label className="full-width">
            Email
            <input
              name="email"
              type="email"
              autoComplete="username"
              required
              maxLength={254}
            />
          </label>
          <label className="full-width">
            <span id="account-password-label">Password</span>
            <input
              name="password"
              aria-labelledby="account-password-label"
              aria-describedby="account-password-help"
              type="password"
              minLength={12}
              maxLength={72}
              autoComplete={registering ? "new-password" : "current-password"}
              required
            />
            <small id="account-password-help">
              12–72 characters; maximum 72 UTF-8 bytes.
            </small>
          </label>
        </div>
        {error && (
          <p className="inline-alert" role="alert">
            {error}
          </p>
        )}
        <button className="button button-primary" disabled={busy}>
          {busy ? "Please wait…" : registering ? "Create account" : "Sign in"}
        </button>
      </form>
      <button
        className="button button-secondary"
        disabled={busy}
        onClick={() => setRegistering((x) => !x)}
      >
        {registering
          ? "Already have an account? Sign in"
          : "New here? Create an account"}
      </button>
    </div>
  );
}
