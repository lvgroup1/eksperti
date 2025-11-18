import React, { useState } from "react";
import { useRouter } from "next/router";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.message || "Nepareizs e-pasts vai parole.");
      } else {
        // Success → send user to main wizard
        router.push("/");
      }
    } catch (err) {
      console.error(err);
      setError("Radās kļūda, mēģini vēlreiz.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "#f3f4f6",
      fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    }}>
      <div style={{
        width: "100%",
        maxWidth: 420,
        background: "white",
        borderRadius: 16,
        padding: 24,
        boxShadow: "0 20px 40px rgba(15,23,42,0.12)"
      }}>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>
            Ekspertu portāls
          </div>
          <div style={{ fontSize: 13, color: "#6b7280" }}>
            Pieraksties ar savu LV GROUP kontu.
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
              E-pasts
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              style={{
                width: "100%",
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                padding: "8px 10px",
                fontSize: 14,
              }}
              placeholder="piem., eksperts@lvgroup.lv"
            />
          </div>

          <div style={{ marginBottom: 8 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
              Parole
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              style={{
                width: "100%",
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                padding: "8px 10px",
                fontSize: 14,
              }}
              placeholder="Ievadi paroli"
            />
          </div>

          {error && (
            <div style={{
              margin: "8px 0 4px",
              fontSize: 13,
              color: "#b91c1c",
              background: "#fee2e2",
              borderRadius: 8,
              padding: "6px 8px",
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: 10,
              width: "100%",
              borderRadius: 10,
              border: "none",
              padding: "10px 14px",
              fontWeight: 600,
              fontSize: 15,
              background: loading ? "#9ca3af" : "#111827",
              color: "white",
              cursor: loading ? "default" : "pointer",
            }}
          >
            {loading ? "Pieslēdzas..." : "Pierakstīties"}
          </button>
        </form>

        <div style={{ marginTop: 16, fontSize: 12, color: "#9ca3af" }}>
          Lietotājus var pievienot tikai administrators (koda / datubāzes līmenī).
          Nav pašreģistrācijas.
        </div>
      </div>
    </div>
  );
}
