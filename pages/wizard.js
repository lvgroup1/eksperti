
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
    // run only in browser
    if (typeof window === "undefined") return;

    const loggedIn = localStorage.getItem("wizard_logged_in") === "1";
    if (!loggedIn) {
      router.replace("/"); // back to login
    } else {
      setAllowed(true);
    }
    setChecked(true);
  }, [router]);

  // While checking login status
  if (!checked) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div>Notiek ielāde...</div>
      </div>
    );
  }

  // If not allowed, we already redirected → show nothing
  if (!allowed) return null;

  // Logged in → show the wizard
  return <DamageIntakeForm />;
}

