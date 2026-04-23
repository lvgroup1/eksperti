// pages/tames.js
import { useEffect, useState } from "react";
import Link from "next/link";

const STORAGE_KEY = "eksperti_tames";
const getTameStorageKey = (user) => {
  const uid = user?.email || user?.id || user?.fullName || "anonymous";
  return `eksperti_tames_${uid}`;
};


export default function SavedTamesPage() {
  const [tames, setTames] = useState([]);

useEffect(() => {
  if (typeof window === "undefined") return;

  try {
    // nolasām pašreizējo ekspertu
    const userRaw = localStorage.getItem("eksperti_user");
    const user = userRaw ? JSON.parse(userRaw) : null;

    const key = getTameStorageKey(user);
    const raw = localStorage.getItem(key);

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


  const handleBackToForm = () => {
  if (typeof window === "undefined") return;
  // GitHub Pages – app ir zem /eksperti
  window.location.href = "/eksperti";
};


 const handleDeleteAll = () => {
  if (typeof window === "undefined") return;
  if (!window.confirm("Vai tiešām dzēst visas šī eksperta tāmes no šīs ierīces?")) return;

  try {
    const userRaw = localStorage.getItem("eksperti_user");
    const user = userRaw ? JSON.parse(userRaw) : null;
    const key = getTameStorageKey(user);

    localStorage.removeItem(key);
    setTames([]);
  } catch (e) {
    console.error("Neizdevās izdzēst:", e);
  }
};


  const handleDownload = (item) => {
    if (typeof window === "undefined") return;
    if (!item.fileB64) {
      alert("Šai tāmē nav saglabāts Excel fails (izveidota pirms jaunās versijas).");
      return;
    }

    try {
      const binary = window.atob(item.fileB64);
      const len = binary.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binary.charCodeAt(i);
      }

      const blob = new Blob([bytes.buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = item.fileName || "tame.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Download error:", e);
      alert("Neizdevās lejupielādēt tāmi no šīs ierīces.");
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f3f4f6", color: "#111827" }}>
      <div style={{ maxWidth: 1000, margin: "0 auto", padding: 16 }}>
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <div>
            <h1 style={{ fontSize: 30, fontWeight: 800, marginBottom: 4 }}>
              Saglabātās tāmes
            </h1>
            <div style={{ fontSize: 14, color: "#4b5563" }}>
              Tiek rādītas tāmes, kas izveidotas pēdējo 7 dienu laikā uz šīs ierīces.
            </div>
          </div>

          <button
            type="button"
            onClick={handleBackToForm}
            style={{
              padding: "10px 18px",
              borderRadius: 999,
              border: "1px solid #e5e7eb",
              background: "white",
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            ← Atpakaļ uz formu
          </button>
        </div>

        {/* Dzēst visas */}
        {tames.length > 0 && (
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
            <button
              type="button"
              onClick={handleDeleteAll}
              style={{
                padding: "8px 14px",
                borderRadius: 999,
                border: "1px solid #fecaca",
                background: "#fef2f2",
                color: "#b91c1c",
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              Dzēst visas no šīs ierīces
            </button>
          </div>
        )}

        {/* Saraksts */}
        {tames.length === 0 ? (
          <p>Šobrīd nav saglabātu tāmju.</p>
        ) : (
          <div style={{ display: "grid", gap: 16 }}>
            {tames.map((item, idx) => (
              <div
                key={idx}
                style={{
                  background: "white",
                  borderRadius: 16,
                  padding: 20,
                  boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                  border: "1px solid #e5e7eb",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 16,
                }}
              >
                {/* Kreisā puse – info */}
                <div>
                  <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 4 }}>
                    {item.title || `Tāme #${idx + 1}`}
                  </div>
                  <div style={{ fontSize: 15, marginTop: 4 }}>
                    Apdrošinātājs:{" "}
                    <span style={{ fontWeight: 600 }}>
                      {item.insurer || "—"}
                    </span>
                  </div>
                  {item.claimNumber && (
                    <div style={{ fontSize: 15 }}>
                      Lietas Nr.:{" "}
                      <span style={{ fontWeight: 600 }}>{item.claimNumber}</span>
                    </div>
                  )}
                  {item.rooms && item.rooms.length > 0 && (
                    <div style={{ fontSize: 15, marginTop: 2 }}>
                      Telpas: <span style={{ fontWeight: 600 }}>{item.rooms.length}</span>
                    </div>
                  )}

                  {/* Telpu "čipi" */}
                  {item.rooms && item.rooms.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                      {item.rooms.map((r, i) => (
                        <span
                          key={i}
                          style={{
                            padding: "6px 14px",
                            borderRadius: 999,
                            background: "#f3f4f6",
                            border: "1px solid #e5e7eb",
                            fontSize: 13,
                          }}
                        >
                          {r}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Labā puse – datums + download poga */}
                <div style={{ textAlign: "right", minWidth: 180 }}>
                  {item.createdAt && (
                    <>
                      <div style={{ fontSize: 13, color: "#6b7280" }}>Izveidota</div>
                      <div style={{ fontSize: 14, color: "#4b5563" }}>
                        {item.createdAt}
                      </div>
                    </>
                  )}
                  {item.id && (
                    <div
                      style={{
                        fontSize: 13,
                        color: "#9ca3af",
                        marginTop: 4,
                      }}
                    >
                      ID: {item.id}
                    </div>
                  )}

                  <div style={{ marginTop: 16 }}>
                    <button
                      type="button"
                      onClick={() => handleDownload(item)}
                      disabled={!item.fileB64}
                      style={{
                        padding: "8px 14px",
                        borderRadius: 999,
                        border: "1px solid #e5e7eb",
                        background: item.fileB64 ? "#111827" : "#e5e7eb",
                        color: item.fileB64 ? "white" : "#9ca3af",
                        fontSize: 14,
                        cursor: item.fileB64 ? "pointer" : "default",
                      }}
                    >
                      Lejupielādēt tāmi
                    </button>
                    {!item.fileB64 && (
                      <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>
                        (Šī tāme izveidota pirms jaunās versijas, fails nav saglabāts.)
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
