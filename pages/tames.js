// pages/tames.js
import { useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "saved_tames"; // jābūt tādam pašam kā exportToExcel saglabāšanā
const MS_7_DAYS = 7 * 24 * 60 * 60 * 1000;

export default function SavedTamesPage() {
  const [allTames, setAllTames] = useState([]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setAllTames(parsed);
      }
    } catch (err) {
      console.error("Neizdevās nolasīt saglabātās tāmēs:", err);
    }
  }, []);

  // Pēdējo 7 dienu tāmes, sakārtotas pēc datuma (jaunākās augšā)
  const tames = useMemo(() => {
    const now = Date.now();
    return (allTames || [])
      .map((t) => {
        const rawDate = t.date || t.createdAt;
        const ts = rawDate ? Date.parse(rawDate) : NaN;
        return { ...t, _ts: Number.isFinite(ts) ? ts : 0 };
      })
      .filter((t) => t._ts && now - t._ts <= MS_7_DAYS)
      .sort((a, b) => b._ts - a._ts);
  }, [allTames]);

  function formatDate(raw) {
    if (!raw) return "—";
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString("lv-LV", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function handleClearAll() {
    if (typeof window === "undefined") return;
    if (!window.confirm("Vai tiešām dzēst visas saglabātās tāmes no šīs ierīces?")) {
      return;
    }
    try {
      localStorage.removeItem(STORAGE_KEY);
      setAllTames([]);
    } catch (err) {
      console.error("Neizdevās iztīrīt saglabātās tāmēs:", err);
    }
  }

function handleBackToForm() {
  const base = window.location.pathname.split("/")[1]; // "eksperti"
  window.location.href = `/${base}/wizard/`;
}


  return (
    <div style={{ minHeight: "100vh", background: "#f7fafc", color: "#111827" }}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: 16 }}>
        {/* Header ar atpakaļ pogu */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>
              Saglabātās tāmēs
            </h1>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "#6b7280" }}>
              Tiek rādītas tāmes, kas izveidotas pēdējo 7 dienu laikā uz šīs ierīces.
            </p>
          </div>

<button
  type="button"
  onClick={handleBackToForm}
  style={{
    padding: "8px 14px",
    borderRadius: 999,
    border: "1px solid #e5e7eb",
    background: "white",
    textDecoration: "none",
    fontSize: 14,
    color: "#111827",
    cursor: "pointer",
  }}
>
  ← Atpakaļ uz formu
</button>
        </div>

        {/* Clear poga, ja ir dati */}
        {tames.length > 0 && (
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
            <button
              type="button"
              onClick={handleClearAll}
              style={{
                fontSize: 12,
                padding: "6px 10px",
                borderRadius: 999,
                border: "1px solid #fecaca",
                background: "#fef2f2",
                color: "#b91c1c",
                cursor: "pointer",
              }}
            >
              Dzēst visas no šīs ierīces
            </button>
          </div>
        )}

        {tames.length === 0 ? (
          <div
            style={{
              background: "white",
              borderRadius: 12,
              padding: 20,
              border: "1px dashed #d1d5db",
              textAlign: "center",
              color: "#6b7280",
              fontSize: 14,
            }}
          >
            Šobrīd nav saglabātu tāmju pēdējo 7 dienu laikā.
            <br />
            <span style={{ fontSize: 12 }}>
              Uzģenerē jaunu tāmi formā – pēc Excel lejupielādes tā parādīsies šeit.
            </span>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {tames.map((item, idx) => {
              const roomsCount =
                typeof item.totalRooms === "number"
                  ? item.totalRooms
                  : Array.isArray(item.rooms)
                  ? item.rooms.length
                  : null;

              const mainTitle =
                item.address?.trim() ||
                item.claimNumber?.trim() ||
                `Tāme #${idx + 1}`;

              return (
                <div
                  key={item.id || idx}
                  style={{
                    background: "white",
                    borderRadius: 12,
                    padding: 16,
                    boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                    border: "1px solid #e5e7eb",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      marginBottom: 4,
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 15 }}>
                        {mainTitle}
                      </div>

                      <div style={{ marginTop: 4, fontSize: 13, color: "#4b5563" }}>
                        {item.insurer && (
                          <span>
                            Apdrošinātājs: <strong>{item.insurer}</strong>
                          </span>
                        )}
                        {item.claimNumber && (
                          <>
                            <br />
                            Lietas Nr.: <strong>{item.claimNumber}</strong>
                          </>
                        )}
                        {roomsCount !== null && (
                          <>
                            <br />
                            Telpas: <strong>{roomsCount}</strong>
                          </>
                        )}
                      </div>
                    </div>

                    <div style={{ textAlign: "right", fontSize: 12, color: "#6b7280" }}>
                      <div style={{ fontWeight: 500 }}>Izveidota</div>
                      <div>{formatDate(item.date || item.createdAt)}</div>
                      {item.id && (
                        <div style={{ marginTop: 4, fontSize: 11, color: "#9ca3af" }}>
                          ID: {item.id}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Īss telpu saraksts */}
                  {Array.isArray(item.rooms) && item.rooms.length > 0 && (
                    <div
                      style={{
                        marginTop: 8,
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 6,
                        fontSize: 11,
                      }}
                    >
                      {item.rooms.slice(0, 4).map((r, i) => (
                        <span
                          key={r.id || i}
                          style={{
                            padding: "4px 8px",
                            borderRadius: 999,
                            background: "#f3f4f6",
                            border: "1px solid #e5e7eb",
                          }}
                        >
                          {r.type || "Telpa"} {r.index || ""}
                        </span>
                      ))}
                      {item.rooms.length > 4 && (
                        <span style={{ fontSize: 11, color: "#6b7280" }}>
                          + vēl {item.rooms.length - 4}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
