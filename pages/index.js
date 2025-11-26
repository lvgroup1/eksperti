// pages/index.js
import { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(e) {
    e.preventDefault();
    setError("");

    // DEBUG: make sure handler is actually running
    alert("Login form submitted!");

    // (Optional) temporarily accept any credentials
    try {
      localStorage.setItem(
        "eksperti_user",
        JSON.stringify({
          email,
          fullName: email || "Eksperts",
        })
      );
    } catch (err) {
      console.error("localStorage error", err);
    }

    try {
      const origin = window.location.origin;
      const isGithub = origin.includes("github.io");

      // GitHub Pages: https://lvgroup1.github.io/eksperti/wizard/
      // Local dev:    http://localhost:3000/wizard/
      const target = isGithub
        ? `${origin}/eksperti/wizard/`
        : `${origin.replace(/\/$/, "")}/wizard/`;

      console.log("Redirecting to:", target);
      window.location.href = target; // or window.location.assign(target);
    } catch (err) {
      console.error("Redirect error:", err);
      setError("Neizdevās pāradresēt uz formu.");
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        background: "#f3f4f6",
      }}
    >
      <div
        style={{
          background: "white",
          padding: "40px",
          borderRadius: "12px",
          boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
          width: "100%",
          maxWidth: "360px",
        }}
      >
        <h2 style={{ marginBottom: "20px" }}>Pieslēgties</h2>

        <form onSubmit={handleSubmit}>
          <input
            type="email"
            placeholder="E-pasts"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{
              width: "100%",
              padding: "10px",
              marginBottom: "12px",
              borderRadius: "8px",
              border: "1px solid #ccc",
            }}
          />

          <input
            type="password"
            placeholder="Parole"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{
              width: "100%",
              padding: "10px",
              marginBottom: "12px",
              borderRadius: "8px",
              border: "1px solid #ccc",
            }}
          />

          <button
            type="submit"
            style={{
              width: "100%",
              padding: "10px",
              borderRadius: "8px",
              background: "#2563eb",
              color: "white",
              border: "none",
              cursor: "pointer",
              marginTop: "5px",
            }}
          >
            Ienākt
          </button>

          {error && (
            <div style={{ color: "red", marginTop: "10px" }}>{error}</div>
          )}
        </form>
      </div>
    </div>
  );
}
