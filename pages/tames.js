// pages/tames.js
import { useEffect, useState } from "react";
import Link from "next/link";

const STORAGE_KEY = "eksperti_tames"; // adjust if you use a different key

export default function SavedTamesPage() {
  const [tames, setTames] = useState([]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setTames(parsed);
        }
      }
    } catch (err) {
      console.error("Neizdevās nolasīt saglabātās tāmēs:", err);
    }
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "#f7fafc", color: "#111827" }}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: 16 }}>
        {/* Augšējā rindiņa ar atpakaļ pogu */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <h1 style={{ fontSize: 22, fontWeight: 800 }}>Saglabātās tāmēs</h1>

          {/* Šī poga ved atpakaļ uz formu (wizard.js lapu) */}
          <Link
            href="/wizard"
            style={{
              padding: "8px 14px",
              borderRadius: 999,
              border: "1px solid #e5e7eb",
              background: "white",
              textDecoration: "none",
              fontSize: 14,
              color: "#111827",
            }}
          >
            ← Atpakaļ uz formu
          </Link>
        </div>

        {/* Saraksts ar tāmēm (vienkāršs piemērs) */}
        {tames.length === 0 ? (
          <p>Šobrīd nav saglabātu tāmju.</p>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {tames.map((item, idx) => (
              <div
                key={idx}
                style={{
                  background: "white",
                  borderRadius: 12,
                  padding: 16,
                  boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
                  border: "1px solid #e5e7eb",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>
                      {item.title || `Tāme #${idx + 1}`}
                    </div>
                    {item.clientName && (
                      <div style={{ fontSize: 14, color: "#6b7280" }}>
                        Klients: {item.clientName}
                      </div>
                    )}
                  </div>
                  {item.total && (
                    <div style={{ fontWeight: 700 }}>{item.total} €</div>
                  )}
                </div>

                {item.createdAt && (
                  <div style={{ marginTop: 8, fontSize: 12, color: "#9ca3af" }}>
                    Izveidota: {item.createdAt}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
