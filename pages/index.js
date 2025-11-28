// pages/index.js
import { useEffect, useState } from "react";
import DamageIntakeForm from "../components/DamageIntakeForm.jsx";

const USERS = [
  {
    email: "gabriella@test.com",
    password: "test",
    fullName: "Gabriella Test",
    buvkomersantaNr: "BV-1234",
    sertNr: "A-00123",
  },
  {
    email: "edgars@example.com",
    password: "lvgroup123",
    fullName: "Edgars Ramanis",
    buvkomersantaNr: "12204",
    sertNr: "4-05120",
  },
];

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [currentUser, setCurrentUser] = useState(null);

  // Auto-login if user data already in localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const saved = localStorage.getItem("eksperti_user");
      if (saved) {
        const parsed = JSON.parse(saved);
        setCurrentUser(parsed);
      }
    } catch (err) {
      console.error("Failed to read saved user", err);
    }
  }, []);

  function handleLoginClick(e) {
    e.preventDefault();
    setError("");

    const user = USERS.find(
      (u) =>
        u.email.toLowerCase() === email.toLowerCase().trim() &&
        u.password === password
    );

    if (!user) {
      setError("Nepareizs e-pasts vai parole.");
      return;
    }

    const profile = {
      email: user.email,
      fullName: user.fullName,
      buvkomersantaNr: user.buvkomersantaNr,
      sertNr: user.sertNr,
    };

    try {
      localStorage.setItem("eksperti_user", JSON.stringify(profile));
    } catch (err) {
      console.error("localStorage error", err);
    }

    setCurrentUser(profile);
  }

  // Ja ielogots – rādam uzreiz formu (wizard)
  if (currentUser) {
    return <DamageIntakeForm currentUser={currentUser} />;
  }

  // Pretējā gadījumā – login ekrāns
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

        <form onSubmit={handleLoginClick}>
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
