// pages/api/login.js

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  const { email, password } = req.body || {};

  // ⚠️ DEMO ONLY! In production use a DB + hashed passwords.
  const USERS = [
    { email: "gabriella@test", password: "test" },
    { email: "edgars@example.com", password: "lvgroup123" },
  ];

  const user = USERS.find(
    (u) =>
      u.email.toLowerCase() === String(email || "").toLowerCase() &&
      u.password === String(password || "")
  );

  if (!user) {
    return res.status(401).json({
      success: false,
      message: "Nepareizs e-pasts vai parole.",
    });
  }

  // Here you would normally create a session / JWT cookie.
  // For now we just say "ok".
  return res.status(200).json({ success: true });
}
