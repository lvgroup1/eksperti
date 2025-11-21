// pages/index.js  — LOGIN PAGE (no API needed)
import { useState } from "react";
import { useRouter } from "next/router";

const USERS = [
  { email: "gabriella@test.com", password: "test" },
  { email: "edgars@example.com", password: "lvgroup123" },
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  function handleLogin(e) {
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

    localStorage.setItem("wizard_logged_in", "1");
    router.push("/wizard");
  }

  return (
    <div style={{ padding: 40 }}>
      <h1>Pierakstīšanās</h1>

      <form onSubmit={handleLogin}>
        <input
          type="email"
          placeholder="E-pasts"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          type="password"
          placeholder="Parole"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button type="submit">Ienākt</button>

        {error && <p style={{ color: "red" }}>{error}</p>}
      </form>
    </div>
  );
}
