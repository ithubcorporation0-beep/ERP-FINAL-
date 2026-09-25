"use client";

import { useActionState } from "react";
import { loginAction } from "@/server/actions/auth.actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, undefined);

  return (
    <form action={action} style={{ display: "grid", gap: 12, width: "100%", maxWidth: 360 }}>
      <h1 style={{ margin: 0 }}>Sign in</h1>
      <input name="email" type="email" placeholder="Email" required autoComplete="email" />
      <input name="password" type="password" placeholder="Password" required autoComplete="current-password" />
      {state?.error ? <p role="alert" style={{ color: "crimson", margin: 0 }}>{state.error}</p> : null}
      <button type="submit" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
    </form>
  );
}
