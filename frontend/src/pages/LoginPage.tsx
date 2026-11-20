import { motion } from "framer-motion";
import { Lock } from "lucide-react";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { login } from "../api";

const inputStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  marginTop: 6,
  background: "var(--page-plane)",
  color: "var(--text-primary)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "10px 12px",
  fontSize: 14,
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = { fontSize: 13, color: "var(--text-secondary)", display: "block", marginBottom: 14 };

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const from = (location.state as { from?: string } | null)?.from || "/builder/analytics";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(username, password);
      navigate(from, { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      setError(message.includes("401") ? "Incorrect username or password" : message.includes("503") ? "Login isn't configured yet" : message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--surface-1)",
        padding: 24,
      }}
    >
      <motion.form
        onSubmit={handleSubmit}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        style={{
          width: "100%",
          maxWidth: 340,
          background: "var(--page-plane)",
          border: "1px solid var(--border)",
          borderRadius: 16,
          padding: 28,
        }}
      >
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            background: "var(--gridline)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 18,
          }}
        >
          <Lock size={20} color="var(--text-primary)" />
        </div>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 4px" }}>Tinasuze dashboard</h1>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 20px" }}>Sign in to manage the creator page.</p>

        <label style={labelStyle}>
          Username
          <input style={inputStyle} value={username} onChange={(e) => setUsername(e.target.value)} autoFocus autoComplete="username" />
        </label>
        <label style={labelStyle}>
          Password
          <input
            style={inputStyle}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </label>

        {error && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{ fontSize: 12.5, color: "var(--series-red, #d64545)", margin: "-4px 0 14px" }}
          >
            {error}
          </motion.p>
        )}

        <button
          type="submit"
          disabled={submitting || !username || !password}
          style={{
            width: "100%",
            background: "var(--text-primary)",
            color: "var(--surface-1)",
            border: "none",
            borderRadius: 8,
            padding: "10px 0",
            fontSize: 14,
            fontWeight: 700,
            cursor: submitting || !username || !password ? "default" : "pointer",
            opacity: submitting || !username || !password ? 0.6 : 1,
          }}
        >
          {submitting ? "Signing in..." : "Sign in"}
        </button>
      </motion.form>
    </div>
  );
}
