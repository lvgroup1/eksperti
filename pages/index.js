import { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

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

  // saglabājam pilnu profilu pārlūkā
  localStorage.setItem(
    "eksperti_user",
    JSON.stringify({
      email: user.email,
      fullName: user.fullName,
      buvkomersantaNr: user.buvkomersantaNr,
      sertNr: user.sertNr,
    })
  );

  // --- FIXED REDIRECT ---
  // Nosakām, vai esam GitHub Pages (/eksperti) vai lokāli (/)
  const path = window.location.pathname;
  const base = path.startsWith("/eksperti") ? "/eksperti" : "";

  // Pāradresācija:
  window.location.href = `${base}/wizard/`;
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
