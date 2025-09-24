import React, { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";

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

export default function DamageIntakeApp() {
  // Profile
  const [estimatorName, setEstimatorName] = useState("");
  const [estimatorEmail, setEstimatorEmail] = useState("");

  // Core fields
  const [address, setAddress] = useState("");
  const [insurer, setInsurer] = useState("");
  const [locationType, setLocationType] = useState("");
  const [dwellingSubtype, setDwellingSubtype] = useState("");
  const [dwellingOther, setDwellingOther] = useState("");

  const [incidentType, setIncidentType] = useState("");
  const [incidentOther, setIncidentOther] = useState("");

  const [electricity, setElectricity] = useState("Nē"); // Ir/Nav -> use Jā/Nē UI but store Ir/Nav? Spec uses Ir/Nav; we'll keep Jā/Nē UI text for consistency elsewhere
  const [needsDrying, setNeedsDrying] = useState("Nē");
  const [commonPropertyDamaged, setCommonPropertyDamaged] = useState("Nē");

  const [lossKnown, setLossKnown] = useState("Nē");
  const [lossAmount, setLossAmount] = useState("");

  // Rooms: {type, count, customName?}
  const [rooms, setRooms] = useState(
    ROOM_TYPES.reduce((acc, r) => {
      acc[r] = { checked: false, count: 1, custom: "" };
      return acc;
    }, /** @type {Record<string,{checked:boolean,count:number,custom:string}>} */ ({}))
  );

  // For each concrete room instance we keep damaged areas
  // structure: { id, type, index, areas: string[], note?: string }
  const [roomInstances, setRoomInstances] = useState([]);

  // Actions list: array of {action, quantity, unit}
  const [actions, setActions] = useState([{ action: "", quantity: "", unit: "m2" }]);

  const [saved, setSaved] = useState([]);

  useEffect(() => {
    setSaved(loadSaved());
  }, []);

  // Recompute room instances when rooms selection changes
  useEffect(() => {
    const instances = [];
    Object.entries(rooms).forEach(([type, meta]) => {
      if (meta.checked) {
        const cnt = Math.max(1, Number(meta.count) || 1);
        for (let i = 1; i <= cnt; i++) {
          instances.push({
            id: `${type}-${i}`,
            type: type === "Cits" ? meta.custom || "Cits" : type,
            index: i,
            areas: [],
            note: "",
          });
        }
      }
    });
    setRoomInstances(instances);
  }, [rooms]);

  // Add / remove action rows
  const addActionRow = () => setActions((a) => [...a, { action: "", quantity: "", unit: "m2" }]);
  const removeActionRow = (idx) =>
    setActions((a) => (a.length === 1 ? a : a.filter((_, i) => i !== idx)));

  const valid = useMemo(() => {
    if (!address || !insurer || !locationType) return false;
    if (locationType === "Dzīvojamā ēka" && !dwellingSubtype) return false;
    if (dwellingSubtype === "Cits" && !dwellingOther.trim()) return false;
    if (!incidentType) return false;
    if (incidentType === "Cits" && !incidentOther.trim()) return false;
    return true;
  }, [address, insurer, locationType, dwellingSubtype, dwellingOther, incidentType, incidentOther]);

  function handleInstanceAreaToggle(id, area) {
    setRoomInstances((arr) =>
      arr.map((ri) =>
        ri.id === id
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

  function setInstanceNote(id, note) {
    setRoomInstances((arr) => arr.map((ri) => (ri.id === id ? { ...ri, note } : ri)));
  }

  // Excel export
  function exportToExcel() {
    // Build sheets
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
      ["Elektrības traucējumi", electricity],
      ["Nepieciešama žāvēšana", needsDrying],
      ["Bojāts kopīpašums", commonPropertyDamaged],
      [
        "Zaudējuma novērtējums pēc klienta vārdiem",
        lossKnown === "Jā" ? `${lossAmount} EUR` : "Nav"
      ],
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

    const actionsSheet = [
      ["#", "Pozīcija", "Daudzums", "Mērvienība"],
      ...actions
        .filter((a) => a.action && a.quantity)
        .map((a, idx) => [idx + 1, a.action, a.quantity, a.unit || "m2"]),
    ];

    const wb = XLSX.utils.book_new();
    const wsSummary = XLSX.utils.aoa_to_sheet(summary);
    const wsRooms = XLSX.utils.aoa_to_sheet(roomsSheet);
    const wsActions = XLSX.utils.aoa_to_sheet(actionsSheet);

    XLSX.utils.book_append_sheet(wb, wsSummary, "Pieteikums");
    XLSX.utils.book_append_sheet(wb, wsRooms, "Telpas");
    XLSX.utils.book_append_sheet(wb, wsActions, "Darbi");

    // Create binary and base64
    const wbout = XLSX.write(wb, { type: "base64", bookType: "xlsx" });
    const filename = `tame_${(estimatorName || "tametajs").replaceAll(
      /[^a-zA-Z0-9_\-]/g,
      "_"
    )}_${prettyDate()}.xlsx`;

    // Trigger download
    const link = document.createElement("a");
    link.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${wbout}`;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Save to local profile (so estimator sees their generated tāmēs later)
    const entry = {
      id: crypto.randomUUID(),
      filename,
      createdAtISO: new Date().toISOString(),
      estimator: estimatorName || "Nezināms",
      base64: wbout,
    };
    saveEntry(entry);
    setSaved(loadSaved());
  }

  function downloadSaved(id) {
    const entry = saved.find((e) => e.id === id);
    if (!entry) return;
    const link = document.createElement("a");
    link.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${entry.base64}`;
    link.download = entry.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function resetForm() {
    setAddress("");
    setInsurer("");
    setLocationType("");
    setDwellingSubtype("");
    setDwellingOther("");
    setIncidentType("");
    setIncidentOther("");
    setElectricity("Nē");
    setNeedsDrying("Nē");
    setCommonPropertyDamaged("Nē");
    setLossKnown("Nē");
    setLossAmount("");
    setRooms(
      ROOM_TYPES.reduce((acc, r) => {
        acc[r] = { checked: false, count: 1, custom: "" };
        return acc;
      }, {})
    );
    setActions([{ action: "", quantity: "", unit: "m2" }]);
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="max-w-5xl mx-auto p-6 space-y-8">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Apskates forma – Tāmēšana</h1>
            <p className="text-sm text-gray-600">
              Aizpildi laukus. Nospiežot <span className="font-semibold">Pabeigt apskati</span>, tiks
              ģenerēta Excel tāme un saglabāta jūsu profilā šajā pārlūkā.
            </p>
          </div>
          <div className="bg-white p-4 rounded-2xl shadow-sm w-full max-w-sm">
            <h2 className="font-semibold mb-2">Tāmētāja profils</h2>
            <div className="space-y-2">
              <input
                className="w-full border rounded-xl px-3 py-2"
                placeholder="Vārds, Uzvārds"
                value={estimatorName}
                onChange={(e) => setEstimatorName(e.target.value)}
              />
              <input
                className="w-full border rounded-xl px-3 py-2"
                placeholder="E-pasts"
                value={estimatorEmail}
                onChange={(e) => setEstimatorEmail(e.target.value)}
              />
            </div>
          </div>
        </header>

        {/* Core form */}
        <section className="bg-white p-5 rounded-2xl shadow-sm space-y-4">
          <h2 className="text-lg font-semibold">1–8. Pamatinformācija</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm mb-1">1. Objekta adrese</label>
              <input
                className="w-full border rounded-xl px-3 py-2"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Iela 1, Pilsēta"
              />
            </div>

            <div>
              <label className="block text-sm mb-1">2. Apdrošināšanas kompānija</label>
              <select
                className="w-full border rounded-xl px-3 py-2 bg-white"
                value={insurer}
                onChange={(e) => setInsurer(e.target.value)}
              >
                <option value="">— Izvēlies —</option>
                {INSURERS.map((i) => (
                  <option key={i} value={i}>
                    {i}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm mb-1">3. Kur notika negadījums?</label>
              <select
                className="w-full border rounded-xl px-3 py-2 bg-white"
                value={locationType}
                onChange={(e) => setLocationType(e.target.value)}
              >
                <option value="">— Izvēlies —</option>
                {LOCATION_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            {locationType === "Dzīvojamā ēka" && (
              <>
                <div>
                  <label className="block text-sm mb-1">3.1. Dzīvojamās ēkas tips</label>
                  <select
                    className="w-full border rounded-xl px-3 py-2 bg-white"
                    value={dwellingSubtype}
                    onChange={(e) => setDwellingSubtype(e.target.value)}
                  >
                    <option value="">— Izvēlies —</option>
                    {DWELLING_SUBTYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                {dwellingSubtype === "Cits" && (
                  <div>
                    <label className="block text-sm mb-1">3.1.1. Norādi</label>
                    <input
                      className="w-full border rounded-xl px-3 py-2"
                      value={dwellingOther}
                      onChange={(e) => setDwellingOther(e.target.value)}
                      placeholder="NI tips"
                    />
                  </div>
                )}
              </>
            )}

            <div>
              <label className="block text-sm mb-1">4. Kas notika ar nekustamo īpašumu?</label>
              <select
                className="w-full border rounded-xl px-3 py-2 bg-white"
                value={incidentType}
                onChange={(e) => setIncidentType(e.target.value)}
              >
                <option value="">— Izvēlies —</option>
                {INCIDENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            {incidentType === "Cits" && (
              <div>
                <label className="block text-sm mb-1">4.1. Norādi</label>
                <input
                  className="w-full border rounded-xl px-3 py-2"
                  value={incidentOther}
                  onChange={(e) => setIncidentOther(e.target.value)}
                  placeholder="Notikuma apraksts"
                />
              </div>
            )}

            <div>
              <label className="block text-sm mb-1">5. Elektrības traucējumi</label>
              <div className="flex gap-4">
                {YES_NO.map((yn) => (
                  <label key={yn} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="electricity"
                      checked={electricity === yn}
                      onChange={() => setElectricity(yn)}
                    />
                    {yn === "Jā" ? "Ir" : "Nav"}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm mb-1">6. Vai nepieciešama žāvēšana?</label>
              <div className="flex gap-4">
                {YES_NO.map((yn) => (
                  <label key={yn} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="drying"
                      checked={needsDrying === yn}
                      onChange={() => setNeedsDrying(yn)}
                    />
                    {yn}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm mb-1">7. Vai bojāts kopīpašums?</label>
              <div className="flex gap-4">
                {YES_NO.map((yn) => (
                  <label key={yn} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="common"
                      checked={commonPropertyDamaged === yn}
                      onChange={() => setCommonPropertyDamaged(yn)}
                    />
                    {yn}
                  </label>
                ))}
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm mb-1">
                8. Zaudējuma novērtējums pēc klienta vārdiem
              </label>
              <div className="flex items-center gap-4">
                {YES_NO.map((yn) => (
                  <label key={yn} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="loss"
                      checked={lossKnown === yn}
                      onChange={() => setLossKnown(yn)}
                    />
                    {yn}
                  </label>
                ))}
                {lossKnown === "Jā" && (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      className="border rounded-xl px-3 py-2 w-40"
                      value={lossAmount}
                      onChange={(e) => setLossAmount(e.target.value)}
                      placeholder="€ summa"
                      min={0}
                    />
                    <span>EUR</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Rooms */}
        <section className="bg-white p-5 rounded-2xl shadow-sm space-y-4">
          <h2 className="text-lg font-semibold">9–10. Telpas un bojātās vietas</h2>
          <div className="grid md:grid-cols-2 gap-4">
            {ROOM_TYPES.map((rt) => (
              <div key={rt} className="border rounded-2xl p-4">
                <label className="flex items-center gap-2 font-medium">
                  <input
                    type="checkbox"
                    checked={rooms[rt].checked}
                    onChange={(e) =>
                      setRooms({
                        ...rooms,
                        [rt]: { ...rooms[rt], checked: e.target.checked },
                      })
                    }
                  />
                  {rt}
                </label>
                {rooms[rt].checked && (
                  <div className="mt-3 space-y-2">
                    {rt === "Cits" && (
                      <input
                        className="w-full border rounded-xl px-3 py-2"
                        placeholder="Telpas nosaukums"
                        value={rooms[rt].custom}
                        onChange={(e) =>
                          setRooms({
                            ...rooms,
                            [rt]: { ...rooms[rt], custom: e.target.value },
                          })
                        }
                      />
                    )}
                    <div className="flex items-center gap-2">
                      <span>Daudzums:</span>
                      <input
                        type="number"
                        min={1}
                        className="border rounded-xl px-3 py-1 w-24"
                        value={rooms[rt].count}
                        onChange={(e) =>
                          setRooms({
                            ...rooms,
                            [rt]: { ...rooms[rt], count: Number(e.target.value || 1) },
                          })
                        }
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {roomInstances.length > 0 && (
            <div className="mt-4">
              <h3 className="font-semibold mb-2">10. Vietas katrā telpā, kas tika bojātas</h3>
              <div className="grid md:grid-cols-2 gap-4">
                {roomInstances.map((ri) => (
                  <div key={ri.id} className="border rounded-2xl p-4 bg-gray-50">
                    <div className="font-medium mb-2">
                      {ri.type} {ri.index}
                    </div>
                    <div className="flex flex-wrap gap-3 mb-2">
                      {AREA_OPTIONS.map((a) => (
                        <label key={a} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={ri.areas.includes(a)}
                            onChange={() => handleInstanceAreaToggle(ri.id, a)}
                          />
                          {a}
                        </label>
                      ))}
                    </div>
                    <input
                      className="w-full border rounded-xl px-3 py-2"
                      placeholder="Piezīmes (papildus informācija)"
                      value={ri.note}
                      onChange={(e) => setInstanceNote(ri.id, e.target.value)}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Actions */}
        <section className="bg-white p-5 rounded-2xl shadow-sm space-y-4">
          <h2 className="text-lg font-semibold">11. Pozīcijas un apjomi</h2>
          <div className="space-y-3">
            {actions.map((row, idx) => (
              <div key={idx} className="grid md:grid-cols-[2fr,1fr,100px,auto] gap-3 items-end">
                <div>
                  <label className="block text-sm mb-1">Pozīcija</label>
                  <select
                    className="w-full border rounded-xl px-3 py-2 bg-white"
                    value={row.action}
                    onChange={(e) =>
                      setActions((a) =>
                        a.map((r, i) => (i === idx ? { ...r, action: e.target.value } : r))
                      )
                    }
                  >
                    <option value="">— Izvēlies —</option>
                    {ACTION_OPTIONS.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm mb-1">Daudzums</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    className="w-full border rounded-xl px-3 py-2"
                    value={row.quantity}
                    onChange={(e) =>
                      setActions((a) =>
                        a.map((r, i) => (i === idx ? { ...r, quantity: e.target.value } : r))
                      )
                    }
                    placeholder="m2"
                  />
                </div>
                <div>
                  <label className="block text-sm mb-1">Mērv.</label>
                  <input
                    className="w-full border rounded-xl px-3 py-2"
                    value={row.unit}
                    onChange={(e) =>
                      setActions((a) =>
                        a.map((r, i) => (i === idx ? { ...r, unit: e.target.value } : r))
                      )
                    }
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={addActionRow}
                    className="px-3 py-2 rounded-xl bg-gray-900 text-white"
                  >
                    + Pievienot
                  </button>
                  <button
                    type="button"
                    onClick={() => removeActionRow(idx)}
                    className="px-3 py-2 rounded-xl border"
                  >
                    Dzēst
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Footer actions */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={!valid}
            onClick={exportToExcel}
            className={`px-5 py-3 rounded-2xl text-white ${
              valid ? "bg-emerald-600 hover:bg-emerald-700" : "bg-gray-400"
            }`}
            title={valid ? "" : "Aizpildi obligātos laukus"}
          >
            12. Pabeigt apskati — ģenerēt Excel tāmi
          </button>
          <button
            type="button"
            onClick={resetForm}
            className="px-5 py-3 rounded-2xl border"
          >
            Notīrīt formu
          </button>
        </div>

        {/* Saved estimates */}
        <section className="bg-white p-5 rounded-2xl shadow-sm space-y-3">
          <h2 className="text-lg font-semibold">Saglabātās tāmēs (šajā pārlūkā)</h2>
          {saved.length === 0 ? (
            <p className="text-sm text-gray-600">Vēl nav saglabātu tāmju.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left border-b">
                    <th className="py-2 pr-4">Fails</th>
                    <th className="py-2 pr-4">Tāmētājs</th>
                    <th className="py-2 pr-4">Datums</th>
                    <th className="py-2">Darbības</th>
                  </tr>
                </thead>
                <tbody>
                  {saved.map((e) => (
                    <tr key={e.id} className="border-b last:border-b-0">
                      <td className="py-2 pr-4 font-mono">{e.filename}</td>
                      <td className="py-2 pr-4">{e.estimator}</td>
                      <td className="py-2 pr-4">
                        {new Date(e.createdAtISO).toLocaleString()}
                      </td>
                      <td className="py-2">
                        <button
                          onClick={() => downloadSaved(e.id)}
                          className="px-3 py-1 rounded-xl bg-gray-900 text-white"
                        >
                          Lejupielādēt
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <footer className="pb-10 text-xs text-gray-500">
          <p>
            Piezīme: šī versija glabā tāmju failus lokāli (LocalStorage). Ja vēlies glabāt uz
            servera un dalīties starp darbiniekiem, pieslēdz Supabase Storage un saglabā
            base64 saturu kā failu bucketā, pievienojot rindu datubāzē ar metadatiem.
          </p>
        </footer>
      </div>
    </div>
  );
}
