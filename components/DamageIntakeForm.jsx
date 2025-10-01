import React, { useEffect, useMemo, useState } from "react";

// ==========================
//  Damage Intake – STEP WIZARD (1..12)
//  BALTA pricing via public/prices/balta.json
//  UI hides ALL prices; expert enters ONLY quantities/units.
//  Excel export uses a BALTA-style template with styles & VAT.
// ==========================

const INSURERS = ["Swedbank", "Gjensidige", "Compensa", "IF", "BTA", "Balta"];
const LOCATION_TYPES = ["Komerctelpa", "Dzīvojamā ēka"];
const DWELLING_SUBTYPES = ["Privātmāja", "Daudzdzīvokļu māja", "Rindu māja", "Cits"];
const INCIDENT_TYPES = ["CTA", "Plūdi", "Uguns", "Koks", "Cits"];
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

function prettyDate(d = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}`;
}

// Normalise units (Excel has variants like m² / m2, gb. / gab)
function normalizeUnit(u) {
  if (!u) return "";
  const x = String(u).trim().toLowerCase().replace("²", "2").replace("\u00A0", " ").replace("  ", " ");
  if (x === "gb." || x === "gab." || x === "gab") return "gab";
  if (x === "m2" || x === "m 2" || x === "m^2") return "m2";
  if (x === "m3" || x === "m 3" || x === "m^3") return "m3";
  if (x === "m") return "m";
  if (x === "kpl" || x === "kpl.") return "kpl";
  if (x === "diena") return "diena";
  if (x === "c/h") return "c/h";
  if (x === "obj." || x === "obj") return "obj";
  return x;
}
const DEFAULT_UNITS = ["m2", "m3", "m", "gab", "kpl", "diena", "obj", "c/h"];

// LocalStorage helpers
const STORAGE_KEY = "tames_profils_saglabatie"; // [{id, filename, createdAtISO, estimator, base64}]
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
  const [claimNumber, setClaimNumber] = useState(""); // Lietas Nr.

  // Core fields
  const [address, setAddress] = useState(""); // 1
  const [insurer, setInsurer] = useState("Balta"); // 2
  const [locationType, setLocationType] = useState(""); // 3
  const [dwellingSubtype, setDwellingSubtype] = useState(""); // 3.1
  const [dwellingOther, setDwellingOther] = useState(""); // 3.1.1
  const [incidentType, setIncidentType] = useState(""); // 4
  const [incidentOther, setIncidentOther] = useState(""); // 4.1
  const [electricity, setElectricity] = useState("Nē"); // 5
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

  // Visible list of selected room instances
  // structure: { id, type, index, note?: string }
  const [roomInstances, setRoomInstances] = useState([]);

  // Per-room priced rows:
  // { [roomId]: Array<{category,itemId,itemName,quantity,unit,unit_price|null}> }
  const [roomActions, setRoomActions] = useState({});

  // Which room is currently being edited (for step 11)
  const [editingRoomId, setEditingRoomId] = useState(null);

  // Pricing catalog (Balta)
  const [priceCatalog, setPriceCatalog] = useState([]); // {id,category,name,unit,unit_price}[]
  const [catalogError, setCatalogError] = useState("");

  // Resolve asset base (root or /eksperti on GitHub Pages)
  const assetBase =
    typeof window !== "undefined" &&
    (window.location.hostname.endsWith("github.io") || window.location.pathname.startsWith("/eksperti"))
      ? "/eksperti"
      : "";

useEffect(() => {
  if (insurer !== "Balta") {
    setPriceCatalog([]);
    return;
  }
  setCatalogError("");
  fetch("prices/balta.json")
    .then((r) => {
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      return r.json();
    })
.then((data) => {
  const items = Array.isArray(data.items) ? data.items : [];
  const mapped = items.map((it, i) => ({
    ...it,
    // atbalstām gan en, gan lv nosaukumus
    labor: Number(it.labor ?? it.Darbs ?? 0),
    materials: Number(it.materials ?? it.Materiāli ?? it.Materāli ?? 0),
    mechanisms: Number(it.mechanisms ?? it.Mehānismi ?? it.Mehanismi ?? 0),
    unit_price: Number(it.unit_price ?? it.Cena ?? 0),
    unit: normalizeUnit(it.unit),
    uid: `${it.category}::${it.id || i}`,
  }));
  setPriceCatalog(mapped);
})


    .catch((e) => setCatalogError(`Neizdevās ielādēt BALTA cenas: ${e.message}`));
}, [insurer]);

 const categories = useMemo(() => {
  const set = new Set(priceCatalog.map((i) => i.category).filter(Boolean));
  return Array.from(set);
}, [priceCatalog]);

  const allUnits = useMemo(() => {
    const set = new Set(DEFAULT_UNITS);
    priceCatalog.forEach((i) => i.unit && set.add(normalizeUnit(i.unit)));
    return Array.from(set);
  }, [priceCatalog]);

  // Saved estimates (local profile)
  const [saved, setSaved] = useState([]);
  useEffect(() => setSaved(loadSaved()), []);

  // Build room instances when rooms selection changes (preserve notes & actions)
  useEffect(() => {
    const instances = [];
    Object.entries(rooms).forEach(([type, meta]) => {
      if (!meta.checked) return;
      const cnt = Math.max(1, Number(meta.count) || 1);
      for (let i = 1; i <= cnt; i++) {
        const id = `${type}-${i}`;
        const existing = roomInstances.find((r) => r.id === id);
        instances.push({
          id,
          type: type === "Cits" ? meta.custom || "Cits" : type,
          index: i,
          note: existing?.note || "",
        });
      }
    });
    setRoomInstances(instances);
    setRoomActions((prev) => {
      const next = {};
      instances.forEach((ri) => {
        next[ri.id] = prev[ri.id] || [
          { category: "", itemId: "", itemName: "", quantity: "", unit: "", unit_price: null },
        ];
      });
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rooms]);

  // Actions helpers
  function addActionRow(roomId, presetCategory = "") {
    setRoomActions((ra) => ({
      ...ra,
      [roomId]: [
        ...(ra[roomId] || []),
        { category: presetCategory || "", itemId: "", itemName: "", quantity: "", unit: "", unit_price: null },
      ],
    }));
  }
  function removeActionRow(roomId, idx) {
    setRoomActions((ra) => {
      const list = ra[roomId] || [];
      if (list.length <= 1) return ra; // keep at least one
      return { ...ra, [roomId]: list.filter((_, i) => i !== idx) };
    });
  }
  function setRowField(roomId, idx, key, value) {
    setRoomActions((ra) => {
      const list = [...(ra[roomId] || [])];
      const nextRow = { ...list[idx], [key]: value };
      list[idx] = nextRow;
      return { ...ra, [roomId]: list };
    });
  }
function setRowCategory(roomId, idx, category) {
  setRoomActions((ra) => {
    const list = [...(ra[roomId] || [])];
    list[idx] = {
      ...list[idx],
      category,
      itemUid: "",      // <- svarīgi
      itemId: "",
      itemName: "",
      unit: "",
      unit_price: null,
      labor: 0,
      materials: 0,
      mechanisms: 0,
    };
    return { ...ra, [roomId]: list };
  });
}

function setRowItem(roomId, idx, itemKey) {
  const item = priceCatalog.find((i) => i.uid === itemKey || i.id === itemKey);
  setRoomActions((ra) => {
    const list = [...(ra[roomId] || [])];
    if (item) {
      list[idx] = {
        ...list[idx],
        itemUid: item.uid,
        itemId: item.id,
        itemName: item.name,
        unit: item.unit || "",
        unit_price: item.unit_price ?? null,
        labor: Number(item.labor ?? 0),
        materials: Number(item.materials ?? 0),
        mechanisms: Number(item.mechanisms ?? 0),
      };
    } else {
      list[idx] = {
        ...list[idx],
        itemUid: "",
        itemId: "",
        itemName: "",
        unit: "",
        unit_price: null,
        labor: 0,
        materials: 0,
        mechanisms: 0,
      };
    }
    return { ...ra, [roomId]: list };
  });
}



  function setRoomNote(roomId, note) {
    setRoomInstances((arr) => arr.map((ri) => (ri.id === roomId ? { ...ri, note } : ri)));
  }

  // Delete a specific room instance and reindex actions/rooms
  function removeRoomInstance(roomId) {
    const [baseType, idxStr] = String(roomId).split("-");
    const idx = parseInt(idxStr, 10) || 1;

    // Reindex action keys for this type
    setRoomActions((ra) => {
      const next = { ...ra };
      // find current count from state
      const curCount = rooms[baseType]?.checked ? (Number(rooms[baseType]?.count) || 1) : 0;
      if (curCount <= 0) return next;

      for (let i = idx + 1; i <= curCount; i++) {
        const fromKey = `${baseType}-${i}`;
        const toKey = `${baseType}-${i - 1}`;
        if (next[fromKey]) next[toKey] = next[fromKey];
      }
      delete next[`${baseType}-${curCount}`];
      return next;
    });

    // Decrease rooms count / uncheck if becomes zero
    setRooms((prev) => {
      const cur = prev[baseType];
      if (!cur) return prev;
      const nextCount = (Number(cur.count) || 1) - 1;
      const copy = { ...prev };
      if (nextCount <= 0) {
        copy[baseType] = { ...cur, checked: false, count: 1 };
      } else {
        copy[baseType] = { ...cur, checked: true, count: nextCount };
      }
      return copy;
    });

    // If currently editing the removed one, exit editor
    setEditingRoomId((id) => (id === roomId ? null : id));
  }

  // Validation per step
  const totalSteps = 12;
  const stepValid = useMemo(() => {
    switch (step) {
      case 1:
        return !!address.trim();
      case 2:
        return !!insurer;
      case 3:
        return !!locationType && (locationType !== "Dzīvojamā ēka" || !!dwellingSubtype);
      case 4:
        return !!incidentType && (incidentType !== "Cits" || !!incidentOther.trim());
      case 5:
        return ["Jā", "Nē"].includes(electricity);
      case 6:
        return ["Jā", "Nē"].includes(needsDrying);
      case 7:
        return ["Jā", "Nē"].includes(commonPropertyDamaged);
      case 8:
        return lossKnown === "Nē" || (lossKnown === "Jā" && !!lossAmount && Number(lossAmount) >= 0);
      case 9:
        return Object.values(rooms).some((r) => r.checked);
      default:
        return true;
    }
  }, [
    step,
    address,
    insurer,
    locationType,
    dwellingSubtype,
    incidentType,
    incidentOther,
    electricity,
    needsDrying,
    commonPropertyDamaged,
    lossKnown,
    lossAmount,
    rooms,
  ]);

  // Suggested categories (kept simple; no "areas" UI)
  function suggestedCategoriesFor(/* roomId */) {
    return []; // you can implement suggestions later if needed
  }

  // ===== Excel export (BALTA template; only filled rows) =====
// REPLACE your exportToExcel with this version
// Dizaina iestatījumi (var ātri pieregulēt)
const ZEBRA = true;                 // ieslēdz/izslēdz ik-otrās rindas vieglu fonu
const SECTION_BG = "FFF3F6FD";      // telpas virsrindas fons (maigi zils)
const ZEBRA_BG = "FFF9FAFB";        // zebra rindas fons
const FONT = { name: "Calibri", size: 11 };
const MONEY_FMT = "#,##0.00";
const QTY_FMT = "#,##0.00";

async function exportToExcel() {
  try {
    const ExcelJSImport = await import("exceljs/dist/exceljs.min.js");
    const ExcelJS = ExcelJSImport?.default || ExcelJSImport;

    // ===== ielādē sagatavi =====
    const assetBase =
      typeof window !== "undefined" &&
      (window.__NEXT_DATA__?.assetPrefix || window.location.pathname.startsWith("/eksperti"))
        ? "/eksperti"
        : "";
    const tplUrl = `${assetBase}/templates/balta_template.xlsx`;
    const resp = await fetch(tplUrl);
    if (!resp.ok) {
      alert(`Neizdevās ielādēt ${tplUrl}. Pārliecinies, ka fails ir public/templates/balta_template.xlsx`);
      return;
    }

    const arrayBuf = await resp.arrayBuffer();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(arrayBuf);

    const src = wb.getWorksheet("Tāme") || wb.worksheets[0];
    const ws = wb.addWorksheet("Tāme (izvade)", { views: [{ showGridLines: false }] });

    // ===== konstantes/stili =====
    const ZEBRA = true;
    const ZEBRA_BG = "FFF9FAFB";
    const SECTION_BG = "FFF3F6FD";
    const HEADER_BG = "FFEFEFEF";
    const MONEY_FMT = "#,##0.00";
    const QTY_FMT = "#,##0.00";
    const FONT = { name: "Calibri", size: 11 };
    const thin = { style: "thin" };
    const borderAll = { top: thin, left: thin, bottom: thin, right: thin };
    const sectionFill = { type: "pattern", pattern: "solid", fgColor: { argb: SECTION_BG } };
    const headerFill  = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_BG } };

    // ===== Header =====
    const humanDate = new Date().toLocaleDateString("lv-LV", { year: "numeric", month: "long", day: "numeric" });
    const pad2 = (n) => String(n).padStart(2, "0");
    const d = new Date();
    const tamesNr = `${pad2(d.getDate())}${pad2(d.getMonth() + 1)}${d.getFullYear()}`; // 26092025

    ws.getCell("A1").value = `Pasūtītājs: ${insurer || "Balta"}`;
    ws.getCell("A2").value = `Objekts: ${locationType || ""}${dwellingSubtype ? " – " + dwellingSubtype : ""}`;
    ws.getCell("A3").value = `Objekta adrese: ${address || ""}`;
    ws.getCell("A8").value = `Rīga, ${humanDate}`;
    ws.getCell("A9").value = `Pamatojums: apdrošināšanas lieta Nr. ${claimNumber || "—"}`;

    // LV GROUP labajā pusē
    ws.getCell("J1").value = "LV GROUP SIA";
    ws.getCell("J2").value = "Reģ. Nr.: LV40003216553";
    ws.getCell("J3").value = "Banka: Luminor";
    ws.getCell("J4").value = "Konts: LV12RIKO0002012345678";

    // Lielais virsraksts centrā (B6..L6)
    ws.mergeCells(6, 2, 6, 12);
    const tCell = ws.getCell(6, 2);
    tCell.value = `TĀME Nr. ${tamesNr}`;
    tCell.font = { ...FONT, size: 16, bold: true };
    tCell.alignment = { horizontal: "center", vertical: "middle" };

    // ===== Savācam rindas no formas =====
// ===== Savācam rindas no formas =====
const selections = [];
roomInstances.forEach((ri) => {
  (roomActions[ri.id] || []).forEach((a) => {
    const qty = Number(a.quantity) || 0;
    if (qty <= 0) return;

    const item = priceCatalog.find((i) => i.uid === a.itemUid) ||
                 priceCatalog.find((i) => i.id === a.itemId);
    if (!item) return;

    const unit = normalizeUnit(a.unit || item.unit || "");

    // ņemam no rindas, ja ir; citādi no kataloga
    const labor = Number(a.labor ?? item.labor ?? 0);
    const materials = Number(a.materials ?? item.materials ?? 0);
    const mechanisms = Number(a.mechanisms ?? item.mechanisms ?? 0);

    // ja ir sadalījums → E/F/G; ja nav → E = unit_price
    const unitPrice = (labor || materials || mechanisms)
      ? (labor + materials + mechanisms)
      : Number(a.unit_price ?? item.unit_price ?? 0);

    selections.push({
      room: `${ri.type} ${ri.index}`,
      name: a.itemName || item.name || "",
      unit,
      qty,
      labor,
      materials,
      mechanisms,
      unitPrice,
    });
  });
});

if (!selections.length) {
  alert("Nav nevienas pozīcijas ar daudzumu.");
  return;
}
selections.sort((a, b) => a.room.localeCompare(b.room) || a.name.localeCompare(b.name));


    if (!selections.length) {
      alert("Nav nevienas pozīcijas ar daudzumu.");
      return;
    }
    selections.sort((a, b) => a.room.localeCompare(b.room) || a.name.localeCompare(b.name));

    // ===== Kolonnu galvenes (2 rindas) =====
    const START = 15;               // 1. datu rinda
    const HEAD1 = START - 2;        // augšējais virsraksts
    const HEAD2 = START - 1;        // apakšvirsraksti
    const COLS = 12;

    ws.getCell(HEAD1, 1).value = "Nr.";
    ws.getCell(HEAD1, 2).value = "Darbu nosaukums";
    ws.getCell(HEAD1, 3).value = "Mērv.";
    ws.getCell(HEAD1, 4).value = "Daudz.";

    ws.mergeCells(HEAD1, 5, HEAD1, 8);
    ws.getCell(HEAD1, 5).value = "Vienības cena, EUR";

    ws.mergeCells(HEAD1, 9, HEAD1, 12);
    ws.getCell(HEAD1, 9).value = "Summa, EUR";

    ws.getCell(HEAD2, 5).value  = "Darbs";
    ws.getCell(HEAD2, 6).value  = "Materiāli";
    ws.getCell(HEAD2, 7).value  = "Mehānismi";
    ws.getCell(HEAD2, 8).value  = "Cena";

    ws.getCell(HEAD2, 9).value  = "Darbs";
    ws.getCell(HEAD2, 10).value = "Materiāli";
    ws.getCell(HEAD2, 11).value = "Mehānismi";
    ws.getCell(HEAD2, 12).value = "Kopā";

    for (const rr of [HEAD1, HEAD2]) {
      const row = ws.getRow(rr);
      for (let c = 1; c <= COLS; c++) {
        const cell = row.getCell(c);
        cell.font = { ...FONT, bold: true };
        cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
        cell.fill = headerFill;
        cell.border = borderAll;
      }
      row.height = 22;
    }

    // ===== Dati (robežas tikai aizņemtajām šūnām) =====
    let r = START;
    let nr = 1;
    let first = null;
    let last = null;

    const groups = selections.reduce((acc, s) => {
      (acc[s.room] ||= []).push(s);
      return acc;
    }, {});

    for (const roomName of Object.keys(groups)) {
      // Sekcijas virsrinda (sapludināta B..L)
      ws.mergeCells(r, 2, r, 12);
      const sec = ws.getCell(r, 2);
      sec.value = roomName;
      sec.fill = sectionFill;
      sec.font = { ...FONT, bold: true };
      sec.alignment = { wrapText: true, vertical: "middle" };
      sec.border = { bottom: thin }; // tikai apakšējā
      ws.getRow(r).height = 18;
      r++;

      // Datu rindas
 for (const s of groups[roomName]) {
  const row = ws.getRow(r);

  // 1–4 kolonnas
  row.getCell(1).value = nr++;
  row.getCell(2).value = s.name;
  row.getCell(3).value = s.unit;
  row.getCell(4).value = s.qty;

  // === TE IEVIETO ŠO BLOKU (E..L) ===
  const e = s.labor || 0;
  const f = s.materials || 0;
  const g = s.mechanisms || 0;
  const hasSplit = (e + f + g) > 0;

  row.getCell(5).value = hasSplit ? e : s.unitPrice;
  row.getCell(6).value = hasSplit ? f : 0;
  row.getCell(7).value = hasSplit ? g : 0;

  row.getCell(8).value  = { formula: `ROUND(SUM(E${r}:G${r}),2)` };
  row.getCell(9).value  = { formula: `ROUND(E${r}*D${r},2)` };
  row.getCell(10).value = { formula: `ROUND(F${r}*D${r},2)` };
  row.getCell(11).value = { formula: `ROUND(G${r}*D${r},2)` };
  row.getCell(12).value = { formula: `ROUND(H${r}*D${r},2)` };

  // (pēc tam – numFmt, robežas, zebra u.c.)
  r++;
}

    }

    // ===== Kopsummas + PVN =====
    let tRow = r + 1;
    ws.getCell(`B${tRow}`).value = "Kopā";
    ws.getCell(`I${tRow}`).value = { formula: first ? `SUM(I${first}:I${last})` : "0" };
    ws.getCell(`J${tRow}`).value = { formula: first ? `SUM(J${first}:J${last})` : "0" };
    ws.getCell(`K${tRow}`).value = { formula: first ? `SUM(K${first}:K${last})` : "0" };
    ws.getCell(`L${tRow}`).value = { formula: first ? `SUM(L${first}:L${last})` : "0" };
    for (const c of [9,10,11,12]) ws.getCell(tRow, c).numFmt = MONEY_FMT;

    tRow += 2;
    ws.getCell(`B${tRow}`).value = "Tiešās izmaksas kopā";
    ws.getCell(`I${tRow}`).value = { formula: `I${tRow-2}` };
    ws.getCell(`J${tRow}`).value = { formula: `J${tRow-2}` };
    ws.getCell(`K${tRow}`).value = { formula: `K${tRow-2}` };
    ws.getCell(`L${tRow}`).value = { formula: `L${tRow-2}` };
    for (const c of [9,10,11,12]) ws.getCell(tRow, c).numFmt = MONEY_FMT;

    const pvnRow = tRow + 5;
    ws.getCell(`B${pvnRow}`).value = "PVN";
    ws.getCell(`C${pvnRow}`).value = 0.21;
    ws.getCell(`L${pvnRow}`).value = { formula: `ROUND(L${tRow}*C${pvnRow},2)` };
    ws.getCell(`L${pvnRow}`).numFmt = MONEY_FMT;

    const grandRow = pvnRow + 1;
    ws.getCell(`B${grandRow}`).value = "Pavisam kopā";
    ws.getCell(`L${grandRow}`).value = { formula: `ROUND(L${tRow}+L${pvnRow},2)` };
    ws.getCell(`L${grandRow}`).numFmt = MONEY_FMT;

    // īsais kopsavilkums augšā
    ws.getCell("J9").value = "Tāmes summa euro :";
    ws.getCell("L9").value = { formula: `L${tRow}` };    ws.getCell("L9").numFmt = MONEY_FMT;
    ws.getCell("J10").value = "PVN 21%:";
    ws.getCell("L10").value = { formula: `L${pvnRow}` }; ws.getCell("L10").numFmt = MONEY_FMT;
    ws.getCell("J11").value = "Pavisam kopā euro:";
    ws.getCell("L11").value = { formula: `L${grandRow}` }; ws.getCell("L11").numFmt = MONEY_FMT;

    // Kolonnu platumi (vienādi, bez tukšo šūnu ietekmes)
    const base = [6, 56, 12, 10, 14, 14, 14, 14, 16, 16, 16, 18];
    for (let c = 1; c <= COLS; c++) ws.getColumn(c).width = base[c - 1];

    // Izmetam avota lapu un pārdēvējam izvadi
    wb.removeWorksheet(src.id);
    ws.name = "Tāme";

    // Lejupielāde
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Tame_Balta_${prettyDate()}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error("Excel export error:", err);
    alert("Neizdevās izveidot Excel failu. Skaties konsolē kļūdu.");
  }
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
      <div style={{ maxWidth: 1000, margin: "0 auto", padding: 16 }}>
        {/* Lietas Nr. (formas sākumā) */}
        <div style={{ background: "white", padding: 12, borderRadius: 12, marginBottom: 12 }}>
          <LabeledRow label="Lietas Nr.">
            <input
              value={claimNumber}
              onChange={(e) => setClaimNumber(e.target.value)}
              placeholder="piem., CLV1234567"
              style={{ width: "100%", border: "1px solid #e5e7eb", borderRadius: 10, padding: 8 }}
            />
          </LabeledRow>
        </div>

        <header style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>Apskates forma – solis {step}/{totalSteps}</div>
            <div style={{ fontSize: 13, color: "#4b5563" }}>
              Tāmētājs ievada tikai daudzumu. Cenas netiek rādītas formā un parādīsies tikai gala tāmē.
            </div>
          </div>

          <div style={{ background: "white", padding: 12, borderRadius: 12, width: 360 }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Tāmētāja profils (neobligāti)</div>
            <input
              style={{ width: "100%", border: "1px solid #e5e7eb", borderRadius: 10, padding: 8, marginBottom: 6 }}
              placeholder="Vārds, Uzvārds"
              value={estimatorName}
              onChange={(e) => setEstimatorName(e.target.value)}
            />
            <input
              style={{ width: "100%", border: "1px solid #e5e7eb", borderRadius: 10, padding: 8 }}
              placeholder="E-pasts"
              value={estimatorEmail}
              onChange={(e) => setEstimatorEmail(e.target.value)}
            />
          </div>
        </header>

        {/* Progress bar */}
        <div style={{ height: 8, background: "#e5e7eb", borderRadius: 999, marginBottom: 16 }}>
          <div style={{ width: `${progressPct}%`, height: 8, background: "#10b981", borderRadius: 999 }} />
        </div>

        {/* Steps 1..9 */}
        {step === 1 && (
          <StepShell title="1. Objekta adrese">
            <LabeledRow label="Objekta adrese">
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Iela 1, Pilsēta"
                style={{ width: "100%", border: "1px solid #e5e7eb", borderRadius: 10, padding: 8 }}
              />
            </LabeledRow>
          </StepShell>
        )}

        {step === 2 && (
          <StepShell title="2. Apdrošināšanas kompānija">
            <LabeledRow label="Izvēlies kompāniju">
              <select
                value={insurer}
                onChange={(e) => setInsurer(e.target.value)}
                style={{ width: "100%", border: "1px solid #e5e7eb", borderRadius: 10, padding: 8, background: "white" }}
              >
                {INSURERS.map((i) => (
                  <option key={i} value={i}>
                    {i}
                  </option>
                ))}
              </select>
            </LabeledRow>
            {insurer === "Balta" && (
              <div style={{ fontSize: 12, color: catalogError ? "#b91c1c" : "#065f46" }}>
                {catalogError
                  ? catalogError
                  : priceCatalog.length
                  ? `Ielādēts BALTA cenrādis (${priceCatalog.length} pozīcijas)`
                  : "Notiek BALTA cenrāža ielāde..."}
              </div>
            )}
          </StepShell>
        )}

        {step === 3 && (
          <StepShell title="3. Kur notika negadījums?">
            <LabeledRow label="Vieta">
              <select
                value={locationType}
                onChange={(e) => setLocationType(e.target.value)}
                style={{ width: "100%", border: "1px solid #e5e7eb", borderRadius: 10, padding: 8, background: "white" }}
              >
                <option value="">— Izvēlies —</option>
                {LOCATION_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </LabeledRow>
            {locationType === "Dzīvojamā ēka" && (
              <>
                <LabeledRow label="3.1. Dzīvojamās ēkas tips">
                  <select
                    value={dwellingSubtype}
                    onChange={(e) => setDwellingSubtype(e.target.value)}
                    style={{ width: "100%", border: "1px solid #e5e7eb", borderRadius: 10, padding: 8, background: "white" }}
                  >
                    <option value="">— Izvēlies —</option>
                    {DWELLING_SUBTYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </LabeledRow>
                {dwellingSubtype === "Cits" && (
                  <LabeledRow label="3.1.1. Norādi">
                    <input
                      value={dwellingOther}
                      onChange={(e) => setDwellingOther(e.target.value)}
                      placeholder="NI tips"
                      style={{ width: "100%", border: "1px solid #e5e7eb", borderRadius: 10, padding: 8 }}
                    />
                  </LabeledRow>
                )}
              </>
            )}
          </StepShell>
        )}

        {step === 4 && (
          <StepShell title="4. Kas notika ar nekustamo īpašumu?">
            <LabeledRow label="Notikuma veids">
              <select
                value={incidentType}
                onChange={(e) => setIncidentType(e.target.value)}
                style={{ width: "100%", border: "1px solid #e5e7eb", borderRadius: 10, padding: 8, background: "white" }}
              >
                <option value="">— Izvēlies —</option>
                {INCIDENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </LabeledRow>
            {incidentType === "Cits" && (
              <LabeledRow label="4.1. Norādi">
                <input
                  value={incidentOther}
                  onChange={(e) => setIncidentOther(e.target.value)}
                  placeholder="Notikuma apraksts"
                  style={{ width: "100%", border: "1px solid #e5e7eb", borderRadius: 10, padding: 8 }}
                />
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
                  <input
                    type="radio"
                    name="common"
                    checked={commonPropertyDamaged === yn}
                    onChange={() => setCommonPropertyDamaged(yn)}
                  />{" "}
                  {yn}
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
                <input
                  type="number"
                  min={0}
                  value={lossAmount}
                  onChange={(e) => setLossAmount(e.target.value)}
                  placeholder="€ summa"
                  style={{ width: 200, border: "1px solid #e5e7eb", borderRadius: 10, padding: 8 }}
                />
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
                    <input
                      type="checkbox"
                      checked={rooms[rt].checked}
                      onChange={(e) => setRooms({ ...rooms, [rt]: { ...rooms[rt], checked: e.target.checked } })}
                    />
                    {rt}
                  </label>
                  {rooms[rt].checked && (
                    <div style={{ marginTop: 8 }}>
                      {rt === "Cits" && (
                        <input
                          placeholder="Telpas nosaukums"
                          value={rooms[rt].custom}
                          onChange={(e) => setRooms({ ...rooms, [rt]: { ...rooms[rt], custom: e.target.value } })}
                          style={{ width: "100%", border: "1px solid #e5e7eb", borderRadius: 10, padding: 8, marginBottom: 8 }}
                        />
                      )}
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span>Daudzums:</span>
                        <input
                          type="number"
                          min={1}
                          value={rooms[rt].count}
                          onChange={(e) =>
                            setRooms({
                              ...rooms,
                              [rt]: { ...rooms[rt], count: Math.max(1, Number(e.target.value || 1)) },
                            })
                          }
                          style={{ width: 90, border: "1px solid #e5e7eb", borderRadius: 10, padding: 6 }}
                        />
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
                  const count = (roomActions[ri.id] || []).filter((a) => a.itemId && a.quantity).length;
                  const suggested = suggestedCategoriesFor(ri.id);
                  return (
                    <div
                      key={ri.id}
                      style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#f9fafb" }}
                    >
                      <div style={{ display: "flex", alignItems: "center", marginBottom: 6 }}>
                        <div style={{ fontWeight: 700 }}>
                          {ri.type} {ri.index}
                        </div>
                        <button
                          type="button"
                          onClick={() => removeRoomInstance(ri.id)}
                          title="Dzēst telpu"
                          style={{
                            marginLeft: "auto",
                            padding: "4px 8px",
                            borderRadius: 8,
                            border: "1px solid #e5e7eb",
                            background: "white",
                          }}
                        >
                          Dzēst
                        </button>
                      </div>

                      <div style={{ fontSize: 13, color: "#4b5563", marginBottom: 8 }}>
                        Pozīcijas: {count}
                      </div>

                      {suggested.length > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                          {suggested.map((c) => (
                            <span
                              key={c}
                              style={{ background: "#e5e7eb", borderRadius: 999, padding: "4px 10px", fontSize: 12 }}
                            >
                              {c}
                            </span>
                          ))}
                        </div>
                      )}

                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingRoomId(ri.id);
                            setStep(11);
                          }}
                          style={{ padding: "8px 12px", borderRadius: 10, background: "#111827", color: "white", border: 0 }}
                        >
                          Atvērt
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {roomInstances.length > 0 && (
              <div style={{ marginTop: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <button
                  type="button"
                  onClick={() => setStep(9)}
                  style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #e5e7eb", background: "white" }}
                >
                  + Pievienot vēl telpu
                </button>

                {roomInstances.every((ri) => (roomActions[ri.id] || []).some((a) => a.itemId && a.quantity)) && (
                  <button
                    type="button"
                    onClick={exportToExcel}
                    style={{ padding: "12px 16px", borderRadius: 12, background: "#059669", color: "white", border: 0 }}
                  >
                    Viss pabeigts — izveidot tāmi
                  </button>
                )}
              </div>
            )}
          </StepShell>
        )}

        {step === 11 && editingRoomId && (
          <StepShell
            title={`11. Pozīcijas un apjomi – ${
              roomInstances.find((r) => r.id === editingRoomId)?.type
            } ${roomInstances.find((r) => r.id === editingRoomId)?.index}`}
          >
            <LabeledRow label="Piezīmes">
              <input
                value={roomInstances.find((r) => r.id === editingRoomId)?.note || ""}
                onChange={(e) => setRoomNote(editingRoomId, e.target.value)}
                placeholder="Papildus informācija"
                style={{ width: "100%", border: "1px solid #e5e7eb", borderRadius: 10, padding: 8 }}
              />
            </LabeledRow>

            <div style={{ fontWeight: 700, margin: "12px 0 6px" }}>Pozīcijas un apjomi</div>
{(roomActions[editingRoomId] || [
  { category: "", itemUid: "", itemId: "", itemName: "", quantity: "", unit: "", unit_price: null },
]).map((row, idx) => {
  const itemsInCategory = row.category
    ? priceCatalog.filter((it) => it.category === row.category)
    : [];

  return (
<div
  key={idx}
  style={{
    display: "grid",
    gridTemplateColumns: "1.1fr 2.2fr 1fr 0.8fr auto",
    gap: 8,
    alignItems: "end",
    marginBottom: 8,
  }}
>
  {/* Kategorija */}
  <div>
    <div style={{ fontSize: 13, marginBottom: 4 }}>Kategorija</div>
    <select
      value={row.category || ""}
      onChange={(e) => setRowCategory(editingRoomId, idx, e.target.value)}
      style={{ width: "100%", border: "1px solid #e5e7eb", borderRadius: 10, padding: 8, background: "white" }}
    >
      <option value="">— izvēlies —</option>
      {categories.map((c) => (
        <option key={c} value={c}>{c}</option>
      ))}
    </select>
  </div>

  {/* Pozīcija (filtrēta pēc kategorijas) — tikai pēc UID */}
  <div>
    <div style={{ fontSize: 13, marginBottom: 4 }}>Pozīcija</div>
    <select
      value={row.itemUid || ""}
      onChange={(e) => setRowItem(editingRoomId, idx, e.target.value)}
      style={{ width: "100%", border: "1px solid #e5e7eb", borderRadius: 10, padding: 8, background: "white" }}
    >
      <option value="">— izvēlies pozīciju —</option>
      {priceCatalog
        .filter((it) => !row.category || it.category === row.category)
        .map((it) => (
          <option key={it.uid} value={it.uid}>
            {it.name} · {it.unit || "—"}
          </option>
        ))}
    </select>
  </div>

  {/* Mērv. */}
  <div>
    <div style={{ fontSize: 13, marginBottom: 4 }}>Mērv.</div>
    <select
      value={normalizeUnit(row.unit) || ""}
      onChange={(e) => setRowField(editingRoomId, idx, "unit", normalizeUnit(e.target.value))}
      style={{ width: "100%", border: "1px solid #e5e7eb", borderRadius: 10, padding: 8, background: "white" }}
    >
      <option value="">—</option>
      {allUnits.map((u) => (
        <option key={u} value={u}>{u}</option>
      ))}
    </select>
  </div>

  {/* Daudz. */}
  <div>
    <div style={{ fontSize: 13, marginBottom: 4 }}>Daudz.</div>
    <input
      type="number"
      min={0}
      step="0.01"
      value={row.quantity}
      onChange={(e) => setRowField(editingRoomId, idx, "quantity", e.target.value)}
      style={{ width: "100%", border: "1px solid #e5e7eb", borderRadius: 10, padding: 8 }}
      placeholder="Skaitlis"
    />
  </div>

  {/* Pogas */}
  <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "flex-end" }}>
    <button
      type="button"
      onClick={() => addActionRow(editingRoomId, row.category || "")}
      style={{ padding: "8px 12px", borderRadius: 10, background: "#111827", color: "white", border: 0 }}
    >
      + Rinda
    </button>
    <button
      type="button"
      onClick={() => removeActionRow(editingRoomId, idx)}
      style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #e5e7eb", background: "white" }}
    >
      Dzēst
    </button>
    <button
      type="button"
      onClick={() => { setEditingRoomId(null); setStep(9); }}
      style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #e5e7eb", background: "white", color: "#111827" }}
    >
      + Pievienot vēl telpu
    </button>
  </div>
</div>
  );
})}


            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
              <button
                type="button"
                onClick={() => {
                  setEditingRoomId(null);
                  setStep(10);
                }}
                style={{ padding: "10px 14px", borderRadius: 10, background: "#111827", color: "white", border: 0 }}
              >
                Saglabāt un atgriezties
              </button>
            </div>
          </StepShell>
        )}

        {/* Navigation bar (hide default on steps 10 & 11) */}
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 12].includes(step) && (
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16 }}>
            <button
              type="button"
              onClick={() => setStep((s) => Math.max(1, s - 1))}
              disabled={step === 1}
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                background: step === 1 ? "#f3f4f6" : "white",
                color: "#111827",
              }}
            >
              ← Atpakaļ
            </button>
            <button
              type="button"
              onClick={() => setStep((s) => Math.min(totalSteps, s + 1))}
              disabled={!stepValid || step === totalSteps}
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                background: !stepValid || step === totalSteps ? "#9ca3af" : "#111827",
                color: "white",
                border: 0,
              }}
            >
              {step === totalSteps ? "Beigas" : "Tālāk →"}
            </button>
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
                      <td
                        style={{
                          padding: "8px 12px",
                          fontFamily:
                            "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
                        }}
                      >
                        {e.filename}
                      </td>
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
          Piezīme: cenrādis ielādējas no <code>public/prices/balta.json</code> (Balta 27.08.2024). Cenas netiek rādītas formā; tās
          parādās tikai gala tāmē.
        </footer>
      </div>
    </div>
  );
}
