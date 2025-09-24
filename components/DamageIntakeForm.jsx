import React, { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";

// ==========================
//  Damage Intake – STEP WIZARD (1..12)
//  After selecting rooms (9), Step 10 lists all room instances (e.g., Virtuve 1, Virtuve 2).
//  Expert opens one room -> per-room editor (areas + positions/quantities) -> save -> back to list.
//  When ALL rooms have positions entered, Step 10 shows a bottom button
//  "Viss pabeigts — izveidot tāmi" which exports Excel and saves to profile.
// ==========================

// Helper types
const INSURERS = ["Swedbank", "Gjensidige", "Compensa", "IF", "BTA", "Balta"];
const LOCATION_TYPES = ["Komerctelpa", "Dzīvojamā ēka"];
const DWELLING_SUBTYPES = ["Privātmāja", "Daudzdzīvokļu māja", "Rindu māja", "Cits"];
const INCIDENT_TYPES = ["CTA", "Plūdi", "Uguns", "Koks", "Cits"]; // #4
const YES_NO = ["Jā", "Nē"];

const ROOM_TYPES = [
  "Virtuve",
  "Guļamistaba",
  "Koridors",
  "Katla telpa",
  "Dzīvojamā istaba",
  "Vannas istaba",
  "Tualete",
  "Garderobe",
  "Cits",
];

const AREA_OPTIONS = [
  "Griesti",
  "Siena",
  "Grīda",
  "Durvis",
  "Logs",
  "Elektroinstalācija",
  "Mēbeles",
  "Cits",
];

const ACTION_OPTIONS = [
  "Demontāža",
  "Tīrīšana",
  "Gruntēšana",
  "Špaktelēšana",
  "Krāsošana",
  "Lamināta ieklāšana",
  "Flīzēšana",
  "Grīdas atjaunošana",
  "Žāvēšana",
  "Cits",
];

function prettyDate(d = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(
    d.getHours()
  )}-${pad(d.getMinutes())}`;
}

// LocalStorage helpers (simple "profile" save)
const STORAGE_KEY = "tames_profils_saglabatie"; // array of {id, filename, createdAtISO, estimator, base64}
function loadSaved() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
function saveEntry(entry) {
  const all = loadSaved();
  all.unshift(entry);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export default function DamageIntakeForm() {
  // Wizard step (1..12)
  const [step, setStep] = useState(1);

  // Profile (optional metadata for the Excel header)
  const [estimatorName, setEstimatorName] = useState("");
  const [estimatorEmail, setEstimatorEmail] = useState("");

  // Core fields
  const [address, setAddress] = useState(""); // 1
  const [insurer, setInsurer] = useState(""); // 2
  const [locationType, setLocationType] = useState(""); // 3
  const [dwellingSubtype, setDwellingSubtype] = useState(""); // 3.1
  const [dwellingOther, setDwellingOther] = useState(""); // 3.1.1

  const [incidentType, setIncidentType] = useState(""); // 4
  const [incidentOther, setIncidentOther] = useState(""); // 4.1

  const [electricity, setElectricity] = useState("Nē"); // 5 (Ir/Nav UI, bet saglabājam Jā/Nē semantiku)
  const [needsDrying, setNeedsDrying] = useState("Nē"); // 6
  const [commonPropertyDamaged, setCommonPropertyDamaged] = useState("Nē"); // 7

  const [lossKnown, setLossKnown] = useState("Nē"); // 8
  const [lossAmount, setLossAmount] = useState(""); // 8.1

  // Rooms (9-11)
  const [rooms, setRooms] = useState(
    ROOM_TYPES.reduce((acc, r) => {
      acc[r] = { checked: false, count: 1, custom: "" };
      return acc;
    }, /** @type {Record<string,{checked:boolean,count:number,custom:string}>} */ ({}))
  );

  // For visible list of selected room instances
  // structure: { id, type, index, areas: string[], note?: string }
  const [roomInstances, setRoomInstances] = useState([]);

  // Per-room actions: { [roomId]: Array<{action:string, quantity:string, unit:string}> }
  const [roomActions, setRoomActions] = useState({});

  // Which room is currently being edited (for step 11)
  const [editingRoomId, setEditingRoomId] = useState(null);

  // Saved estimates (local profile)
  const [saved, setSaved] = useState([]);
  useEffect(() => setSaved(loadSaved()), []);

  // Build room instances when rooms selection changes
  useEffect(() => {
    const instances = [];
    Object.entries(rooms).forEach(([type, meta]) => {
      if (meta.checked) {
        const cnt = Math.max(1, Number(meta.count) || 1);
        for (let i = 1; i <= cnt; i++) {
          const id = `${type}-${i}`;
          // Preserve existing areas/notes if exist
          const existing = roomInstances.find((r) => r.id === id);
          instances.push({
            id,
            type: type === "Cits" ? meta.custom || "Cits" : type,
            index: i,
            areas: existing?.areas || [],
            note: existing?.note || "",
          });
        }
      }
    });
    setRoomInstances(instances);
    // Clean up roomActions for removed rooms
    setRoomActions((prev) => {
      const next = {};
      instances.forEach((ri) => (next[ri.id] = prev[ri.id] || [{ action: "", quantity: "", unit: "m2" }]));
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rooms]);

  // Actions helpers for a specific room
  function addActionRow(roomId) {
    setRoomActions((ra) => ({ ...ra, [roomId]: [...(ra[roomId] || []), { action: "", quantity: "", unit: "m2" }] }));
  }
  function removeActionRow(roomId, idx) {
    setRoomActions((ra) => {
      const list = ra[roomId] || [];
      if (list.length <= 1) return ra; // keep at least one
      return { ...ra, [roomId]: list.filter((_, i) => i !== idx) };
    });
  }
  function setActionField(roomId, idx, key, value) {
    setRoomActions((ra) => {
      const list = [...(ra[roomId] || [{ action: "", quantity: "", unit: "m2" }])];
      list[idx] = { ...list[idx], [key]: value };
      return { ...ra, [roomId]: list };
    });
  }

  function toggleArea(roomId, area) {
    setRoomInstances((arr) =>
      arr.map((ri) =>
        ri.id === roomId
          ? {
              ...ri,
              areas: ri.areas.includes(area)
                ? ri.areas.filter((a) => a !== area)
                : [...ri.areas, area],
            }
          : ri
      )
    );
  }
  function setRoomNote(roomId, note) {
    setRoomInstances((arr) => arr.map((ri) => (ri.id === roomId ? { ...ri, note } : ri)));
  }

  // Validation per step
  const stepValid = useMemo(() => {
    switch (step) {
      case 1: return !!address.trim();
      case 2: return !!insurer;
      case 3: return !!locationType && (locationType !== "Dzīvojamā ēka" || !!dwellingSubtype);
      case 4: return !!incidentType && (incidentType !== "Cits" || !!incidentOther.trim());
      case 5: return ["Jā", "Nē"].includes(electricity);
      case 6: return ["Jā", "Nē"].includes(needsDrying);
      case 7: return ["Jā", "Nē"].includes(commonPropertyDamaged);
      case 8: return lossKnown === "Nē" || (lossKnown === "Jā" && !!lossAmount && Number(lossAmount) >= 0);
      case 9: return Object.values(rooms).some((r) => r.checked);
      case 10: return true; // list view of rooms — navigation handled in-UI
      case 11: return true; // per-room editor handles its own save
      case 12: return true;
      default: return true;
    }
  }, [step, address, insurer, locationType, dwellingSubtype, incidentType, incidentOther, electricity, needsDrying, commonPropertyDamaged, lossKnown, lossAmount, rooms]);

  const totalSteps = 12;
  const next = () => setStep((s) => Math.min(totalSteps, s + 1));
  const back = () => {
    if (step === 11) {
      // going back from per-room editor returns to room list
      setEditingRoomId(null);
      setStep(10);
    } else {
      setStep((s) => Math.max(1, s - 1));
    }
  };

  // Completion checks
  const roomHasPositions = (roomId) => (roomActions[roomId] || []).some((r) => r.action && r.quantity);
  const allRoomsCompleted = roomInstances.length > 0 && roomInstances.every((ri) => roomHasPositions(ri.id));

  // ===== Excel export =====
  function exportToExcel() {
    const summary = [
      ["Tāmētājs", estimatorName],
      ["E-pasts", estimatorEmail],
      ["Datums", new Date().toLocaleString()],
      ["Objekta adrese", address],
      ["Apdrošināšanas kompānija", insurer],
      ["Kur notika negadījums?", locationType],
      [
        "Dzīvojamās ēkas tips",
        locationType === "Dzīvojamā ēka"
          ? dwellingSubtype === "Cits"
            ? `Cits: ${dwellingOther}`
            : dwellingSubtype
          : "—",
      ],
      [
        "Kas notika ar nekustamo īpašumu?",
        incidentType === "Cits" ? `Cits: ${incidentOther}` : incidentType,
      ],
      ["Elektrības traucējumi", electricity === "Jā" ? "Ir" : "Nav"],
      ["Vai nepieciešama žāvēšana?", needsDrying],
      ["Vai bojāts kopīpašums?", commonPropertyDamaged],
      ["Zaudējuma novērtējums pēc klienta vārdiem", lossKnown === "Jā" ? `${lossAmount} EUR` : "Nav"],
    ];

    const roomsSheet = [
      ["#", "Telpa", "Bojātās vietas", "Piezīmes"],
      ...roomInstances.map((ri, idx) => [
        idx + 1,
        `${ri.type} ${ri.index}`,
        ri.areas.join(", ") || "—",
        ri.note || "",
      ]),
    ];

    const actionsByRoomSheet = [
      ["Telpa", "Pozīcija", "Daudzums", "Mērvienība"],
      ...roomInstances.flatMap((ri) =>
        (roomActions[ri.id] || [])
          .filter((a) => a.action && a.quantity)
          .map((a) => [
            `${ri.type} ${ri.index}`,
            a.action,
            a.quantity,
            a.unit || "m2",
          ])
      ),
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), "Pieteikums");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(roomsSheet), "Telpas");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(actionsByRoomSheet), "Darbi pa telpām");

    const wbout = XLSX.write(wb, { type: "base64", bookType: "xlsx" });
    const filename = `tame_${(estimatorName || "tametajs").replaceAll(/[^a-zA-Z0-9_\-]/g, "_")}_${prettyDate()}.xlsx`;

    const link = document.createElement("a");
    link.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${wbout}`;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    const entry = { id: crypto.randomUUID(), filename, createdAtISO: new Date().toISOString(), estimator: estimatorName || "Nezināms", base64: wbout };
    saveEntry(entry);
    setSaved(loadSaved());
  }

  // ===== UI helpers =====
  function LabeledRow({ label, children }) {
    return (
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>{label}</div>
        <div>{children}</div>
      </div>
    );
  }

  function StepShell({ title, children }) {
    return (
      <div style={{ background: "white", padding: 16, borderRadius: 12, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>{title}</div>
        {children}
      </div>
    );
  }

  const progressPct = Math.round(((step - 1) / (totalSteps - 1)) * 100);

  return (
    <div style={{ minHeight: "100vh", background: "#f7fafc", color: "#111827" }}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: 16 }}>
        <header style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>Apskates forma – solis {step}/{totalSteps}</div>
            <div style={{ fontSize: 13, color: "#4b5563" }}>Aizpildi laukus secīgi no 1 līdz 12. Kad 10. solī visas telpas ir aizpildītas, varēsi ģenerēt tāmi.</div>
          </div>
          <div style={{ background: "white", padding: 12, borderRadius: 12, width: 320 }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Tāmētāja profils (neobligāti)</div>
            <input style={{ width: "100%", border: "1px solid #e5e7eb", borderRadius: 10, padding: 8, marginBottom: 6 }} placeholder="Vārds, Uzvārds" value={estimatorName} onChange={(e) => setEstimatorName(e.target.value)} />
            <input style={{ width: "100%", border: "1px solid #e5e7eb", borderRadius: 10, padding: 8 }} placeholder="E-pasts" value={estimatorEmail} onChange={(e) => setEstimatorEmail(e.target.value)} />
          </div>
        </header>

        {/* Progress bar */}
        <div style={{ height: 8, background: "#e5e7eb", borderRadius: 999, marginBottom: 16 }}>
          <div style={{ width: `${progressPct}%`, height: 8, background: "#10b981", borderRadius: 999 }} />
        </div>

        {/* Steps 1..9 same as before */}
        {step === 1 && (
          <StepShell title="1. Objekta adrese">
            <LabeledRow label="Objekta adrese">
              <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Iela 1, Pilsēta" style={{ width: "100%", border: "1px solid #e5e7eb", borderRadius: 10, padding: 8 }} />
            </LabeledRow>
          </StepShell>
        )}

        {step === 2 && (
          <StepShell title="2. Apdrošināšanas kompānija">
            <LabeledRow label="Izvēlies kompāniju">
              <select value={insurer} onChange={(e) => setInsurer(e.target.value)} style={{ width: "100%", border: "1px solid #e5e7eb", borderRadius: 10, padding: 8, background: "white" }}>
                <option value="">— Izvēlies —</option>
                {INSURERS.map((i) => (
                  <option key={i} value={i}>{i}</option>
                ))}
              </select>
            </LabeledRow>
          </StepShell>
        )}

        {step === 3 && (
          <StepShell title="3. Kur notika negadījums?">
            <LabeledRow label="Vieta">
              <select value={locationType} onChange={(e) => setLocationType(e.target.value)} style={{ width: "100%", border: "1px solid #e5e7eb", borderRadius: 10, padding: 8, background: "white" }}>
                <option value="">— Izvēlies —</option>
                {LOCATION_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </LabeledRow>
            {locationType === "Dzīvojamā ēka" && (
              <>
                <LabeledRow label="3.1. Dzīvojamās ēkas tips">
                  <select value={dwellingSubtype} onChange={(e) => setDwellingSubtype(e.target.value)} style={{ width: "100%", border: "1px solid #e5e7eb", borderRadius: 10, padding: 8, background: "white" }}>
                    <option value="">— Izvēlies —</option>
                    {DWELLING_SUBTYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </LabeledRow>
                {dwellingSubtype === "Cits" && (
                  <LabeledRow label="3.1.1. Norādi">
                    <input value={dwellingOther} onChange={(e) => setDwellingOther(e.target.value)} placeholder="NI tips" style={{ width: "100%", border: "1px solid #e5e7eb", borderRadius: 10, padding: 8 }} />
                  </LabeledRow>
                )}
              </>
            )}
          </StepShell>
        )}

        {step === 4 && (
          <StepShell title="4. Kas notika ar nekustamo īpašumu?">
            <LabeledRow label="Notikuma veids">
              <select value={incidentType} onChange={(e) => setIncidentType(e.target.value)} style={{ width: "100%", border: "1px solid #e5e7eb", borderRadius: 10, padding: 8, background: "white" }}>
                <option value="">— Izvēlies —</option>
                {INCIDENT_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </LabeledRow>
            {incidentType === "Cits" && (
              <LabeledRow label="4.1. Norādi">
                <input value={incidentOther} onChange={(e) => setIncidentOther(e.target.value)} placeholder="Notikuma apraksts" style={{ width: "100%", border: "1px solid #e5e7eb", borderRadius: 10, padding: 8 }} />
              </LabeledRow>
            )}
          </StepShell>
        )}

        {step === 5 && (
          <StepShell title="5. Elektrības traucējumi">
            <LabeledRow label="Elektrības traucējumi">
              <label style={{ display: "inline-flex", alignItems: "center", gap: 8, marginRight: 16 }}>
                <input type="radio" name="el" checked={electricity === "Jā"} onChange={() => setElectricity("Jā")} /> Ir
              </label>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <input type="radio" name="el" checked={electricity === "Nē"} onChange={() => setElectricity("Nē")} /> Nav
              </label>
            </LabeledRow>
          </StepShell>
        )}

        {step === 6 && (
          <StepShell title="6. Vai nepieciešama žāvēšana?">
            <LabeledRow label="Žāvēšana">
              {YES_NO.map((yn) => (
                <label key={yn} style={{ display: "inline-flex", alignItems: "center", gap: 8, marginRight: 16 }}>
                  <input type="radio" name="dry" checked={needsDrying === yn} onChange={() => setNeedsDrying(yn)} /> {yn}
                </label>
              ))}
            </LabeledRow>
          </StepShell>
        )}

        {step === 7 && (
          <StepShell title="7. Vai bojāts kopīpašums?">
            <LabeledRow label="Kopīpašums">
              {YES_NO.map((yn) => (
                <label key={yn} style={{ display: "inline-flex", alignItems: "center", gap: 8, marginRight: 16 }}>
                  <input type="radio" name="common" checked={commonPropertyDamaged === yn} onChange={() => setCommonPropertyDamaged(yn)} /> {yn}
                </label>
              ))}
            </LabeledRow>
          </StepShell>
        )}

        {step === 8 && (
          <StepShell title="8. Zaudējuma novērtējums pēc klienta vārdiem">
            <LabeledRow label="Vai ir zināma summa?">
              {YES_NO.map((yn) => (
                <label key={yn} style={{ display: "inline-flex", alignItems: "center", gap: 8, marginRight: 16 }}>
                  <input type="radio" name="loss" checked={lossKnown === yn} onChange={() => setLossKnown(yn)} /> {yn}
                </label>
              ))}
            </LabeledRow>
            {lossKnown === "Jā" && (
              <LabeledRow label="Summa EUR">
                <input type="number" min={0} value={lossAmount} onChange={(e) => setLossAmount(e.target.value)} placeholder="€ summa" style={{ width: 200, border: "1px solid #e5e7eb", borderRadius: 10, padding: 8 }} />
              </LabeledRow>
            )}
          </StepShell>
        )}

        {step === 9 && (
          <StepShell title="9. Izvēlies telpu/as, kas tika bojātas">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 12 }}>
              {ROOM_TYPES.map((rt) => (
                <div key={rt} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 }}>
                  <label style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
                    <input type="checkbox" checked={rooms[rt].checked} onChange={(e) => setRooms({ ...rooms, [rt]: { ...rooms[rt], checked: e.target.checked } })} />
                    {rt}
                  </label>
                  {rooms[rt].checked && (
                    <div style={{ marginTop: 8 }}>
                      {rt === "Cits" && (
                        <input placeholder="Telpas nosaukums" value={rooms[rt].custom} onChange={(e) => setRooms({ ...rooms, [rt]: { ...rooms[rt], custom: e.target.value } })} style={{ width: "100%", border: "1px solid #e5e7eb", borderRadius: 10, padding: 8, marginBottom: 8 }} />
                      )}
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span>Daudzums:</span>
                        <input type="number" min={1} value={rooms[rt].count} onChange={(e) => setRooms({ ...rooms, [rt]: { ...rooms[rt], count: Number(e.target.value || 1) } })} style={{ width: 90, border: "1px solid #e5e7eb", borderRadius: 10, padding: 6 }} />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </StepShell>
        )}

        {step === 10 && (
          <StepShell title="10. Izvēlētās telpas">
            {roomInstances.length === 0 ? (
              <div style={{ color: "#6b7280" }}>Nav izvēlētas telpas 9. solī.</div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 12 }}>
                {roomInstances.map((ri) => {
                  const completed = roomHasPositions(ri.id);
                  const areasCount = ri.areas.length;
                  return (
                    <div key={ri.id} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#f9fafb" }}>
                      <div style={{ fontWeight: 700, marginBottom: 6 }}>{ri.type} {ri.index}</div>
                      <div style={{ fontSize: 13, color: "#4b5563", marginBottom: 8 }}>
                        Bojātās vietas: {areasCount > 0 ? areasCount : "—"}
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <button type="button" onClick={() => { setEditingRoomId(ri.id); setStep(11); }} style={{ padding: "8px 12px", borderRadius: 10, background: "#111827", color: "white", border: 0 }}>Atvērt</button>
                        {completed && <span style={{ fontSize: 12, color: "#059669", fontWeight: 700 }}>Saglabāts</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {allRoomsCompleted && (
              <div style={{ marginTop: 16, textAlign: "right" }}>
                <button type="button" onClick={exportToExcel} style={{ padding: "12px 16px", borderRadius: 12, background: "#059669", color: "white", border: 0 }}>Viss pabeigts — izveidot tāmi</button>
              </div>
            )}
          </StepShell>
        )}

        {step === 11 && editingRoomId && (
          <StepShell title={`11. Pozīcijas un apjomi – ${roomInstances.find(r=>r.id===editingRoomId)?.type} ${roomInstances.find(r=>r.id===editingRoomId)?.index}`}>
            {/* Areas (was step 10 in spec) */}
            <LabeledRow label="Bojātās vietas šajā telpā">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {AREA_OPTIONS.map((a) => (
                  <label key={a} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <input type="checkbox" checked={roomInstances.find(r=>r.id===editingRoomId)?.areas.includes(a) || false} onChange={() => toggleArea(editingRoomId, a)} /> {a}
                  </label>
                ))}
              </div>
            </LabeledRow>
            <LabeledRow label="Piezīmes">
              <input value={roomInstances.find(r=>r.id===editingRoomId)?.note || ''} onChange={(e) => setRoomNote(editingRoomId, e.target.value)} placeholder="Papildus informācija" style={{ width: "100%", border: "1px solid #e5e7eb", borderRadius: 10, padding: 8 }} />
            </LabeledRow>

            {/* Positions for this room */}
            <div style={{ fontWeight: 700, margin: "12px 0 6px" }}>Pozīcijas un apjomi</div>
            {(roomActions[editingRoomId] || [{ action: "", quantity: "", unit: "m2" }]).map((row, idx) => (
              <div key={idx} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 110px auto", gap: 8, alignItems: "end", marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 13, marginBottom: 4 }}>Pozīcija</div>
                  <select value={row.action} onChange={(e) => setActionField(editingRoomId, idx, 'action', e.target.value)} style={{ width: "100%", border: "1px solid #e5e7eb", borderRadius: 10, padding: 8, background: "white" }}>
                    <option value="">— Izvēlies —</option>
                    {ACTION_OPTIONS.map((a) => (
                      <option key={a} value={a}>{a}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 13, marginBottom: 4 }}>Daudzums</div>
                  <input type="number" min={0} step="0.01" value={row.quantity} onChange={(e) => setActionField(editingRoomId, idx, 'quantity', e.target.value)} style={{ width: "100%", border: "1px solid #e5e7eb", borderRadius: 10, padding: 8 }} placeholder="m2" />
                </div>
                <div>
                  <div style={{ fontSize: 13, marginBottom: 4 }}>Mērv.</div>
                  <input value={row.unit} onChange={(e) => setActionField(editingRoomId, idx, 'unit', e.target.value)} style={{ width: "100%", border: "1px solid #e5e7eb", borderRadius: 10, padding: 8 }} />
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" onClick={() => addActionRow(editingRoomId)} style={{ padding: "8px 12px", borderRadius: 10, background: "#111827", color: "white", border: 0 }}>+ Pievienot</button>
                  <button type="button" onClick={() => removeActionRow(editingRoomId, idx)} style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #e5e7eb", background: "white" }}>Dzēst</button>
                </div>
              </div>
            ))}

            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12 }}>
              <button type="button" onClick={back} style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #e5e7eb", background: "white", color: "#111827" }}>← Atpakaļ uz telpu sarakstu</button>
              <button type="button" onClick={() => { setEditingRoomId(null); setStep(10); }} style={{ padding: "10px 14px", borderRadius: 10, background: "#111827", color: "white", border: 0 }}>Saglabāt un atgriezties</button>
            </div>
          </StepShell>
        )}

        {/* Navigation bar (hide default Next on steps 10 & 11) */}
        {[1,2,3,4,5,6,7,8,9,12].includes(step) && (
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16 }}>
            <button type="button" onClick={() => setStep((s) => Math.max(1, s - 1))} disabled={step === 1} style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #e5e7eb", background: step === 1 ? "#f3f4f6" : "white", color: "#111827" }}>← Atpakaļ</button>
            <button type="button" onClick={() => setStep((s) => Math.min(totalSteps, s + 1))} disabled={!stepValid || step === totalSteps} style={{ padding: "10px 14px", borderRadius: 10, background: !stepValid || step === totalSteps ? "#9ca3af" : "#111827", color: "white", border: 0 }}>{step === totalSteps ? "Beigas" : "Tālāk →"}</button>
          </div>
        )}

        {/* Saved estimates */}
        <div style={{ background: "white", padding: 16, borderRadius: 12, marginTop: 20 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Saglabātās tāmēs (šajā pārlūkā)</div>
          {saved.length === 0 ? (
            <div style={{ color: "#6b7280" }}>Vēl nav saglabātu tāmju.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", fontSize: 14 }}>
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb" }}>
                    <th style={{ padding: "8px 12px" }}>Fails</th>
                    <th style={{ padding: "8px 12px" }}>Tāmētājs</th>
                    <th style={{ padding: "8px 12px" }}>Datums</th>
                  </tr>
                </thead>
                <tbody>
                  {saved.map((e) => (
                    <tr key={e.id} style={{ borderBottom: "1px solid #e5e7eb" }}>
                      <td style={{ padding: "8px 12px", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace" }}>{e.filename}</td>
                      <td style={{ padding: "8px 12px" }}>{e.estimator}</td>
                      <td style={{ padding: "8px 12px" }}>{new Date(e.createdAtISO).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <footer style={{ paddingBottom: 40, marginTop: 12, fontSize: 12, color: "#6b7280" }}>
          Piezīme: šī versija glabā tāmju failus lokāli (LocalStorage). Servera glabāšanai pievieno Supabase Storage un saglabā base64 saturu bucketā.
        </footer>
      </div>
    </div>
  );
}
