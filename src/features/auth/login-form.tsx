"use client";

import { useActionState } from "react";
import { loginAction } from "@/server/actions/auth.actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, undefined);

  return (
    <form action={action} style={{ display: "grid", gap: 12, width: "100%", maxWidth: 360 }}>
      <h1 style={{ margin: 0 }}>Sign in</h1>
      <label style={{ display: "grid", gap: 4 }}>
        Email
        <input name="email" type="email" required autoComplete="email" />
      </label>
      <label style={{ display: "grid", gap: 4 }}>
        Password
        <input name="password" type="password" required autoComplete="current-password" />
      </label>
      {state?.error ? (
        <p role="alert" style={{ color: "crimson", margin: 0 }}>
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} aria-busy={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
