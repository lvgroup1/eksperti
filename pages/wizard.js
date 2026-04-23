
// pages/wizard.js
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import dynamic from "next/dynamic";

const DamageIntakeForm = dynamic(
  () => import("../components/DamageIntakeForm.jsx"),
  { ssr: false }
);

export default function WizardPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const loggedIn = localStorage.getItem("wizard_logged_in") === "1";
    if (!loggedIn) {
      router.replace("/");
    } else {
      setAllowed(true);
    }
    setChecked(true);
  }, [router]);

  function logout() {
    localStorage.removeItem("wizard_logged_in");
    router.replace("/");
  }

  if (!checked) return null;
  if (!allowed) return null;

return (
  <div>
    {/* Floating logout button */}
    <button
      onClick={logout}
      style={{
        position: "fixed",
        top: "20px",
        right: "20px",
        zIndex: 9999,

        background: "#dc2626", // red
        color: "white",        // white text
        border: "none",
        padding: "12px 20px",
        fontSize: "15px",
        fontWeight: "600",

        borderRadius: "50px",    // round pill shape
        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",

        cursor: "pointer",
        transition: "all 0.2s ease",
      }}

      onMouseOver={(e) => {
        e.target.style.background = "#b91c1c"; // darker red on hover
      }}
      onMouseOut={(e) => {
        e.target.style.background = "#dc2626"; // normal red
      }}
    >
      Iziet
    </button>

    <DamageIntakeForm />
  </div>
);
}
