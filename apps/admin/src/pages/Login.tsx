import { useState } from "react";
import { login } from "../lib/api";
import type { AdminProfile } from "../lib/session";

export function LoginPage({ onSignedIn }: { onSignedIn: (admin: AdminProfile) => void }) {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setPending(true);
    try {
      onSignedIn(await login(phone.trim(), password));
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="login">
      <div className="login__panel">
        <div className="login__brand">
          <span className="sidebar__mark">A</span>
          <span className="sidebar__wordmark">
            Afridata
            <small>Admin console</small>
          </span>
        </div>

        <h1>Sign in</h1>
        <p className="login__lead">Enter your admin phone number and password to continue.</p>

        <form className="login__form" onSubmit={handleSubmit} noValidate>
          {error && <p className="form__banner">{error}</p>}

          <label className="field">
            Phone number
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="0000000000"
              inputMode="tel"
              autoComplete="username"
              autoFocus
            />
          </label>

          <label className="field">
            Password
            <span className="input-group">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
              />
              <button
                type="button"
                className="input-group__toggle"
                onClick={() => setShowPassword((current) => !current)}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </span>
          </label>

          <button
            type="submit"
            className="button button--primary login__submit"
            disabled={pending || !phone || !password}
          >
            {pending ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="login__note">
          Accounts are created by a super admin. If you cannot sign in, ask them to add you.
        </p>
      </div>

      <div className="login__aside">
        <h2>Agent network, in one place</h2>
        <p>
          Register agents, keep their Telebirr PINs current, and watch the float across every
          region.
        </p>
      </div>
    </div>
  );
}
