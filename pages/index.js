// pages/index.js  -> LOGIN PAGE (no API call)
import { useState, useEffect } from "react";
import { useRouter } from "next/router";

// 🔐 Only you edit this list in code
const USERS = [
  { email: "gabriella@example.com", password: "supersecret" },
  { email: "edgars@example.com",   password: "lvgroup123" },
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  // If already logged in, go straight to wizard
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem("wizard_logged_in") === "1") {
      router.replace("/wizard");
    }
  }, [router]);

  function handleSubmit(e) {
    e.preventDefault();
    setError("");

    const user = USERS.find(
      (u) =>
        u.email.toLowerCase() === email.toLowerCase() &&
        u.password === password
    );

    if (!user) {
      setError("Nepareizs e-pasts vai parole.");
      return;
    }

    if (typeof window !== "undefined") {
      window.localStorage.setItem("wizard_logged_in", "1");
    }
    router.push("/wizard");
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f3f4f6",
        fontFamily:
          "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          background: "white",
          borderRadius: 16,
          padding: 24,
          boxShadow: "0 20px 40px rgba(15,23,42,0.12)",
        }}
      >
        <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>
          Ekspertu portāls
        </h1>
        <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 16 }}>
          Pieraksties ar savu LV GROUP kontu.
        </p>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 12 }}>
            <label
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: 600,
                marginBottom: 4,
              }}
            >
              E-pasts
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{
                width: "100%",
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                padding: "8px 10px",
              }}
            />
          </div>

          <div style={{ marginBottom: 8 }}>
            <label
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: 600,
                marginBottom: 4,
              }}
            >
              Parole
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{
                width: "100%",
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                padding: "8px 10px",
              }}
            />
          </div>

          {error && (
            <div
              style={{
                margin: "8px 0",
                fontSize: 13,
                color: "#b91c1c",
                background: "#fee2e2",
                borderRadius: 8,
                padding: "6px 8px",
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            style={{
              marginTop: 10,
              width: "100%",
              borderRadius: 10,
              border: "none",
              padding: "10px 14px",
              fontWeight: 600,
              background: "#111827",
              color: "white",
              cursor: "pointer",
            }}
          >
            Pierakstīties
          </button>
        </form>

        <p style={{ marginTop: 16, fontSize: 12, color: "#9ca3af" }}>
          Lietotājus var pievienot tikai administrators, rediģējot kodu.
        </p>
      </div>
    </div>
  );
}
