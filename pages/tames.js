// pages/tames.js
import React, { useEffect, useState } from "react";
import Link from "next/link";

const STORAGE_KEY = "tames_profils_saglabatie";
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export default function SavedTamesPage() {
  const [saved, setSaved] = useState([]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;

      const parsed = Array.isArray(JSON.parse(raw)) ? JSON.parse(raw) : [];
      const now = Date.now();

      // atstāj tikai pēdējo 7 dienu ierakstus
      const filtered = parsed.filter((e) => {
        const t = Date.parse(e.createdAtISO || e.createdAt || "");
        if (!Number.isFinite(t)) return false;
        return now - t <= WEEK_MS;
      });

      setSaved(filtered);

      // ja kaut kas tika izmests – pārrakstam storage
      if (filtered.length !== parsed.length) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
      }
    } catch (err) {
      console.error("Neizdevās nolasīt saglabātās tāmes:", err);
    }
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "#f7fafc", color: "#111827" }}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: 16 }}>
        {/* Augšējā rindiņa ar atpakaļ pogu */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800 }}>Saglabātās tāmēs</h1>
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

        {/* Pelēks paskaidrojums */}
        <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 12 }}>
          Šeit saglabājas tāmes vienu nedēļu.
        </div>

        <div style={{ background: "white", padding: 16, borderRadius: 12 }}>
          {saved.length === 0 ? (
            <div style={{ color: "#6b7280" }}>Pēdējo 7 dienu laikā nav saglabātu tāmju.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", fontSize: 14, borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb" }}>
                    <th style={{ padding: "8px 12px" }}>Fails</th>
                    <th style={{ padding: "8px 12px" }}>Tāmētājs</th>
                    <th style={{ padding: "8px 12px" }}>Datums</th>
                  </tr>
                </thead>
                <tbody>
                  {saved.map((e) => (
                    <tr key={e.id || e.filename} style={{ borderBottom: "1px solid #e5e7eb" }}>
                      <td
                        style={{
                          padding: "8px 12px",
                          fontFamily:
                            "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
                        }}
                      >
                        {e.filename}
                      </td>
                      <td style={{ padding: "8px 12px" }}>{e.estimator || "Nezināms"}</td>
                      <td style={{ padding: "8px 12px" }}>
                        {e.createdAtISO
                          ? new Date(e.createdAtISO).toLocaleString()
                          : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
