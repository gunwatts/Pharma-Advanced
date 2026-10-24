import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { errorMessage } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { Button, Callout, Field, TextInput } from "../components/ui";

export default function Login() {
  const { user, login, expired } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const from = (location.state as { from?: string } | null)?.from;

  if (user) return <Navigate to={from || "/"} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(username.trim(), password);
      navigate(from || "/", { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setPassword("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={(e) => void submit(e)} aria-labelledby="login-title">
        <div className="brand-mark" aria-hidden>QA</div>
        <h1 id="login-title">QA Reminder System</h1>
        <p className="muted">Sign in with your company account.</p>
        {expired && <Callout tone="warning">Your session expired. Please sign in again.</Callout>}
        {error && <Callout tone="critical">{error}</Callout>}
        <Field label="Username">{(id) => <TextInput id={id} value={username} onChange={setUsername} autoComplete="username" />}</Field>
        <Field label="Password">{(id) => <TextInput id={id} type="password" value={password} onChange={setPassword} autoComplete="current-password" />}</Field>
        <Button type="submit" variant="primary" busy={busy} disabled={!username || !password} className="block">Sign in</Button>
        <p className="small muted">Authorised users only. Activity is logged.</p>
      </form>
    </main>
  );
}
