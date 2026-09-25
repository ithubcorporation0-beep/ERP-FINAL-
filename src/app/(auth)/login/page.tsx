import { LoginForm } from "@/features/auth/login-form";

export default function LoginPage() {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16 }}>
      <LoginForm />
    </main>
  );
}
